import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { approveBalanceMove, getBalanceProposal } from "./balance";

// Lets a test make the database write fail after PayPal has accepted the new date.
const auditFails = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/audit")>();
  return { ...real, writeAudit: (...args: Parameters<typeof real.writeAudit>) => (auditFails.on ? Promise.reject(new Error("db down")) : real.writeAudit(...args)) };
});

beforeEach(async () => {
  auditFails.on = false;
  await resetDb();
});

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
    expect(await approveBalanceMove(pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Wanz" })).toEqual({ ok: true });
    expect(request).not.toHaveBeenCalled();
  });
  it("changes nothing if PayPal refuses, or if the proposal is out of date", async () => {
    const { campaign } = await lateCampaign();
    expect(await approveBalanceMove(fakePayPal(true).pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Wanz" })).toEqual({
      ok: false,
      reason: "PayPal refused the new due date (HTTP 422)",
    });
    expect((await db.select().from(schema.clientInvoices))[0].dueDate).toBe("2026-11-20");
    expect(await approveBalanceMove(fakePayPal().pp, { campaignId: campaign.id, newDueDate: "2026-11-25", actor: "Wanz" })).toEqual({
      ok: false,
      reason: "This proposal is out of date. Reload the page.",
    });
  });
  it("puts PayPal's due date back if saving the move fails", async () => {
    const { campaign } = await lateCampaign();
    const { pp, request } = fakePayPal();
    auditFails.on = true;
    const r = await approveBalanceMove(pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Wanz" });
    expect(r).toEqual({ ok: false, reason: "Couldn't save the move, so PayPal's due date was put back. Try again." });
    const puts = request.mock.calls.filter((c) => c[0] === "PUT").map((c) => ((c as unknown[])[2] as { detail: { payment_term: { due_date: string } } }).detail.payment_term.due_date);
    expect(puts).toEqual(["2026-11-23", "2026-11-20"]);
    expect((await db.select().from(schema.clientInvoices))[0].dueDate).toBe("2026-11-20");
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    expect(c.endDate).toBe("2026-11-20");
  });
});
