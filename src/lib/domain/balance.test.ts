import { describe, expect, it } from "vitest";
import { balanceProposal } from "./balance";

const base = { endDate: "2026-11-20", balance: { dueDate: "2026-11-20", status: "draft" as const } };

describe("balanceProposal", () => {
  it("proposes moving the balance when a deliverable now lands after the campaign end", () => {
    expect(balanceProposal({ ...base, latest: { dueDate: "2026-11-23", creatorName: "@mira.travels" } })).toEqual({
      newEndDate: "2026-11-23",
      newDueDate: "2026-11-23",
      reason: "@mira.travels now delivers Nov 23, after the campaign end (Nov 20).",
    });
  });
  it("keeps the gap between the campaign end and the balance due date", () => {
    expect(balanceProposal({ endDate: "2026-11-20", balance: { dueDate: "2026-11-27", status: "sent" }, latest: { dueDate: "2026-11-23", creatorName: "X" } })).toMatchObject({ newDueDate: "2026-11-30" });
  });
  it("proposes nothing when everything fits, the balance is paid, or there is no balance invoice", () => {
    expect(balanceProposal({ ...base, latest: { dueDate: "2026-11-20", creatorName: "X" } })).toBeNull();
    expect(balanceProposal({ ...base, balance: { dueDate: "2026-11-20", status: "paid" }, latest: { dueDate: "2026-11-23", creatorName: "X" } })).toBeNull();
    expect(balanceProposal({ ...base, balance: null, latest: { dueDate: "2026-11-23", creatorName: "X" } })).toBeNull();
    expect(balanceProposal({ ...base, latest: null })).toBeNull();
  });
});
