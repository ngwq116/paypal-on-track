"use server";
import { agencyToday } from "@/lib/domain/today";
import { actorFrom, backTo, fileFrom, text } from "@/lib/form";
import { overrideInvoice, submitInvoice, submitPostCheck } from "@/lib/services/verification";
import { isUuid } from "@/lib/uuid";

function pageOf(form: FormData): string {
  const campaignId = text(form, "campaignId");
  const assignmentId = text(form, "assignmentId");
  return isUuid(campaignId) && isUuid(assignmentId) ? `/campaigns/${campaignId}/assignments/${assignmentId}` : "/";
}

async function postCheck(form: FormData, intent: "verify" | "hold") {
  const r = await submitPostCheck({
    assignmentId: text(form, "assignmentId"),
    file: await fileFrom(form, "proof"),
    link: text(form, "link"),
    ticked: form.getAll("ticked").map(String),
    intent,
    note: text(form, "note"),
    actor: actorFrom(form),
    today: agencyToday(),
  });
  const done = intent === "verify" ? "Post verified. The payout is waiting for approval." : "Post held. No payout until a new screenshot passes.";
  backTo(pageOf(form), r.ok ? done : r.reason);
}

export async function verifyPost(form: FormData) {
  await postCheck(form, "verify");
}

export async function holdPost(form: FormData) {
  await postCheck(form, "hold");
}

export async function checkInvoice(form: FormData) {
  const r = await submitInvoice({
    assignmentId: text(form, "assignmentId"),
    file: await fileFrom(form, "invoice"),
    payee: text(form, "payee"),
    paypalEmail: text(form, "paypalEmail"),
    deliverable: text(form, "deliverable"),
    amount: text(form, "amount"),
    actor: actorFrom(form),
    today: agencyToday(),
  });
  backTo(pageOf(form), r.ok ? "Invoice checked against the contract." : r.reason);
}

export async function overrideHeldInvoice(form: FormData) {
  const r = await overrideInvoice({ assignmentId: text(form, "assignmentId"), reason: text(form, "reason"), actor: actorFrom(form), today: agencyToday() });
  backTo(pageOf(form), r.ok ? "Override logged. The payout is waiting for approval." : r.reason);
}
