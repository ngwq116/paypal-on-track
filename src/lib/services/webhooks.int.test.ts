import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, seedPayout } from "@/test/fixtures";
import { handlePayPalEvent } from "./webhooks";

beforeEach(resetDb);

const payoutRow = async (id: string) => (await db.select().from(schema.payouts).where(eq(schema.payouts.id, id)))[0];

describe("handlePayPalEvent", () => {
  it("deposit paid: invoice paid and the campaign's payouts unlock (R6, R15)", async () => {
    const { campaign } = await seedPayout({ depositCleared: false });
    await db.insert(schema.clientInvoices).values({ campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: "sent", paypalInvoiceId: "INV2-T" });
    expect(await handlePayPalEvent({ id: "WH-1", event_type: "INVOICING.INVOICE.PAID", resource: { invoice: { id: "INV2-T" } } })).toBe("processed");
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    expect(c.depositCleared).toBe(true);
    const [audit] = await db.select().from(schema.auditEvents);
    expect(audit).toMatchObject({ actor: "paypal", action: "invoice.paid" });
  });
  it("processes the same event id only once", async () => {
    const { campaign } = await seedPayout({ depositCleared: false });
    await db.insert(schema.clientInvoices).values({ campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: "sent", paypalInvoiceId: "INV2-T" });
    const event = { id: "WH-1", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-T" } };
    expect(await handlePayPalEvent(event)).toBe("processed");
    expect(await handlePayPalEvent(event)).toBe("duplicate");
    expect(await db.select().from(schema.auditEvents)).toHaveLength(1);
  });
  it("payout succeeded: payout and assignment are paid (matched by sender_item_id)", async () => {
    const { payout, assignment } = await seedPayout({ status: "payout_sent", approvedBy: "Mei Tan" });
    await handlePayPalEvent({ id: "WH-2", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "B", payout_item: { sender_item_id: payout.id } } });
    expect((await payoutRow(payout.id)).status).toBe("paid");
    const [a] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, assignment.id));
    expect(a.status).toBe("paid");
  });
  it("matches by batch id when the item id is missing", async () => {
    const { payout } = await seedPayout({ status: "payout_sent", approvedBy: "Mei Tan", paypalBatchId: "BATCH-9" });
    expect(await handlePayPalEvent({ id: "WH-3", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "BATCH-9" } })).toBe("processed");
    expect((await payoutRow(payout.id)).status).toBe("paid");
  });
  it("a late FAILED event does not undo a paid payout", async () => {
    const { payout } = await seedPayout({ status: "paid", approvedBy: "Mei Tan" });
    await handlePayPalEvent({ id: "WH-4", event_type: "PAYMENT.PAYOUTS-ITEM.FAILED", resource: { payout_item: { sender_item_id: payout.id } } });
    expect((await payoutRow(payout.id)).status).toBe("paid");
  });
  it("payout unclaimed: failed with the PayPal status as the reason", async () => {
    const { payout } = await seedPayout({ status: "payout_sent", approvedBy: "Mei Tan" });
    await handlePayPalEvent({ id: "WH-5", event_type: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", resource: { payout_item: { sender_item_id: payout.id } } });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "payout_failed", statusReason: "UNCLAIMED" });
  });
  it("records but ignores events for things it doesn't know", async () => {
    expect(await handlePayPalEvent({ id: "WH-6", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-UNKNOWN" } })).toBe("ignored");
    expect(await handlePayPalEvent({ id: "WH-6", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-UNKNOWN" } })).toBe("duplicate");
  });
});
