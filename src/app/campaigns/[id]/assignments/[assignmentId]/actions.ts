"use server";
import { aiFromEnv } from "@/lib/ai/client";
import { readInvoice, toInvoiceFields } from "@/lib/ai/invoice-reader";
import { readPost } from "@/lib/ai/post-reader";
import { AiReadError } from "@/lib/ai/read-file";
import { agencyToday } from "@/lib/domain/today";
import { checkUpload, IMAGE_TYPES, INVOICE_TYPES } from "@/lib/domain/upload";
import { backTo, fileFrom, text } from "@/lib/form";
import { currentStaff } from "@/lib/staff";
import { overrideInvoice, savePostPrecheck, submitInvoice, submitPostCheck } from "@/lib/services/verification";
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
    actor: currentStaff(),
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
    actor: currentStaff(),
    today: agencyToday(),
  });
  backTo(pageOf(form), r.ok ? "Invoice checked against the contract." : r.reason);
}

export async function overrideHeldInvoice(form: FormData) {
  const r = await overrideInvoice({ assignmentId: text(form, "assignmentId"), reason: text(form, "reason"), actor: currentStaff(), today: agencyToday() });
  backTo(pageOf(form), r.ok ? "Override logged. The payout is waiting for approval." : r.reason);
}

// R11: the AI fills the invoice fields; compareInvoice() inside submitInvoice still decides.
export async function readInvoiceWithAi(form: FormData) {
  const here = pageOf(form);
  const file = await fileFrom(form, "invoice");
  if (!file) backTo(here, "Upload the invoice");
  const fileError = checkUpload(file, INVOICE_TYPES);
  if (fileError) backTo(here, fileError);

  let reading: Awaited<ReturnType<typeof readInvoice>>;
  try {
    reading = await readInvoice(aiFromEnv(), file);
  } catch (err) {
    console.error("[ai] invoice read failed", err);
    backTo(here, `${err instanceof AiReadError ? err.message : "The AI couldn't be reached"}. Type the invoice fields instead.`);
  }
  const checked = toInvoiceFields(reading.data);
  if (!checked.ok) backTo(here, `${checked.reason}. Type the invoice fields instead.`);

  const r = await submitInvoice({
    assignmentId: text(form, "assignmentId"),
    file,
    ...checked.fields,
    actor: currentStaff(),
    today: agencyToday(),
    reader: { model: reading.model, confidence: reading.data.confidence },
  });
  backTo(here, r.ok ? "Invoice read by AI and checked against the contract." : r.reason);
}

// R24: the AI suggests ticks; staff still confirm with Mark verified.
export async function precheckPost(form: FormData) {
  const here = pageOf(form);
  const file = await fileFrom(form, "proof");
  if (!file) backTo(here, "Upload the post screenshot to pre-check it");
  const fileError = checkUpload(file, IMAGE_TYPES);
  if (fileError) backTo(here, fileError);

  let reading: Awaited<ReturnType<typeof readPost>>;
  try {
    reading = await readPost(aiFromEnv(), file, agencyToday());
  } catch (err) {
    console.error("[ai] post pre-check failed", err);
    backTo(here, `${err instanceof AiReadError ? err.message : "The AI couldn't be reached"}. Tick the checklist yourself.`);
  }
  const r = await savePostPrecheck({ assignmentId: text(form, "assignmentId"), file, link: text(form, "link"), observation: reading.data, model: reading.model, actor: currentStaff() });
  backTo(here, r.ok ? "AI pre-check done. Review the suggested ticks, then confirm." : r.reason);
}
