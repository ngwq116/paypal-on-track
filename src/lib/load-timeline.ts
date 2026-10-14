import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { toTimeline } from "./events";

export async function loadTimeline(campaignId: string) {
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!campaign) return null;
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, campaign.clientId));

  const rows = await db
    .select({ a: schema.assignments, c: schema.creators })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId));

  const invoices = await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, campaignId));
  const ids = rows.map((r) => r.a.id);
  const payouts = ids.length ? await db.select().from(schema.payouts).where(inArray(schema.payouts.assignmentId, ids)) : [];

  return {
    campaign,
    ...toTimeline({
      client: { id: client.id, name: client.name },
      assignments: rows.map(({ a, c }) => ({
        id: a.id,
        creatorId: c.id,
        creatorName: c.name,
        creatorType: c.type,
        dueDate: a.dueDate,
        status: a.status,
        feeCents: a.feeCents,
      })),
      invoices,
      payouts,
    }),
  };
}
