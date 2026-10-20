import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";

// 1×1 transparent PNG: stands in for post screenshots in seed data.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const brief = (windowStart: string, windowEnd: string) => ({
  brandTag: "@kopikita",
  hashtags: ["#KopiKitaPagi", "#ad"],
  windowStart,
  windowEnd,
});

async function main() {
  // "roster": client + creators only (demo step 1 uploads the contract). "fresh": deposit not sent. Default: mid-campaign.
  const mode = process.argv[2];
  const fresh = mode === "fresh";
  const creatorEmail = process.env.SANDBOX_CREATOR_EMAIL ?? "creator@example.com";
  const clientEmail = process.env.SANDBOX_CLIENT_EMAIL ?? "client@example.com";

  await db.execute(
    sql`truncate contracts, webhook_events, audit_events, verifications, submissions, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`,
  );

  const [client] = await db.insert(schema.clients).values({ name: "Kopi Kita Sdn Bhd", email: clientEmail }).returning();

  const [aina, jason, mira, daniel] = await db
    .insert(schema.creators)
    .values([
      { name: "@aina.eats", type: "influencer", detail: "Instagram", paypalEmail: creatorEmail },
      { name: "@jasonlifts", type: "influencer", detail: "TikTok", paypalEmail: creatorEmail },
      { name: "@mira.travels", type: "influencer", detail: "Instagram", paypalEmail: creatorEmail },
      { name: "Daniel Lim", type: "freelancer", detail: "Video edits", paypalEmail: creatorEmail },
    ])
    .returning();

  if (mode === "roster") {
    console.log("Seeded roster only: upload eval/files/contract-kopi-kita.pdf at /campaigns/new");
    process.exit(0);
  }

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Kopi Kita · Pagi Launch", startDate: "2026-10-19", endDate: "2026-11-20", depositCleared: !fresh })
    .returning();

  const [aAina, aJason] = await db
    .insert(schema.assignments)
    .values([
      { campaignId: campaign.id, creatorId: aina.id, deliverable: "1 Reel + 2 Stories", feeCents: 150000, dueDate: "2026-10-21", payoutDate: "2026-10-23", brief: brief("2026-10-20", "2026-10-22"), status: fresh ? "scheduled" : "paid" },
      { campaignId: campaign.id, creatorId: jason.id, deliverable: "1 TikTok video", feeCents: 120000, dueDate: "2026-10-24", payoutDate: "2026-10-29", brief: brief("2026-10-23", "2026-10-25"), status: fresh ? "scheduled" : "verified" },
      { campaignId: campaign.id, creatorId: mira.id, deliverable: "1 Reel", feeCents: 200000, dueDate: "2026-10-28", payoutDate: "2026-10-30", brief: brief("2026-10-27", "2026-10-29"), status: "scheduled" },
      { campaignId: campaign.id, creatorId: daniel.id, deliverable: "2 × 30s product video edits", feeCents: 100000, dueDate: "2026-10-27", payoutDate: "2026-10-31", brief: null, status: "scheduled" },
    ])
    .returning();

  await db.insert(schema.clientInvoices).values([
    { campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: fresh ? "draft" : "paid" },
    { campaignId: campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "draft" },
  ]);

  if (!fresh) {
    const proofs = await db
      .insert(schema.submissions)
      .values([aAina, aJason].map((a) => ({ assignmentId: a.id, kind: "post_proof" as const, fileName: "seed-placeholder.png", fileType: "image/png", file: PLACEHOLDER_PNG, submittedBy: "Mei Tan" })))
      .returning();
    await db.insert(schema.verifications).values(
      proofs.map((s) => ({ submissionId: s.id, source: "user" as const, task: "post_checklist" as const, pass: true, checks: { ticked: ["brandTag", "hashtags", "window"], missing: [] }, createdBy: "Mei Tan" })),
    );
    await db.insert(schema.payouts).values([
      { assignmentId: aAina.id, amountCents: 150000, scheduledFor: "2026-10-23", approvedBy: "Mei Tan", approvedAt: new Date("2026-10-22T09:00:00+08:00"), status: "paid" },
      { assignmentId: aJason.id, amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval" },
    ]);
  }

  console.log(`Seeded ${fresh ? "fresh" : "mid-campaign"} campaign ${campaign.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
