import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "./client";
import { planApprovals, type AgentPayoutView } from "./agent";

const payouts: AgentPayoutView[] = [
  { payoutId: "p1", payee: "@jasonlifts", deliverable: "1 TikTok video", amount: "$1,200.00", status: "awaiting_approval", verified: "Post checklist · Wanz", depositCleared: true },
  { payoutId: "p2", payee: "Daniel Lim", deliverable: "2 × 30s product video edits", amount: "$1,000.00", status: "awaiting_approval", verified: "Not verified", depositCleared: true },
];
const ai = (reply: unknown) => {
  const create = vi.fn();
  create.mockResolvedValue({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] });
  return { ai: { messages: { create } } as unknown as AiClient, create };
};

describe("planApprovals", () => {
  it("gives the model the payout list and the instruction, marked as a request", async () => {
    const { ai: client, create } = ai({ payoutIds: ["p1"], summary: "Jason's post is verified." });
    await planApprovals(client, { instruction: "pay everyone verified", payouts });
    const text = create.mock.calls[0][0].messages[0].content[0].text as string;
    expect(text).toContain('"payoutId":"p1"');
    expect(text).toContain('"""pay everyone verified"""');
  });
  it("keeps only ids from the list, once each, whatever the model returns", async () => {
    const { ai: client } = ai({ payoutIds: ["p1", "p1", "x-not-ours", "p2"], summary: "s" });
    expect((await planApprovals(client, { instruction: "approve all", payouts })).data.payoutIds).toEqual(["p1", "p2"]);
  });
});
