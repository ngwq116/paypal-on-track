import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { planReschedule } from "@/lib/domain/reschedule";
import { isUuid } from "@/lib/uuid";
import type { ActionResult } from "./payouts";
import { lockAssignment } from "./verification";

export async function rescheduleAssignment(input: { assignmentId: string; newDueDate: string; actor: string; today: string }): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (assignment.status === "paid") return { ok: false, reason: "This work is already paid" };
    const [payout] = await tx.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, assignment.id)).for("update");
    if (payout && (payout.status === "payout_sent" || payout.status === "paid")) return { ok: false, reason: "The payout was already sent" };

    const plan = planReschedule({ dueDate: assignment.dueDate, payoutDate: assignment.payoutDate, brief: assignment.brief }, input.newDueDate, input.today);
    if (!plan.ok) return { ok: false, reason: plan.error };
    if (!plan.changed) return { ok: true };

    await tx.update(schema.assignments).set({ dueDate: plan.dueDate, payoutDate: plan.payoutDate, brief: plan.brief }).where(eq(schema.assignments.id, assignment.id));
    const approvalReset = payout?.status === "scheduled";
    if (payout && (payout.status === "awaiting_approval" || payout.status === "scheduled")) {
      await tx
        .update(schema.payouts)
        .set({ scheduledFor: plan.payoutDate, ...(approvalReset ? { status: "awaiting_approval" as const, approvedBy: null, approvedAt: null } : {}) })
        .where(eq(schema.payouts.id, payout.id));
    }
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: "assignment.rescheduled",
      detail: {
        assignmentId: assignment.id,
        creator: creator.name,
        before: { dueDate: assignment.dueDate, payoutDate: assignment.payoutDate },
        after: { dueDate: plan.dueDate, payoutDate: plan.payoutDate },
        approvalReset,
      },
    });
    return { ok: true };
  });
}
