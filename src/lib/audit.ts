import { schema, type DbOrTx } from "@/db";

// R21: every approval, payout and invoice change. Call it inside the same transaction as the change.
export async function writeAudit(
  x: DbOrTx,
  e: { campaignId: string | null; actor: string; action: string; detail?: Record<string, unknown> },
): Promise<void> {
  await x.insert(schema.auditEvents).values({ campaignId: e.campaignId, actor: e.actor, action: e.action, detail: e.detail ?? {} });
}
