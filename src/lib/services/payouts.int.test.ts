import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedPayout } from "@/test/fixtures";
import { approvePayout, editPayout, rejectPayout, runDuePayouts, sendPayout } from "./payouts";

function fakePayPal(impl?: (method: string, path: string, body?: unknown) => Promise<unknown>) {
  const request = vi.fn(impl ?? (async () => ({ batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } })));
  return { pp: { request, getToken: vi.fn() } as unknown as PayPalClient, request };
}
const payoutRow = async (id: string) => (await db.select().from(schema.payouts).where(eq(schema.payouts.id, id)))[0];
const actions = async () => (await db.select().from(schema.auditEvents)).map((a) => a.action);

beforeEach(resetDb);

describe("approvePayout", () => {
  it("schedules a verified payout when the deposit has cleared, and logs who approved it", async () => {
    const { payout } = await seedPayout();
    expect(await approvePayout(payout.id, "Mei Tan")).toEqual({ ok: true });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "scheduled", approvedBy: "Mei Tan" });
    expect(await actions()).toContain("payout.approved");
  });
  it("refuses while the client deposit has not cleared (R15)", async () => {
    const { payout } = await seedPayout({ depositCleared: false });
    expect(await approvePayout(payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Client deposit not received" });
    expect((await payoutRow(payout.id)).status).toBe("awaiting_approval");
  });
  it("refuses work with no passing verification", async () => {
    const { payout } = await seedPayout({ verified: false });
    expect(await approvePayout(payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Work not verified" });
  });
  it("treats a malformed id as not found", async () => {
    expect(await approvePayout("not-a-uuid", "Mei Tan")).toEqual({ ok: false, reason: "Payout not found" });
  });
});

describe("sendPayout", () => {
  it("sends once, with the payout id as sender_batch_id, and stores the batch id", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp, request } = fakePayPal();
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(1);
    const body = request.mock.calls[0][2] as { sender_batch_header: { sender_batch_id: string } };
    expect(body.sender_batch_header.sender_batch_id).toBe(payout.id);
    expect(await payoutRow(payout.id)).toMatchObject({ status: "payout_sent", paypalBatchId: "BATCH-1" });
  });
  it("pays only once when Send now is clicked twice at the same moment", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp, request } = fakePayPal();
    const results = await Promise.all([sendPayout(pp, payout.id, "Mei Tan"), sendPayout(pp, payout.id, "Hana Aziz")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, reason: "Already sent" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("re-checks the guardrail at send time: an approved payout is blocked if the deposit flag is off", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan", depositCleared: false });
    const { pp, request } = fakePayPal();
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Client deposit not received" });
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses a payout nobody approved", async () => {
    const { payout } = await seedPayout();
    const { pp, request } = fakePayPal();
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Not approved yet" });
    expect(request).not.toHaveBeenCalled();
  });
  it("marks the payout failed with PayPal's error name when PayPal refuses it (4xx)", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp } = fakePayPal(async () => {
      throw new PayPalError(422, JSON.stringify({ name: "INSUFFICIENT_FUNDS" }));
    });
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: false, reason: "PayPal refused the payout: INSUFFICIENT_FUNDS" });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "payout_failed", statusReason: "INSUFFICIENT_FUNDS" });
  });
  it("leaves the payout as sent when PayPal's answer is unknown (5xx); the webhook settles it", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp } = fakePayPal(async () => {
      throw new PayPalError(503, "{}");
    });
    const r = await sendPayout(pp, payout.id, "Mei Tan");
    expect(r.ok).toBe(false);
    expect((await payoutRow(payout.id)).status).toBe("payout_sent");
    expect(await actions()).toContain("payout.unconfirmed");
  });
});

describe("editPayout", () => {
  it("lowering a scheduled payout sends it back for approval and logs before and after", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const r = await editPayout({ payoutId: payout.id, amountCents: 100000, date: "2026-10-30", reason: "Agreed discount", actor: "Hana Aziz", today: "2026-10-27" });
    expect(r).toEqual({ ok: true });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "awaiting_approval", approvedBy: null, amountCents: 100000, scheduledFor: "2026-10-30" });
    const [audit] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, "payout.edited"));
    expect(audit.detail).toMatchObject({ reason: "Agreed discount", before: { amountCents: 120000 }, after: { amountCents: 100000 }, approvalReset: true });
  });
  it("rejects raising the amount above the contract fee", async () => {
    const { payout } = await seedPayout();
    expect(await editPayout({ payoutId: payout.id, amountCents: 120001, date: "2026-10-30", reason: "x", actor: "Mei Tan", today: "2026-10-27" })).toEqual({
      ok: false,
      errors: ["Amount is above the contract fee"],
    });
  });
});

describe("rejectPayout", () => {
  it("holds the payout and its assignment, with the reason", async () => {
    const { payout, assignment } = await seedPayout();
    expect(await rejectPayout(payout.id, "Mei Tan", "Wrong product shown")).toEqual({ ok: true });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "held", statusReason: "Wrong product shown" });
    const [a] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, assignment.id));
    expect(a.status).toBe("held");
  });
  it("needs a reason", async () => {
    const { payout } = await seedPayout();
    expect(await rejectPayout(payout.id, "Mei Tan", "  ")).toEqual({ ok: false, reason: "A reason is required" });
  });
});

describe("runDuePayouts", () => {
  it("sends approved payouts whose date has arrived, and nothing else", async () => {
    const due = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" }); // scheduled for 2026-10-29
    await seedPayout(); // awaiting approval: never sent automatically
    const { pp, request } = fakePayPal();
    expect(await runDuePayouts(pp, "2026-10-28")).toEqual([]);
    expect(await runDuePayouts(pp, "2026-10-29")).toEqual([{ id: due.payout.id, result: { ok: true } }]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
