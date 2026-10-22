import { describe, expect, it } from "vitest";
import { campaignSummary } from "./summary";

describe("campaignSummary", () => {
  it("adds up billed, received, paid out, still owed and margin", () => {
    expect(
      campaignSummary({
        invoices: [
          { amountCents: 600000, status: "paid" },
          { amountCents: 600000, status: "draft" },
        ],
        assignments: [
          { id: "a", feeCents: 150000 }, // paid
          { id: "b", feeCents: 120000 }, // payout lowered to 100,000, not sent yet
          { id: "c", feeCents: 200000 }, // no payout yet: the fee is owed
        ],
        payouts: [
          { assignmentId: "a", amountCents: 150000, status: "paid" },
          { assignmentId: "b", amountCents: 100000, status: "scheduled" },
        ],
      }),
    ).toEqual({ contractCents: 1200000, billedCents: 600000, receivedCents: 600000, paidOutCents: 150000, owedCents: 300000, marginCents: 750000 });
  });
});
