import { desc, eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { writeAudit } from "@/lib/audit";
import { compareInvoice, payoutAmountFor } from "@/lib/domain/invoice-match";
import { parseUsdToCents } from "@/lib/domain/money";
import { decidePostCheck } from "@/lib/domain/post-checklist";
import { suggestTicks, type PostObservation } from "@/lib/domain/post-precheck";
import { checkUpload, IMAGE_TYPES, INVOICE_TYPES, type UploadedFile } from "@/lib/domain/upload";
import { isUuid } from "@/lib/uuid";
import { queuePayout, type ActionResult } from "./payouts";

export async function lockAssignment(tx: Tx, assignmentId: string) {
  const [row] = await tx
    .select({ assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .where(eq(schema.assignments.id, assignmentId))
    .for("update");
  return row ?? null;
}

// R7–R9: staff upload the post screenshot and confirm the checklist. Verified → payout queued for approval.
export async function submitPostCheck(input: {
  assignmentId: string;
  file: UploadedFile | null;
  link: string;
  ticked: string[];
  intent: "verify" | "hold";
  note: string;
  actor: string;
  today: string;
}): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  if (input.file) {
    const fileError = checkUpload(input.file, IMAGE_TYPES);
    if (fileError) return { ok: false, reason: fileError };
  }
  const link = input.link.trim();
  if (link && !link.startsWith("https://")) return { ok: false, reason: "The post link must start with https://" };
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (creator.type !== "influencer" || !assignment.brief) return { ok: false, reason: "This assignment has no post checklist" };
    if (assignment.status === "verified" || assignment.status === "paid") return { ok: false, reason: "This post is already verified" };

    const decision = decidePostCheck({ brief: assignment.brief, ticked: input.ticked, intent: input.intent, note: input.note });
    if (decision.kind === "invalid") return { ok: false, reason: decision.error };
    const pass = decision.kind === "verified";

    // No new file: reuse the screenshot the AI just pre-checked. Never a held one (a hold needs a new screenshot).
    let submissionId: string;
    if (input.file) {
      const [s] = await tx
        .insert(schema.submissions)
        .values({ assignmentId: assignment.id, kind: "post_proof", fileName: input.file.name, fileType: input.file.type, file: input.file.bytes, link: link || null, submittedBy: input.actor })
        .returning({ id: schema.submissions.id });
      submissionId = s.id;
    } else {
      const [latest] = await tx
        .select({ task: schema.verifications.task, submissionId: schema.verifications.submissionId })
        .from(schema.verifications)
        .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
        .where(eq(schema.submissions.assignmentId, assignment.id))
        .orderBy(desc(schema.verifications.createdAt))
        .limit(1);
      if (latest?.task !== "post_precheck") return { ok: false, reason: "Upload the post screenshot" };
      submissionId = latest.submissionId;
    }
    await tx.insert(schema.verifications).values({
      submissionId,
      source: "user",
      task: "post_checklist",
      pass,
      checks: { ticked: decision.ticked, missing: decision.kind === "held" ? decision.missing : [] },
      note: decision.kind === "held" ? decision.note : null,
      createdBy: input.actor,
    });
    await tx.update(schema.assignments).set({ status: pass ? "verified" : "held" }).where(eq(schema.assignments.id, assignment.id));
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: pass ? "post.verified" : "post.held",
      detail: decision.kind === "held" ? { assignmentId: assignment.id, missing: decision.missing, note: decision.note } : { assignmentId: assignment.id },
    });
    if (pass) {
      await queuePayout(tx, { campaignId: campaign.id, assignmentId: assignment.id, amountCents: assignment.feeCents, payoutDate: assignment.payoutDate, today: input.today, actor: input.actor });
    }
    return { ok: true };
  });
}

// R10–R12: staff upload the freelancer's invoice and type its fields; code compares them with the contract.
export async function submitInvoice(input: {
  assignmentId: string;
  file: UploadedFile | null;
  payee: string;
  paypalEmail: string;
  deliverable: string;
  amount: string;
  currency?: string; // what the invoice is billed in; staff-typed invoices are USD
  reader?: { model: string; confidence: number }; // set when the AI read the invoice
  actor: string;
  today: string;
}): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  if (!input.file) return { ok: false, reason: "Upload the invoice" };
  const fileError = checkUpload(input.file, INVOICE_TYPES);
  if (fileError) return { ok: false, reason: fileError };
  const amountCents = parseUsdToCents(input.amount);
  if (amountCents === null) return { ok: false, reason: "Enter the invoiced amount like 1,200.00" };
  const file = input.file;

  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (creator.type !== "freelancer") return { ok: false, reason: "Influencers are verified with the post checklist" };
    if (assignment.status === "verified" || assignment.status === "paid") return { ok: false, reason: "This work is already verified" };

    const invoice = { payee: input.payee, paypalEmail: input.paypalEmail, deliverable: input.deliverable, currency: input.currency ?? "USD", amountCents };
    const result = compareInvoice(
      { payee: creator.name, paypalEmail: creator.paypalEmail, deliverable: assignment.deliverable, currency: campaign.currency, feeCents: assignment.feeCents },
      invoice,
    );

    const [submission] = await tx
      .insert(schema.submissions)
      .values({ assignmentId: assignment.id, kind: "invoice", fileName: file.name, fileType: file.type, file: file.bytes, submittedBy: input.actor })
      .returning();
    await tx.insert(schema.verifications).values({
      submissionId: submission.id,
      source: input.reader ? "ai" : "user",
      task: "invoice_match",
      pass: result.match,
      checks: { fields: result.fields, invoice, ...(input.reader ? { reader: input.reader } : {}) },
      createdBy: input.actor,
    });
    await tx.update(schema.assignments).set({ status: result.match ? "verified" : "held" }).where(eq(schema.assignments.id, assignment.id));
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: result.match ? "invoice.matched" : "invoice.held",
      detail: {
        assignmentId: assignment.id,
        mismatches: result.fields.filter((f) => !f.ok),
        ...(input.reader ? { readBy: input.reader.model, confidence: input.reader.confidence } : {}),
      },
    });
    if (result.match) {
      await queuePayout(tx, { campaignId: campaign.id, assignmentId: assignment.id, amountCents: assignment.feeCents, payoutDate: assignment.payoutDate, today: input.today, actor: input.actor });
    }
    return { ok: true };
  });
}

// R12: a held invoice can be paid anyway with a written reason. Pays min(invoiced, fee), never more than the contract.
export async function overrideInvoice(input: { assignmentId: string; reason: string; actor: string; today: string }): Promise<ActionResult> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "A reason is required to override" };
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };

  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const [latest] = await tx
      .select({ submissionId: schema.verifications.submissionId, task: schema.verifications.task, pass: schema.verifications.pass, checks: schema.verifications.checks })
      .from(schema.verifications)
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
      .where(eq(schema.submissions.assignmentId, row.assignment.id))
      .orderBy(desc(schema.verifications.createdAt))
      .limit(1);
    if (row.assignment.status !== "held" || !latest || latest.task !== "invoice_match" || latest.pass) {
      return { ok: false, reason: "There is no held invoice to override" };
    }
    const invoicedCents = (latest.checks as { invoice: { amountCents: number } }).invoice.amountCents;
    const amountCents = payoutAmountFor(row.assignment.feeCents, invoicedCents);

    await tx.insert(schema.verifications).values({ submissionId: latest.submissionId, source: "user", task: "invoice_override", pass: true, note: reason, createdBy: input.actor });
    await tx.update(schema.assignments).set({ status: "verified" }).where(eq(schema.assignments.id, row.assignment.id));
    await writeAudit(tx, { campaignId: row.campaign.id, actor: input.actor, action: "invoice.override", detail: { assignmentId: row.assignment.id, reason, invoicedCents, payoutCents: amountCents } });
    await queuePayout(tx, { campaignId: row.campaign.id, assignmentId: row.assignment.id, amountCents, payoutDate: row.assignment.payoutDate, today: input.today, actor: input.actor });
    return { ok: true };
  });
}

// R24: the pre-check stores the screenshot and the AI's suggestions. It never verifies: pass is false until staff confirm.
export async function savePostPrecheck(input: {
  assignmentId: string;
  file: UploadedFile;
  link: string;
  observation: PostObservation;
  model: string;
  actor: string;
}): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  const fileError = checkUpload(input.file, IMAGE_TYPES);
  if (fileError) return { ok: false, reason: fileError };
  const link = input.link.trim();
  if (link && !link.startsWith("https://")) return { ok: false, reason: "The post link must start with https://" };

  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (creator.type !== "influencer" || !assignment.brief) return { ok: false, reason: "This assignment has no post checklist" };
    if (assignment.status === "verified" || assignment.status === "paid") return { ok: false, reason: "This post is already verified" };

    const ticks = suggestTicks(assignment.brief, input.observation);
    const [submission] = await tx
      .insert(schema.submissions)
      .values({ assignmentId: assignment.id, kind: "post_proof", fileName: input.file.name, fileType: input.file.type, file: input.file.bytes, link: link || null, submittedBy: input.actor })
      .returning();
    await tx.insert(schema.verifications).values({
      submissionId: submission.id,
      source: "ai",
      task: "post_precheck",
      pass: false,
      checks: { suggested: ticks.ticked, reasons: ticks.reasons, observed: input.observation, model: input.model },
      createdBy: input.actor,
    });
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: "post.precheck",
      detail: { assignmentId: assignment.id, readBy: input.model, suggested: ticks.ticked, confidence: input.observation.confidence },
    });
    return { ok: true };
  });
}
