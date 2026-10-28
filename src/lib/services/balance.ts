import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { balanceProposal } from "@/lib/domain/balance";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { updateInvoiceDueDate } from "@/lib/paypal/invoicing";
import { isUuid } from "@/lib/uuid";
import type { ActionResult } from "./payouts";

export async function getBalanceProposal(campaignId: string) {
  if (!isUuid(campaignId)) return null;
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!campaign) return null;
  const [balance] = await db
    .select()
    .from(schema.clientInvoices)
    .where(and(eq(schema.clientInvoices.campaignId, campaignId), eq(schema.clientInvoices.kind, "balance")));
  const [latest] = await db
    .select({ dueDate: schema.assignments.dueDate, creatorName: schema.creators.name })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId))
    .orderBy(desc(schema.assignments.dueDate))
    .limit(1);
  return { campaign, balance: balance ?? null, proposal: balanceProposal({ endDate: campaign.endDate, latest: latest ?? null, balance: balance ?? null }) };
}

// PayPal first, then our records: if PayPal refuses, nothing changes on either side.
// If our write fails after PayPal accepted, PayPal's due date is put back so the two still agree.
export async function approveBalanceMove(pp: PayPalClient, input: { campaignId: string; newDueDate: string; actor: string }): Promise<ActionResult> {
  const current = await getBalanceProposal(input.campaignId);
  if (!current?.proposal || !current.balance || current.proposal.newDueDate !== input.newDueDate) {
    return { ok: false, reason: "This proposal is out of date. Reload the page." };
  }
  const { campaign, balance, proposal } = current;
  if (balance.paypalInvoiceId) {
    try {
      await updateInvoiceDueDate(pp, balance.paypalInvoiceId, proposal.newDueDate);
    } catch (err) {
      console.error("[paypal] invoice due date update failed", err);
      return { ok: false, reason: err instanceof PayPalError ? `PayPal refused the new due date (HTTP ${err.status})` : "PayPal couldn't be reached" };
    }
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(schema.campaigns).set({ endDate: proposal.newEndDate }).where(eq(schema.campaigns.id, campaign.id));
      await tx.update(schema.clientInvoices).set({ dueDate: proposal.newDueDate }).where(eq(schema.clientInvoices.id, balance.id));
      await writeAudit(tx, {
        campaignId: campaign.id,
        actor: input.actor,
        action: "invoice.due_date_moved",
        detail: { reason: proposal.reason, before: { dueDate: balance.dueDate, campaignEnd: campaign.endDate }, after: { dueDate: proposal.newDueDate, campaignEnd: proposal.newEndDate }, paypalInvoiceId: balance.paypalInvoiceId },
      });
    });
  } catch (err) {
    console.error("[balance] saving the move failed", err);
    if (!balance.paypalInvoiceId) return { ok: false, reason: "Couldn't save the move. Try again." };
    try {
      await updateInvoiceDueDate(pp, balance.paypalInvoiceId, balance.dueDate);
      return { ok: false, reason: "Couldn't save the move, so PayPal's due date was put back. Try again." };
    } catch (undoErr) {
      console.error("[paypal] putting the due date back failed", undoErr);
      return { ok: false, reason: `Couldn't save the move, and PayPal still shows ${proposal.newDueDate}. Set it back to ${balance.dueDate} in PayPal.` };
    }
  }
  return { ok: true };
}
