import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

type PayoutStatus = (typeof schema.payoutStatus.enumValues)[number];
type AssignmentStatus = (typeof schema.assignmentStatus.enumValues)[number];

export async function resetDb() {
  await db.execute(
    sql`truncate contracts, webhook_events, audit_events, verifications, submissions, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`,
  );
}

export async function seedAssignment(opts: { type?: "influencer" | "freelancer"; status?: AssignmentStatus; depositCleared?: boolean; payoutDate?: string } = {}) {
  const type = opts.type ?? "influencer";
  const [client] = await db.insert(schema.clients).values({ name: "Client Co", email: "client@example.com" }).returning();
  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Test campaign", startDate: "2026-10-19", endDate: "2026-11-20", depositCleared: opts.depositCleared ?? true })
    .returning();
  const [creator] = await db
    .insert(schema.creators)
    .values(
      type === "influencer"
        ? { name: "@tester", type, detail: "Instagram", paypalEmail: "creator@example.com" }
        : { name: "Daniel Lim", type, detail: "Video edits", paypalEmail: "daniel@example.com" },
    )
    .returning();
  const [assignment] = await db
    .insert(schema.assignments)
    .values({
      campaignId: campaign.id,
      creatorId: creator.id,
      deliverable: type === "influencer" ? "1 Reel" : "2 × 30s product video edits",
      feeCents: type === "influencer" ? 120000 : 100000,
      dueDate: "2026-10-24",
      payoutDate: opts.payoutDate ?? "2026-10-29",
      brief: type === "influencer" ? { brandTag: "@kopikita", hashtags: ["#KopiKitaPagi", "#ad"], windowStart: "2026-10-23", windowEnd: "2026-10-25" } : null,
      status: opts.status ?? "scheduled",
    })
    .returning();
  return { client, campaign, creator, assignment };
}

export async function seedPayout(
  opts: { depositCleared?: boolean; verified?: boolean; status?: PayoutStatus; approvedBy?: string | null; amountCents?: number; paypalBatchId?: string } = {},
) {
  const base = await seedAssignment({ depositCleared: opts.depositCleared, status: "verified" });
  if (opts.verified ?? true) {
    const [s] = await db
      .insert(schema.submissions)
      .values({ assignmentId: base.assignment.id, kind: "post_proof", fileName: "p.png", fileType: "image/png", file: Buffer.from([1]), submittedBy: "Mei Tan" })
      .returning();
    await db.insert(schema.verifications).values({ submissionId: s.id, source: "user", task: "post_checklist", pass: true, createdBy: "Mei Tan" });
  }
  const [payout] = await db
    .insert(schema.payouts)
    .values({
      assignmentId: base.assignment.id,
      amountCents: opts.amountCents ?? 120000,
      scheduledFor: "2026-10-29",
      status: opts.status ?? "awaiting_approval",
      approvedBy: opts.approvedBy ?? null,
      paypalBatchId: opts.paypalBatchId ?? null,
    })
    .returning();
  return { ...base, payout };
}
