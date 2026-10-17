"use server";
import { agencyToday } from "@/lib/domain/today";
import { actorFrom, backTo, text } from "@/lib/form";
import { payPalFromEnv } from "@/lib/paypal/client";
import { checkInvoicePayment, createBalanceDraft, sendDepositInvoice } from "@/lib/services/client-invoices";

export async function sendDeposit(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await sendDepositInvoice(payPalFromEnv(), campaignId, actorFrom(form), agencyToday());
  backTo(`/campaigns/${campaignId}/team`, r.ok ? "Deposit invoice sent to the client through PayPal." : r.reason);
}

export async function createBalance(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await createBalanceDraft(payPalFromEnv(), campaignId, actorFrom(form), agencyToday());
  backTo(`/campaigns/${campaignId}/team`, r.ok ? "Balance invoice saved in PayPal as a draft." : r.reason);
}

// Backup when PayPal's "invoice paid" webhook is late or never comes.
export async function checkDeposit(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await checkInvoicePayment(payPalFromEnv(), campaignId, "deposit", actorFrom(form));
  backTo(`/campaigns/${campaignId}/team`, !r.ok ? r.reason : r.paid ? "PayPal confirms the deposit is paid." : "PayPal still shows the deposit as unpaid.");
}
