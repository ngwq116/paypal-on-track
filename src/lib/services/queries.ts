import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/uuid";

const TASK_LABEL = { post_checklist: "Post checklist", invoice_match: "Invoice matches", invoice_override: "Invoice override" } as const;

export async function verificationLabel(assignmentId: string): Promise<string> {
  const [v] = await db
    .select({ task: schema.verifications.task, pass: schema.verifications.pass, source: schema.verifications.source, createdBy: schema.verifications.createdBy })
    .from(schema.verifications)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
    .where(eq(schema.submissions.assignmentId, assignmentId))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  return v?.pass ? `${TASK_LABEL[v.task]}${v.source === "ai" ? " (AI read)" : ""} · ${v.createdBy}` : "Not verified";
}

const payoutWithContext = () =>
  db
    .select({ payout: schema.payouts, assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.payouts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId));

export async function listApprovalRows() {
  const rows = await payoutWithContext()
    .where(inArray(schema.payouts.status, ["awaiting_approval", "scheduled", "payout_sent", "payout_failed"]))
    .orderBy(asc(schema.payouts.scheduledFor));
  return Promise.all(rows.map(async (r) => ({ ...r, verified: await verificationLabel(r.assignment.id) })));
}

export async function getPayoutDetail(payoutId: string) {
  if (!isUuid(payoutId)) return null;
  const [row] = await payoutWithContext().where(eq(schema.payouts.id, payoutId));
  return row ? { ...row, verified: await verificationLabel(row.assignment.id) } : null;
}

export async function getClientInvoices(campaignId: string) {
  return db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, campaignId));
}

export async function getCampaignAssignments(campaignId: string) {
  return db
    .select({ assignment: schema.assignments, creator: schema.creators })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId))
    .orderBy(asc(schema.assignments.dueDate));
}

// Latest submission + its verification (file bytes left out; the image is served by its own route).
export async function getAssignmentDetail(assignmentId: string) {
  if (!isUuid(assignmentId)) return null;
  const [row] = await db
    .select({ assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .where(eq(schema.assignments.id, assignmentId));
  if (!row) return null;
  const [latest] = await db
    .select({
      submissionId: schema.submissions.id,
      fileName: schema.submissions.fileName,
      fileType: schema.submissions.fileType,
      link: schema.submissions.link,
      submittedBy: schema.submissions.submittedBy,
      task: schema.verifications.task,
      pass: schema.verifications.pass,
      checks: schema.verifications.checks,
      note: schema.verifications.note,
      createdBy: schema.verifications.createdBy,
    })
    .from(schema.verifications)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
    .where(eq(schema.submissions.assignmentId, assignmentId))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  const [payout] = await db.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, assignmentId));
  return { ...row, latest: latest ?? null, payout: payout ?? null };
}

export async function listAuditEvents(campaignId: string) {
  return db.select().from(schema.auditEvents).where(eq(schema.auditEvents.campaignId, campaignId)).orderBy(desc(schema.auditEvents.at)).limit(200);
}
