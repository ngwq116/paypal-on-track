import { addDays } from "@/lib/events";
import { isDay } from "./format";
import type { PostBrief } from "./types";

// Whole calendar days from one YYYY-MM-DD to another (UTC, so no timezone drift).
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// R19: a dragged deliverable takes its payout date and posting window with it, by the same number of days.
export function planReschedule(
  current: { dueDate: string; payoutDate: string; brief: PostBrief | null },
  newDueDate: string,
  today: string,
): { ok: true; changed: boolean; dueDate: string; payoutDate: string; brief: PostBrief | null } | { ok: false; error: string } {
  if (!isDay(newDueDate)) return { ok: false, error: "That isn't a valid date" };
  if (newDueDate === current.dueDate) return { ok: true, changed: false, ...current };
  if (newDueDate < today) return { ok: false, error: "Can't move a deliverable into the past" };
  const shift = daysBetween(current.dueDate, newDueDate);
  const move = (d: string) => addDays(d, shift);
  return {
    ok: true,
    changed: true,
    dueDate: newDueDate,
    payoutDate: move(current.payoutDate),
    brief: current.brief && { ...current.brief, windowStart: move(current.brief.windowStart), windowEnd: move(current.brief.windowEnd) },
  };
}
