"use server";
import { agencyToday } from "@/lib/domain/today";
import { backTo, text } from "@/lib/form";
import { currentStaff } from "@/lib/staff";
import { payPalFromEnv } from "@/lib/paypal/client";
import { checkInvoicePayment, createBalanceDraft, sendDepositInvoice } from "@/lib/services/client-invoices";
import { approveBalanceMove } from "@/lib/services/balance";

export async function sendDeposit(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await sendDepositInvoice(payPalFromEnv(), campaignId, currentStaff(), agencyToday());
  backTo(`/campaigns/${campaignId}/team`, r.ok ? "Deposit invoice sent to the client through PayPal." : r.reason);
}

export async function createBalance(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await createBalanceDraft(payPalFromEnv(), campaignId, currentStaff(), agencyToday());
  backTo(`/campaigns/${campaignId}/team`, r.ok ? "Balance invoice saved in PayPal as a draft." : r.reason);
}

// Backup when PayPal's "invoice paid" webhook is late or never comes.
export async function checkDeposit(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await checkInvoicePayment(payPalFromEnv(), campaignId, "deposit", currentStaff());
  backTo(`/campaigns/${campaignId}/team`, !r.ok ? r.reason : r.paid ? "PayPal confirms the deposit is paid." : "PayPal still shows the deposit as unpaid.");
}

export async function approveBalanceMoveAction(form: FormData) {
  const campaignId = text(form, "campaignId");
  const view = text(form, "view") === "calendar" ? "calendar" : "team";
  const r = await approveBalanceMove(payPalFromEnv(), { campaignId, newDueDate: text(form, "newDueDate"), actor: currentStaff() });
  backTo(`/campaigns/${campaignId}/${view}`, r.ok ? "Balance invoice due date moved." : r.reason);
}
