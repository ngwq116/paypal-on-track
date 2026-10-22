import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AgentPayoutView } from "@/lib/ai/agent";
import { canPay } from "@/lib/domain/guardrails";
import { formatUsd } from "@/lib/domain/money";
import { isUuid } from "@/lib/uuid";
import { latestVerification } from "./payouts";
import { verificationLabel } from "./queries";

const payoutsOf = (campaignId: string) =>
  db
    .select({ payout: schema.payouts, assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.payouts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .where(eq(schema.assignments.campaignId, campaignId));

export async function listAgentPayouts(campaignId: string): Promise<AgentPayoutView[]> {
  if (!isUuid(campaignId)) return [];
  const rows = await payoutsOf(campaignId);
  return Promise.all(
    rows.map(async (r) => ({
      payoutId: r.payout.id,
      payee: r.creator.name,
      deliverable: r.assignment.deliverable,
      amount: formatUsd(r.payout.amountCents),
      status: r.payout.status,
      verified: await verificationLabel(r.assignment.id),
      depositCleared: r.campaign.depositCleared,
    })),
  );
}

// Dry run of canPay() as if a person approved it now. Nothing is written.
export async function previewApprovals(campaignId: string, payoutIds: string[]) {
  const ids = payoutIds.filter(isUuid);
  if (!isUuid(campaignId) || !ids.length) return [];
  const rows = await db
    .select({ payout: schema.payouts, assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.payouts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .where(and(eq(schema.assignments.campaignId, campaignId), inArray(schema.payouts.id, ids)));
  return Promise.all(
    rows.map(async ({ payout, assignment, creator, campaign }) => {
      let check = "ok";
      if (payout.status !== "awaiting_approval") check = "Not waiting for approval";
      else {
        const decision = canPay({ campaign, assignment, verification: await latestVerification(db, assignment.id), payout: { ...payout, approvedBy: "preview" } });
        if (decision.kind !== "allow") check = decision.reason;
      }
      return { payoutId: payout.id, payee: creator.name, deliverable: assignment.deliverable, amountCents: payout.amountCents, check };
    }),
  );
}
