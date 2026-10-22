import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema, type DbOrTx, type Tx } from "@/db";
import { writeAudit } from "@/lib/audit";
import { canPay, validatePayoutEdit } from "@/lib/domain/guardrails";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { createPayout } from "@/lib/paypal/payouts";
import { isUuid } from "@/lib/uuid";

export type ActionResult = { ok: true } | { ok: false; reason: string };

const NOT_FOUND = { ok: false, reason: "Payout not found" } as const;

export async function latestVerification(x: DbOrTx, assignmentId: string) {
  const [row] = await x
    .select({ pass: schema.verifications.pass, source: schema.verifications.source })
    .from(schema.verifications)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
    .where(eq(schema.submissions.assignmentId, assignmentId))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  return row ?? null;
}

// Locks the payout and its assignment row until the transaction ends, so two clicks can't both pass the checks.
async function lockPayout(tx: Tx, payoutId: string) {
  const [row] = await tx
    .select({ payout: schema.payouts, assignment: schema.assignments, campaign: schema.campaigns, creator: schema.creators })
    .from(schema.payouts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.payouts.id, payoutId))
    .for("update");
  if (!row) return null;
  const verification = await latestVerification(tx, row.assignment.id);
  const decision = canPay({ campaign: row.campaign, assignment: row.assignment, verification, payout: row.payout });
  return { ...row, decision };
}

// R9 / R12: a verified post or a matching invoice queues a payout for approval. One payout per assignment (R16).
export async function queuePayout(
  tx: Tx,
  input: { campaignId: string; assignmentId: string; amountCents: number; payoutDate: string; today: string; actor: string },
) {
  const [existing] = await tx.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, input.assignmentId)).for("update");
  if (existing && existing.status !== "held") return existing;

  const values = {
    amountCents: input.amountCents,
    scheduledFor: input.payoutDate < input.today ? input.today : input.payoutDate, // never in the past
    status: "awaiting_approval" as const,
    approvedBy: null,
    approvedAt: null,
    statusReason: null,
  };
  const [payout] = existing
    ? await tx.update(schema.payouts).set(values).where(eq(schema.payouts.id, existing.id)).returning()
    : await tx.insert(schema.payouts).values({ assignmentId: input.assignmentId, ...values }).returning();

  await writeAudit(tx, {
    campaignId: input.campaignId,
    actor: input.actor,
    action: "payout.queued",
    detail: { payoutId: payout.id, amountCents: payout.amountCents, scheduledFor: payout.scheduledFor },
  });
  return payout;
}

export async function approvePayout(payoutId: string, actor: string): Promise<ActionResult> {
  if (!isUuid(payoutId)) return NOT_FOUND;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    if (row.payout.status !== "awaiting_approval") return { ok: false, reason: "Not waiting for approval" };
    if (row.decision.kind === "deny") return { ok: false, reason: row.decision.reason }; // canPay at approval

    await tx.update(schema.payouts).set({ status: "scheduled", approvedBy: actor, approvedAt: new Date() }).where(eq(schema.payouts.id, payoutId));
    await writeAudit(tx, {
      campaignId: row.campaign.id,
      actor,
      action: "payout.approved",
      detail: { payoutId, amountCents: row.payout.amountCents, scheduledFor: row.payout.scheduledFor },
    });
    return { ok: true };
  });
}

export async function approvePayouts(ids: string[], actor: string) {
  const out: Array<{ id: string; result: ActionResult }> = [];
  for (const id of ids) out.push({ id, result: await approvePayout(id, actor) }); // one transaction each
  return out;
}

export async function rejectPayout(payoutId: string, actor: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, reason: "A reason is required" };
  if (!isUuid(payoutId)) return NOT_FOUND;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    if (row.payout.status !== "awaiting_approval" && row.payout.status !== "scheduled") {
      return { ok: false, reason: "Only a payout that hasn't been sent can be rejected" };
    }
    await tx
      .update(schema.payouts)
      .set({ status: "held", statusReason: reason.trim(), approvedBy: null, approvedAt: null })
      .where(eq(schema.payouts.id, payoutId));
    await tx.update(schema.assignments).set({ status: "held" }).where(eq(schema.assignments.id, row.assignment.id));
    await writeAudit(tx, { campaignId: row.campaign.id, actor, action: "payout.rejected", detail: { payoutId, reason: reason.trim() } });
    return { ok: true };
  });
}

function payPalErrorName(err: PayPalError): string {
  try {
    const name = (JSON.parse(err.body) as { name?: unknown }).name;
    return typeof name === "string" ? name : `HTTP ${err.status}`;
  } catch {
    return `HTTP ${err.status}`;
  }
}

// The only caller of createPayout().
export async function sendPayout(pp: PayPalClient, payoutId: string, actor: string): Promise<ActionResult> {
  if (!isUuid(payoutId)) return NOT_FOUND;

  // 1. Claim it under a row lock: a second click (or the daily run) waits here, then sees payout_sent and stops.
  const claim = await db.transaction(async (tx) => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    const { status } = row.payout;
    if (status === "payout_sent" || status === "paid") return { ok: false as const, reason: "Already sent" };
    if (status !== "scheduled") return { ok: false as const, reason: "Not approved yet" };
    if (row.decision.kind !== "allow") return { ok: false as const, reason: row.decision.reason }; // canPay right before createPayout

    await tx.update(schema.payouts).set({ status: "payout_sent", statusReason: null }).where(eq(schema.payouts.id, payoutId));
    await writeAudit(tx, { campaignId: row.campaign.id, actor, action: "payout.sending", detail: { payoutId, amountCents: row.payout.amountCents } });
    return { ok: true as const, row };
  });
  if (!claim.ok) return claim;

  // 2. Call PayPal outside the transaction. sender_batch_id = payout id, so a retry can't pay twice.
  const { payout, campaign, creator, assignment } = claim.row;
  try {
    const res = await createPayout(pp, {
      payoutId: payout.id,
      receiverEmail: creator.paypalEmail,
      amountCents: payout.amountCents,
      note: `${campaign.name} · ${assignment.deliverable}`,
      attempt: payout.attempt,
    });
    await db.update(schema.payouts).set({ paypalBatchId: res.batchId }).where(eq(schema.payouts.id, payout.id));
    await writeAudit(db, { campaignId: campaign.id, actor, action: "payout.sent", detail: { payoutId: payout.id, batchId: res.batchId, batchStatus: res.status } });
    return { ok: true };
  } catch (err) {
    if (err instanceof PayPalError && err.status >= 400 && err.status < 500) {
      const name = payPalErrorName(err);
      await db.update(schema.payouts).set({ status: "payout_failed", statusReason: name }).where(eq(schema.payouts.id, payout.id));
      await writeAudit(db, { campaignId: campaign.id, actor, action: "payout.failed", detail: { payoutId: payout.id, httpStatus: err.status, name } });
      return { ok: false, reason: `PayPal refused the payout: ${name}` };
    }
    // Timeout or 5xx: PayPal may have created the batch. Keep payout_sent; the webhook settles it.
    await writeAudit(db, { campaignId: campaign.id, actor, action: "payout.unconfirmed", detail: { payoutId: payout.id, error: String(err) } });
    return { ok: false, reason: "PayPal did not confirm the payout. Its status will update when PayPal's webhook arrives." };
  }
}

export async function editPayout(input: {
  payoutId: string;
  amountCents: number;
  date: string;
  reason: string;
  actor: string;
  today: string;
}): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  if (!isUuid(input.payoutId)) return { ok: false, errors: ["Payout not found"] };
  return db.transaction(async (tx): Promise<{ ok: true } | { ok: false; errors: string[] }> => {
    const row = await lockPayout(tx, input.payoutId);
    if (!row) return { ok: false, errors: ["Payout not found"] };
    const result = validatePayoutEdit({
      payout: row.payout,
      assignment: row.assignment,
      newAmountCents: input.amountCents,
      newDate: input.date,
      reason: input.reason,
      today: input.today,
    });
    if (!result.ok) return result;

    const after = {
      amountCents: input.amountCents,
      scheduledFor: input.date,
      ...(result.resetApproval ? { status: "awaiting_approval" as const, approvedBy: null, approvedAt: null } : {}),
    };
    await tx.update(schema.payouts).set(after).where(eq(schema.payouts.id, input.payoutId));
    await writeAudit(tx, {
      campaignId: row.campaign.id,
      actor: input.actor,
      action: "payout.edited",
      detail: {
        payoutId: input.payoutId,
        reason: input.reason.trim(),
        before: { amountCents: row.payout.amountCents, scheduledFor: row.payout.scheduledFor, status: row.payout.status },
        after: { amountCents: input.amountCents, scheduledFor: input.date },
        approvalReset: result.resetApproval,
      },
    });
    return { ok: true };
  });
}

// R25: send approved payouts whose date has arrived. Only "scheduled" (already approved) payouts are touched.
export async function runDuePayouts(pp: PayPalClient, today: string, actor = "daily run") {
  const due = await db
    .select({ id: schema.payouts.id })
    .from(schema.payouts)
    .where(and(eq(schema.payouts.status, "scheduled"), lte(schema.payouts.scheduledFor, today)));
  const out: Array<{ id: string; result: ActionResult }> = [];
  for (const { id } of due) out.push({ id, result: await sendPayout(pp, id, actor) });
  return out;
}

// A failed payout goes back to the queue as the next attempt. A person approves it again before anything is sent.
export async function retryPayout(payoutId: string, actor: string): Promise<ActionResult> {
  if (!isUuid(payoutId)) return NOT_FOUND;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    if (row.payout.status !== "payout_failed") return { ok: false, reason: "Only a failed payout can be retried" };
    const attempt = row.payout.attempt + 1;
    await tx
      .update(schema.payouts)
      .set({ status: "awaiting_approval", attempt, approvedBy: null, approvedAt: null, paypalBatchId: null, statusReason: null })
      .where(eq(schema.payouts.id, payoutId));
    await writeAudit(tx, {
      campaignId: row.campaign.id,
      actor,
      action: "payout.retry_queued",
      detail: { payoutId, attempt, previousReason: row.payout.statusReason },
    });
    return { ok: true };
  });
}
