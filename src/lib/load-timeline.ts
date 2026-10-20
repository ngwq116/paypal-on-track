import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { agencyToday } from "./domain/today";
import { toTimeline } from "./events";
import { verificationLabel } from "./services/queries";
import { isUuid } from "./uuid";


export async function loadTimeline(campaignId: string) {
  // A malformed id would make Postgres throw (500); treat it as "not found" instead.
  if (!isUuid(campaignId)) return null;
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!campaign) return null;
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, campaign.clientId));

  const rows = await db
    .select({ a: schema.assignments, c: schema.creators })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId))
    .orderBy(asc(schema.creators.name), asc(schema.assignments.dueDate)); // stable rows: refreshes and drags must not reorder them

  const invoices = await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, campaignId));
  const ids = rows.map((r) => r.a.id);
  const payouts = ids.length ? await db.select().from(schema.payouts).where(inArray(schema.payouts.assignmentId, ids)) : [];
  const verified = await Promise.all(rows.map((r) => verificationLabel(r.a.id)));

  return {
    campaign,
    ...toTimeline({
      campaignId,
      today: agencyToday(),
      client: { id: client.id, name: client.name },
      assignments: rows.map(({ a, c }, i) => ({
        id: a.id,
        creatorId: c.id,
        creatorName: c.name,
        creatorType: c.type,
        deliverable: a.deliverable,
        dueDate: a.dueDate,
        status: a.status,
        feeCents: a.feeCents,
        verified: verified[i],
      })),
      invoices,
      payouts,
    }),
  };
}
