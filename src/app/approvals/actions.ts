"use server";
import { agencyToday } from "@/lib/domain/today";
import { parseUsdToCents } from "@/lib/domain/money";
import { actorFrom, backTo, text } from "@/lib/form";
import { payPalFromEnv } from "@/lib/paypal/client";
import { approvePayouts, editPayout, rejectPayout, retryPayout, sendPayout, type ActionResult } from "@/lib/services/payouts";

function summarize(results: Array<{ result: ActionResult }>): string {
  const done = results.filter((r) => r.result.ok).length;
  const reasons = [...new Set(results.flatMap((r) => (r.result.ok ? [] : [r.result.reason])))];
  return reasons.length ? `${done} approved · ${results.length - done} not approved (${reasons.join("; ")})` : `${done} approved and scheduled`;
}

export async function approveSelected(form: FormData) {
  const ids = form.getAll("ids").map(String);
  if (!ids.length) backTo("/approvals", "Select at least one payout");
  backTo("/approvals", summarize(await approvePayouts(ids, actorFrom(form))));
}

// Row buttons bind the payout id: React drops name/value on a button whose formAction is a function.
export async function approveOne(payoutId: string, form: FormData) {
  backTo("/approvals", summarize(await approvePayouts([payoutId], actorFrom(form))));
}

export async function sendNow(payoutId: string, form: FormData) {
  const r = await sendPayout(payPalFromEnv(), payoutId, actorFrom(form));
  backTo("/approvals", r.ok ? "Sent to PayPal. It turns paid when PayPal confirms." : r.reason);
}

export async function saveEdit(form: FormData) {
  const payoutId = text(form, "payoutId");
  const here = `/approvals/${payoutId}`;
  const amountCents = parseUsdToCents(text(form, "amount"));
  if (amountCents === null) backTo(here, "Enter the amount like 1,200.00");
  const r = await editPayout({ payoutId, amountCents, date: text(form, "date"), reason: text(form, "reason"), actor: actorFrom(form), today: agencyToday() });
  if (!r.ok) backTo(here, r.errors.join(". "));
  backTo("/approvals", "Payout updated. Edited payouts need approval again.");
}

export async function reject(form: FormData) {
  const payoutId = text(form, "payoutId");
  const r = await rejectPayout(payoutId, actorFrom(form), text(form, "reason"));
  if (!r.ok) backTo(`/approvals/${payoutId}`, r.reason);
  backTo("/approvals", "Payout rejected and held. The reason is in the audit log.");
}

export async function retryFailed(payoutId: string, form: FormData) {
  const r = await retryPayout(payoutId, actorFrom(form));
  backTo("/approvals", r.ok ? "Payout queued again. Approve it to send the retry." : r.reason);
}
