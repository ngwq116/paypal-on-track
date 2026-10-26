import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, seedAssignment, seedPayout } from "@/test/fixtures";
import { rescheduleAssignment } from "./reschedule";

beforeEach(resetDb);
const today = "2026-10-20";
const assignmentRow = async (id: string) => (await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)))[0];
const payoutRow = async (id: string) => (await db.select().from(schema.payouts).where(eq(schema.payouts.id, id)))[0];

describe("rescheduleAssignment", () => {
  it("moves the deliverable and its payout date together, and logs it", async () => {
    const { assignment } = await seedAssignment(); // due 2026-10-24, payout 2026-10-29
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-27", actor: "Wanz", today })).toEqual({ ok: true });
    expect(await assignmentRow(assignment.id)).toMatchObject({ dueDate: "2026-10-27", payoutDate: "2026-11-01" });
    const [audit] = await db.select().from(schema.auditEvents);
    expect(audit).toMatchObject({ action: "assignment.rescheduled", actor: "Wanz" });
  });
  it("moves a queued payout's date, and sends an approved payout back for approval (R26)", async () => {
    const { assignment, payout } = await seedPayout({ status: "scheduled", approvedBy: "Wanz" });
    await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-26", actor: "Hana Aziz", today });
    expect(await payoutRow(payout.id)).toMatchObject({ scheduledFor: "2026-10-31", status: "awaiting_approval", approvedBy: null });
  });
  it("refuses once the payout was sent", async () => {
    const { assignment } = await seedPayout({ status: "payout_sent", approvedBy: "Wanz" });
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-26", actor: "Wanz", today })).toEqual({ ok: false, reason: "The payout was already sent" });
  });
  it("refuses a past day and writes nothing for a same-day drop", async () => {
    const { assignment } = await seedAssignment();
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-01", actor: "Wanz", today })).toEqual({ ok: false, reason: "Can't move a deliverable into the past" });
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-24", actor: "Wanz", today })).toEqual({ ok: true });
    expect(await db.select().from(schema.auditEvents)).toHaveLength(0);
  });
});
