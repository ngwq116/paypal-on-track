import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { approveBalanceMove, getBalanceProposal } from "./balance";

beforeEach(resetDb);

// Campaign ends 2026-11-20; the assignment is pushed to 2026-11-23.
async function lateCampaign(paypalInvoiceId: string | null = "INV2-B") {
  const base = await seedAssignment();
  await db.update(schema.assignments).set({ dueDate: "2026-11-23" }).where(eq(schema.assignments.id, base.assignment.id));
  await db.insert(schema.clientInvoices).values({ campaignId: base.campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "sent", paypalInvoiceId });
  return base;
}
const fakePayPal = (fail = false) => {
  const request = vi.fn(async (method: string) => {
    if (fail && method === "PUT") throw new PayPalError(422, "{}");
    return method === "GET" ? { id: "INV2-B", detail: { payment_term: { due_date: "2026-11-20" } } } : {};
  });
  return { pp: { request } as unknown as PayPalClient, request };
};

describe("approveBalanceMove", () => {
  it("moves the campaign end and the balance due date, in PayPal first", async () => {
    const { campaign } = await lateCampaign();
    expect((await getBalanceProposal(campaign.id))?.proposal?.newDueDate).toBe("2026-11-23");
    const { pp, request } = fakePayPal();
    expect(await approveBalanceMove(pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Hana Aziz" })).toEqual({ ok: true });
    expect(request.mock.calls.map((c) => c[0])).toEqual(["GET", "PUT"]);
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    expect(c.endDate).toBe("2026-11-23");
    const [inv] = await db.select().from(schema.clientInvoices);
    expect(inv.dueDate).toBe("2026-11-23");
    expect((await db.select().from(schema.auditEvents))[0]).toMatchObject({ action: "invoice.due_date_moved", actor: "Hana Aziz" });
    expect((await getBalanceProposal(campaign.id))?.proposal).toBeNull();
  });
  it("only changes our records when the invoice isn't in PayPal yet", async () => {
    const { campaign } = await lateCampaign(null);
    const { pp, request } = fakePayPal();
    expect(await approveBalanceMove(pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Mei Tan" })).toEqual({ ok: true });
    expect(request).not.toHaveBeenCalled();
  });
  it("changes nothing if PayPal refuses, or if the proposal is out of date", async () => {
    const { campaign } = await lateCampaign();
    expect(await approveBalanceMove(fakePayPal(true).pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Mei Tan" })).toEqual({
      ok: false,
      reason: "PayPal refused the new due date (HTTP 422)",
    });
    expect((await db.select().from(schema.clientInvoices))[0].dueDate).toBe("2026-11-20");
    expect(await approveBalanceMove(fakePayPal().pp, { campaignId: campaign.id, newDueDate: "2026-11-25", actor: "Mei Tan" })).toEqual({
      ok: false,
      reason: "This proposal is out of date. Reload the page.",
    });
  });
});
