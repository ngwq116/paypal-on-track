import { addDays } from "@/lib/events";
import { formatDay } from "./format";
import { daysBetween } from "./reschedule";

// R19: if a deliverable now lands after the campaign end, push the end and the unpaid balance invoice with it,
// keeping the original gap between the two.
export function balanceProposal(input: {
  endDate: string;
  latest: { dueDate: string; creatorName: string } | null;
  balance: { dueDate: string; status: "draft" | "sent" | "paid" } | null;
}): { newEndDate: string; newDueDate: string; reason: string } | null {
  const { endDate, latest, balance } = input;
  if (!latest || latest.dueDate <= endDate) return null;
  if (!balance || balance.status === "paid") return null;
  const gap = Math.max(0, daysBetween(endDate, balance.dueDate));
  const newDueDate = addDays(latest.dueDate, gap);
  if (newDueDate <= balance.dueDate) return null;
  return {
    newEndDate: latest.dueDate,
    newDueDate,
    reason: `${latest.creatorName} now delivers ${formatDay(latest.dueDate)}, after the campaign end (${formatDay(endDate)}).`,
  };
}
