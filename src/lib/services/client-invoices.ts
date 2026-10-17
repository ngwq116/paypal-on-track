import { and, eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { writeAudit } from "@/lib/audit";
import type { PayPalClient } from "@/lib/paypal/client";
import { createInvoice, getInvoiceStatus, getInvoiceViewUrl, invoiceNumberFor, isPaidStatus, sendInvoice } from "@/lib/paypal/invoicing";
import { isUuid } from "@/lib/uuid";
import type { ActionResult } from "./payouts";

// Creates the PayPal invoice once (row lock + stored id), so a double click or a retry never makes two.
async function ensurePayPalInvoice(pp: PayPalClient, campaignId: string, kind: "deposit" | "balance", actor: string, today: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ inv: schema.clientInvoices, campaign: schema.campaigns, client: schema.clients })
      .from(schema.clientInvoices)
      .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.clientInvoices.campaignId))
      .innerJoin(schema.clients, eq(schema.clients.id, schema.campaigns.clientId))
      .where(and(eq(schema.clientInvoices.campaignId, campaignId), eq(schema.clientInvoices.kind, kind)))
      .for("update");
    if (!row) return { ok: false as const, reason: `This campaign has no ${kind} invoice` };
    if (row.inv.status !== "draft") return { ok: false as const, reason: `The ${kind} invoice was already sent` };
    if (row.inv.paypalInvoiceId) return { ok: true as const, row, paypalInvoiceId: row.inv.paypalInvoiceId, created: false };

    const created = await createInvoice(pp, {
      invoiceNumber: invoiceNumberFor(campaignId, kind),
      recipientEmail: row.client.email,
      itemName: `${row.campaign.name} · ${kind === "deposit" ? "deposit" : "balance"}`,
      amountCents: row.inv.amountCents,
      dueDate: row.inv.dueDate < today ? today : row.inv.dueDate, // PayPal won't take a due date in the past
    });
    await tx.update(schema.clientInvoices).set({ paypalInvoiceId: created.id }).where(eq(schema.clientInvoices.id, row.inv.id));
    await writeAudit(tx, { campaignId, actor, action: "invoice.created", detail: { kind, paypalInvoiceId: created.id, amountCents: row.inv.amountCents } });
    return { ok: true as const, row, paypalInvoiceId: created.id, created: true };
  });
}

// R5: one click sends the deposit invoice to the client through PayPal.
export async function sendDepositInvoice(pp: PayPalClient, campaignId: string, actor: string, today: string): Promise<ActionResult> {
  if (!isUuid(campaignId)) return { ok: false, reason: "Campaign not found" };
  const prepared = await ensurePayPalInvoice(pp, campaignId, "deposit", actor, today);
  if (!prepared.ok) return prepared;

  await sendInvoice(pp, prepared.paypalInvoiceId);
  const viewUrl = await getInvoiceViewUrl(pp, prepared.paypalInvoiceId).catch(() => null);
  await db.update(schema.clientInvoices).set({ status: "sent", paypalViewUrl: viewUrl }).where(eq(schema.clientInvoices.id, prepared.row.inv.id));
  await writeAudit(db, { campaignId, actor, action: "invoice.sent", detail: { kind: "deposit", paypalInvoiceId: prepared.paypalInvoiceId } });
  return { ok: true };
}

// R5: the balance invoice exists in PayPal as a draft with its due date; it is sent near the end.
export async function createBalanceDraft(pp: PayPalClient, campaignId: string, actor: string, today: string): Promise<ActionResult> {
  if (!isUuid(campaignId)) return { ok: false, reason: "Campaign not found" };
  const prepared = await ensurePayPalInvoice(pp, campaignId, "balance", actor, today);
  if (!prepared.ok) return prepared;
  return prepared.created ? { ok: true } : { ok: false, reason: "The balance draft already exists in PayPal" };
}

// R6 / R15: the one place an invoice becomes paid, whether the webhook or a status check noticed it.
// Returns false when we don't know the invoice. Paying twice is a no-op (no second audit entry).
export async function markInvoicePaid(tx: Tx, paypalInvoiceId: string, detail: Record<string, unknown>): Promise<boolean> {
  const [inv] = await tx.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.paypalInvoiceId, paypalInvoiceId)).for("update");
  if (!inv) return false;
  if (inv.status === "paid") return true;
  await tx.update(schema.clientInvoices).set({ status: "paid" }).where(eq(schema.clientInvoices.id, inv.id));
  if (inv.kind === "deposit") {
    await tx.update(schema.campaigns).set({ depositCleared: true }).where(eq(schema.campaigns.id, inv.campaignId)); // R15 lock opens
  }
  await writeAudit(tx, { campaignId: inv.campaignId, actor: "paypal", action: "invoice.paid", detail: { kind: inv.kind, paypalInvoiceId, ...detail } });
  return true;
}

// Backup for a missing webhook: ask PayPal whether the client has paid.
export async function checkInvoicePayment(
  pp: PayPalClient,
  campaignId: string,
  kind: "deposit" | "balance",
  actor: string,
): Promise<{ ok: true; paid: boolean } | { ok: false; reason: string }> {
  if (!isUuid(campaignId)) return { ok: false, reason: "Campaign not found" };
  const [inv] = await db
    .select()
    .from(schema.clientInvoices)
    .where(and(eq(schema.clientInvoices.campaignId, campaignId), eq(schema.clientInvoices.kind, kind)));
  if (!inv) return { ok: false, reason: `This campaign has no ${kind} invoice` };
  if (inv.status === "paid") return { ok: true, paid: true };
  if (inv.status !== "sent" || !inv.paypalInvoiceId) return { ok: false, reason: `The ${kind} invoice hasn't been sent` };

  const status = await getInvoiceStatus(pp, inv.paypalInvoiceId);
  if (!isPaidStatus(status)) return { ok: true, paid: false };
  const paypalInvoiceId = inv.paypalInvoiceId;
  await db.transaction((tx) => markInvoicePaid(tx, paypalInvoiceId, { via: "status check", paypalStatus: status, checkedBy: actor }));
  return { ok: true, paid: true };
}

// For the daily run: settle every sent invoice PayPal reports as paid. Returns how many were settled.
export async function syncSentInvoices(pp: PayPalClient, actor = "daily run"): Promise<number> {
  const sent = await db
    .select({ campaignId: schema.clientInvoices.campaignId, kind: schema.clientInvoices.kind })
    .from(schema.clientInvoices)
    .where(eq(schema.clientInvoices.status, "sent"));
  let settled = 0;
  for (const s of sent) {
    const r = await checkInvoicePayment(pp, s.campaignId, s.kind, actor);
    if (r.ok && r.paid) settled++;
  }
  return settled;
}
