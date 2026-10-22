import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { interpretEvent, type PayPalWebhookEvent } from "@/lib/paypal/webhooks";
import { isUuid } from "@/lib/uuid";
import { markInvoicePaid } from "./client-invoices";

// Idempotent: the event id is stored in the same transaction as its effects.
export async function handlePayPalEvent(event: PayPalWebhookEvent): Promise<"processed" | "duplicate" | "ignored"> {
  return db.transaction(async (tx) => {
    const fresh = await tx.insert(schema.webhookEvents).values({ id: event.id, eventType: event.event_type }).onConflictDoNothing().returning();
    if (!fresh.length) return "duplicate";

    const e = interpretEvent(event);

    if (e.kind === "invoice_paid") {
      return (await markInvoicePaid(tx, e.paypalInvoiceId, { eventId: event.id })) ? "processed" : "ignored";
    }

    if (e.kind === "payout_item") {
      const where =
        e.payoutId && isUuid(e.payoutId) ? eq(schema.payouts.id, e.payoutId) : e.batchId ? eq(schema.payouts.paypalBatchId, e.batchId) : null;
      if (!where) return "ignored";
      const [row] = await tx
        .select({ payout: schema.payouts, assignment: schema.assignments })
        .from(schema.payouts)
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
        .where(where)
        .for("update");
      if (!row) return "ignored";
      if (row.payout.status === "paid") return "processed"; // out-of-order event after success: keep paid
      // Only the attempt in flight can be settled: a late event from an earlier, failed attempt must not touch a retry.
      if (row.payout.status !== "payout_sent") return "ignored";
      if (e.batchId && row.payout.paypalBatchId && e.batchId !== row.payout.paypalBatchId) return "ignored";

      if (e.outcome === "paid") {
        await tx.update(schema.payouts).set({ status: "paid", statusReason: null }).where(eq(schema.payouts.id, row.payout.id));
        await tx.update(schema.assignments).set({ status: "paid" }).where(eq(schema.assignments.id, row.assignment.id));
      } else {
        await tx.update(schema.payouts).set({ status: "payout_failed", statusReason: e.reason }).where(eq(schema.payouts.id, row.payout.id));
      }
      await writeAudit(tx, {
        campaignId: row.assignment.campaignId,
        actor: "paypal",
        action: e.outcome === "paid" ? "payout.paid" : "payout.failed",
        detail: { payoutId: row.payout.id, paypalStatus: e.status, reason: e.reason, eventId: event.id },
      });
      return "processed";
    }

    return "ignored";
  });
}
