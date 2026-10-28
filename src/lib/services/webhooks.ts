import { db, schema } from "@/db";
import { interpretEvent, type PayPalWebhookEvent } from "@/lib/paypal/webhooks";
import { markInvoicePaid } from "./client-invoices";
import { settlePayout } from "./payouts";

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
      return settlePayout(tx, { payoutId: e.payoutId, batchId: e.batchId }, e, { eventId: event.id });
    }

    return "ignored";
  });
}
