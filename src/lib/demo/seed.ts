import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type SeedMode = "roster" | "fresh" | "mid";

// The Reset demo button wipes every table. Only on a machine that opted in.
export const demoResetEnabled = (): boolean => process.env.DEMO_RESET === "1";

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

// "roster": client + creators only (demo step 1 uploads the contract). "fresh": deposit not sent. "mid": mid-campaign.
export async function seedDemo(mode: SeedMode, emails: { creator: string; client: string }): Promise<string | null> {
  const fresh = mode === "fresh";

  await db.execute(
    sql`truncate contracts, webhook_events, audit_events, verifications, submissions, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`,
  );

  const [client] = await db.insert(schema.clients).values({ name: "Kopi Kita Sdn Bhd", email: emails.client }).returning();

  const [aina, jason, mira, daniel] = await db
    .insert(schema.creators)
    .values([
      { name: "@aina.eats", type: "influencer", detail: "Instagram", paypalEmail: emails.creator },
      { name: "@jasonlifts", type: "influencer", detail: "TikTok", paypalEmail: emails.creator },
      { name: "@mira.travels", type: "influencer", detail: "Instagram", paypalEmail: emails.creator },
      { name: "Daniel Lim", type: "freelancer", detail: "Video edits", paypalEmail: emails.creator },
    ])
    .returning();

  if (mode === "roster") return null;

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Kopi Kita · Pagi Launch", startDate: "2026-11-16", endDate: "2026-12-18", depositCleared: !fresh })
    .returning();

  const [aAina, aJason] = await db
    .insert(schema.assignments)
    .values([
      { campaignId: campaign.id, creatorId: aina.id, deliverable: "1 Reel + 2 Stories", feeCents: 150000, dueDate: "2026-11-18", payoutDate: "2026-11-20", brief: brief("2026-11-17", "2026-11-19"), status: fresh ? "scheduled" : "paid" },
      { campaignId: campaign.id, creatorId: jason.id, deliverable: "1 TikTok video", feeCents: 120000, dueDate: "2026-11-21", payoutDate: "2026-11-26", brief: brief("2026-11-20", "2026-11-22"), status: fresh ? "scheduled" : "verified" },
      { campaignId: campaign.id, creatorId: mira.id, deliverable: "1 Reel", feeCents: 200000, dueDate: "2026-11-25", payoutDate: "2026-11-27", brief: brief("2026-11-24", "2026-11-26"), status: "scheduled" },
      { campaignId: campaign.id, creatorId: daniel.id, deliverable: "2 × 30s product video edits", feeCents: 100000, dueDate: "2026-11-24", payoutDate: "2026-11-28", brief: null, status: "scheduled" },
    ])
    .returning();

  await db.insert(schema.clientInvoices).values([
    { campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-11-16", status: fresh ? "draft" : "paid" },
    { campaignId: campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-12-18", status: "draft" },
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
      { assignmentId: aAina.id, amountCents: 150000, scheduledFor: "2026-11-20", approvedBy: "Mei Tan", approvedAt: new Date("2026-11-19T09:00:00+08:00"), status: "paid" },
      { assignmentId: aJason.id, amountCents: 120000, scheduledFor: "2026-11-26", status: "awaiting_approval" },
    ]);
  }
  return campaign.id;
}

export const seedEmails = () => ({
  creator: process.env.SANDBOX_CREATOR_EMAIL ?? "creator@example.com",
  client: process.env.SANDBOX_CLIENT_EMAIL ?? "client@example.com",
});
