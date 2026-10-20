"use server";
import { agencyToday } from "@/lib/domain/today";
import type { ActionResult } from "@/lib/services/payouts";
import { rescheduleAssignment } from "@/lib/services/reschedule";
import { isStaff } from "@/lib/staff";

// Called from a Bryntum drop (not a form), so it returns a result instead of redirecting.
export async function moveAssignment(eventId: string, newDueDate: string, actor: string): Promise<ActionResult> {
  if (!isStaff(actor)) return { ok: false, reason: "Unknown staff member" };
  if (!eventId.startsWith("assignment-")) return { ok: false, reason: "Only posts and deliverables can be moved" };
  return rescheduleAssignment({ assignmentId: eventId.slice("assignment-".length), newDueDate, actor, today: agencyToday() });
}
