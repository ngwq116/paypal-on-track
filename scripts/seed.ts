import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";

async function main() {
  const sandbox = process.env.SANDBOX_CREATOR_EMAIL ?? "creator@example.com";
  const clientEmail = process.env.SANDBOX_CLIENT_EMAIL ?? "client@example.com";

  await db.execute(sql`truncate audit_events, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`);

  const [client] = await db.insert(schema.clients).values({ name: "Kopi Kita Sdn Bhd", email: clientEmail }).returning();
  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Kopi Kita · Pagi Launch", startDate: "2026-10-19", endDate: "2026-11-20", depositCleared: true })
    .returning();

  const creatorRows = await db
    .insert(schema.creators)
    .values([
      { name: "@aina.eats", type: "influencer", detail: "Instagram", paypalEmail: sandbox },
      { name: "@jasonlifts", type: "influencer", detail: "TikTok", paypalEmail: sandbox },
      { name: "@mira.travels", type: "influencer", detail: "Instagram", paypalEmail: sandbox },
      { name: "Daniel Lim", type: "freelancer", detail: "Video edits", paypalEmail: sandbox },
    ])
    .returning();
  const [aina, jason, mira, daniel] = creatorRows;

  const a = await db
    .insert(schema.assignments)
    .values([
      { campaignId: campaign.id, creatorId: aina.id, deliverable: "1 Reel + 2 Stories", feeCents: 150000, dueDate: "2026-10-21", status: "paid" },
      { campaignId: campaign.id, creatorId: jason.id, deliverable: "1 TikTok video", feeCents: 120000, dueDate: "2026-10-24", status: "verified" },
      { campaignId: campaign.id, creatorId: mira.id, deliverable: "1 Reel", feeCents: 200000, dueDate: "2026-10-28", status: "scheduled" },
      { campaignId: campaign.id, creatorId: daniel.id, deliverable: "2 × 30s product video edits", feeCents: 100000, dueDate: "2026-10-27", status: "held" },
    ])
    .returning();

  await db.insert(schema.clientInvoices).values([
    { campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-16", status: "paid" },
    { campaignId: campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "draft" },
  ]);

  await db.insert(schema.payouts).values([
    { assignmentId: a[0].id, amountCents: 150000, scheduledFor: "2026-10-23", approvedBy: "Mei Tan", approvedAt: new Date("2026-10-22T09:00:00+08:00"), status: "paid" },
    { assignmentId: a[1].id, amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval" },
  ]);

  console.log(`Seeded campaign ${campaign.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
