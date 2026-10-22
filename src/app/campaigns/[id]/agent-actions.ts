"use server";
import { redirect } from "next/navigation";
import { aiFromEnv } from "@/lib/ai/client";
import { planApprovals } from "@/lib/ai/agent";
import { AiReadError } from "@/lib/ai/read-file";
import { writeAudit } from "@/lib/audit";
import { db } from "@/db";
import { actorFrom, backTo, text } from "@/lib/form";
import { listAgentPayouts } from "@/lib/services/agent";
import { isUuid } from "@/lib/uuid";

// R22: ask the agent; it proposes, the page shows the guardrail result per payout, a person approves.
export async function askAgent(form: FormData) {
  const campaignId = text(form, "campaignId");
  const here = isUuid(campaignId) ? `/campaigns/${campaignId}/team` : "/";
  const actor = actorFrom(form);
  const instruction = text(form, "instruction").trim().slice(0, 500);
  if (!instruction) backTo(here, "Type what you want the agent to do");
  const payouts = await listAgentPayouts(campaignId);
  if (!payouts.length) backTo(here, "This campaign has no payouts for the agent to look at yet");

  let plan: Awaited<ReturnType<typeof planApprovals>>;
  try {
    plan = await planApprovals(aiFromEnv(), { instruction, payouts });
  } catch (err) {
    console.error("[ai] agent failed", err);
    backTo(here, `${err instanceof AiReadError ? err.message : "The AI couldn't be reached"}. Use the approval queue instead.`);
  }
  await writeAudit(db, {
    campaignId,
    actor: "agent",
    action: "agent.proposed",
    detail: { requestedBy: actor, instruction, payoutIds: plan.data.payoutIds, summary: plan.data.summary, readBy: plan.model },
  });
  const qs = new URLSearchParams({ plan: plan.data.payoutIds.join(","), summary: plan.data.summary.slice(0, 300) });
  redirect(`${here}?${qs.toString()}#agent`);
}
