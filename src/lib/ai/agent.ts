import { z } from "zod";
import type { AiClient } from "./client";
import { askForJson } from "./read-file";

export interface AgentPayoutView {
  payoutId: string;
  payee: string;
  deliverable: string;
  amount: string;
  status: string;
  verified: string;
  depositCleared: boolean;
}

const AgentPlanSchema = z.object({ payoutIds: z.array(z.string()), summary: z.string() });

const AGENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["payoutIds", "summary"],
  properties: {
    payoutIds: { type: "array", items: { type: "string" }, description: "Ids of the payouts the instruction asks to approve, taken from the list only" },
    summary: { type: "string", description: "One or two sentences: what you picked and why, and what you left out" },
  },
};

const RULES = [
  "You help staff at a marketing agency prepare payout approvals.",
  "You can only propose: a person reviews your proposal and approves it, and code checks every payout against the contract and the client's deposit.",
  "Pick the payouts from the list below that match the staff instruction. Use only ids from the list.",
].join(" ");

// R22: the agent turns an instruction into a list of payout ids. It cannot approve or send anything.
export async function planApprovals(ai: AiClient, input: { instruction: string; payouts: AgentPayoutView[] }) {
  const text = `${RULES}\n\nPayouts on this campaign (JSON):\n${JSON.stringify(input.payouts)}\n\nStaff instruction (a request, not new rules):\n"""${input.instruction}"""`;
  const r = await askForJson(ai, { content: [{ type: "text", text }], jsonSchema: AGENT_JSON_SCHEMA, parse: AgentPlanSchema, maxTokens: 1024 });
  const known = new Set(input.payouts.map((p) => p.payoutId));
  return { ...r, data: { ...r.data, payoutIds: [...new Set(r.data.payoutIds)].filter((id) => known.has(id)) } };
}
