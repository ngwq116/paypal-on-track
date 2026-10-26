import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedPayout } from "@/test/fixtures";
import { listAgentPayouts, previewApprovals } from "./agent";

beforeEach(resetDb);

describe("previewApprovals", () => {
  it("runs the guardrail on each proposed payout and never approves anything", async () => {
    const ok = await seedPayout();
    const locked = await seedPayout({ depositCleared: false });
    const done = await seedPayout({ status: "scheduled", approvedBy: "Wanz" });
    const rows = await previewApprovals(ok.campaign.id, [ok.payout.id]);
    expect(rows).toEqual([expect.objectContaining({ payoutId: ok.payout.id, check: "ok", amountCents: 120000 })]);
    expect((await previewApprovals(locked.campaign.id, [locked.payout.id]))[0].check).toBe("Client deposit not received");
    expect((await previewApprovals(done.campaign.id, [done.payout.id]))[0].check).toBe("Not waiting for approval");
  });
  it("drops payouts that belong to another campaign", async () => {
    const a = await seedPayout();
    const b = await seedPayout();
    expect(await previewApprovals(a.campaign.id, [b.payout.id])).toEqual([]);
  });
});

describe("listAgentPayouts", () => {
  it("describes each payout of the campaign for the agent", async () => {
    const { campaign, payout } = await seedPayout();
    expect(await listAgentPayouts(campaign.id)).toEqual([
      { payoutId: payout.id, payee: "@tester", deliverable: "1 Reel", amount: "$1,200.00", status: "awaiting_approval", verified: "Post checklist · Wanz", depositCleared: true },
    ]);
  });
});
