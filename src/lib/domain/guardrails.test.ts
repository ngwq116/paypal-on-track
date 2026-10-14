import { describe, it, expect } from "vitest";
import { canPay, validatePayoutEdit } from "./guardrails";
import type { Assignment, Campaign, Payout, Verification } from "./types";

const campaign: Campaign = { id: "c1", depositCleared: true };
const assignment: Assignment = { id: "a1", feeCents: 120000, status: "verified" };
const verified: Verification = { pass: true, source: "user" };
const approved: Payout = { id: "p1", amountCents: 120000, status: "scheduled", approvedBy: "mei", scheduledFor: "2026-10-29" };

describe("canPay", () => {
  it("allows an approved, verified payout within the fee when the deposit has cleared", () => {
    expect(canPay({ campaign, assignment, verification: verified, payout: approved })).toEqual({ kind: "allow" });
  });

  it("denies when the client deposit has not cleared, even if already approved", () => {
    const r = canPay({ campaign: { ...campaign, depositCleared: false }, assignment, verification: verified, payout: approved });
    expect(r).toEqual({ kind: "deny", reason: "Client deposit not received" });
  });

  it("denies when the payout was already sent", () => {
    const r = canPay({ campaign, assignment, verification: verified, payout: { ...approved, status: "payout_sent" } });
    expect(r).toEqual({ kind: "deny", reason: "Already paid" });
  });

  it("denies when the assignment is already paid", () => {
    const r = canPay({ campaign, assignment: { ...assignment, status: "paid" }, verification: verified, payout: approved });
    expect(r).toEqual({ kind: "deny", reason: "Already paid" });
  });

  it("denies when the work is not verified", () => {
    expect(canPay({ campaign, assignment, verification: null, payout: approved })).toEqual({ kind: "deny", reason: "Work not verified" });
    expect(canPay({ campaign, assignment, verification: { pass: false, source: "ai" }, payout: approved })).toEqual({ kind: "deny", reason: "Work not verified" });
  });

  it("denies when the amount is above the contract fee", () => {
    const r = canPay({ campaign, assignment, verification: verified, payout: { ...approved, amountCents: 120001 } });
    expect(r).toEqual({ kind: "deny", reason: "Exceeds contracted fee" });
  });

  it("asks for approval when nobody has approved it yet", () => {
    const r = canPay({ campaign, assignment, verification: verified, payout: { ...approved, status: "awaiting_approval", approvedBy: null } });
    expect(r).toEqual({ kind: "needs_approval", reason: "Waiting for approval" });
  });
});

describe("validatePayoutEdit", () => {
  const base = { payout: approved, assignment, newAmountCents: 100000, newDate: "2026-11-02", reason: "Creator asked to be paid after month end", today: "2026-10-27" };

  it("accepts a lower amount and a later date, and resets approval for a scheduled payout", () => {
    expect(validatePayoutEdit(base)).toEqual({ ok: true, resetApproval: true });
  });

  it("does not reset approval when the payout was still awaiting approval", () => {
    const r = validatePayoutEdit({ ...base, payout: { ...approved, status: "awaiting_approval", approvedBy: null } });
    expect(r).toEqual({ ok: true, resetApproval: false });
  });

  it("accepts today as the payout date", () => {
    expect(validatePayoutEdit({ ...base, newDate: "2026-10-27" }).ok).toBe(true);
  });

  it("rejects a date in the past", () => {
    expect(validatePayoutEdit({ ...base, newDate: "2026-10-26" })).toEqual({ ok: false, errors: ["Payout date can't be in the past"] });
  });

  it("rejects an amount above the contract fee", () => {
    expect(validatePayoutEdit({ ...base, newAmountCents: 120001 })).toEqual({ ok: false, errors: ["Amount is above the contract fee"] });
  });

  it("rejects zero, negative and fractional-cent amounts", () => {
    for (const bad of [0, -100, 100.5]) {
      expect(validatePayoutEdit({ ...base, newAmountCents: bad })).toEqual({ ok: false, errors: ["Amount must be a positive whole number of cents"] });
    }
  });

  it("rejects a blank reason", () => {
    expect(validatePayoutEdit({ ...base, reason: "   " })).toEqual({ ok: false, errors: ["A reason is required"] });
  });

  it("rejects edits to a payout that was already sent or paid", () => {
    for (const status of ["payout_sent", "paid"] as const) {
      expect(validatePayoutEdit({ ...base, payout: { ...approved, status } })).toEqual({ ok: false, errors: ["This payout was already sent"] });
    }
  });

  it("reports every problem at once", () => {
    const r = validatePayoutEdit({ ...base, newAmountCents: 0, newDate: "2026-10-01", reason: "" });
    expect(r).toEqual({ ok: false, errors: ["Amount must be a positive whole number of cents", "Payout date can't be in the past", "A reason is required"] });
  });
});
