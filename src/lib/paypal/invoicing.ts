import { PayPalClient } from "./client";
import { toPayPalValue } from "./money";

export async function createInvoice (
    pp: PayPalClient,
    input: {
        invoiceNumber: string;
        recipientEmail: string;
        itemName: string;
        amountCents: number;
        dueDate: string
    }
): Promise<{ id: string; status: string}> {
    const invoice = await pp.request<{ id: string; status: string}>(
        "POST",
        "/v2/invoicing/invoices",
        {
            detail: {
                invoice_number: input.invoiceNumber,
                currency_code: "USD",
                payment_term: {
                    term_type: "DUE_ON_DATE_SPECIFIED",
                    due_date: input.dueDate
                },
            },
            primary_recipients: [{
                billing_info: {
                    email_address: input.recipientEmail
                }
            }],
            items: [{ name: input.itemName, quantity: "1", unit_amount: {currency_code: "USD", value: toPayPalValue(input.amountCents)}}]
        },
        {Prefer: "return=representation"}
    );

    return {
        id: invoice.id,
        status: invoice.status
    }
}

export async function sendInvoice(pp: PayPalClient, invoiceId: string): Promise<void> {
  await pp.request("POST", `/v2/invoicing/invoices/${invoiceId}/send`, { send_to_recipient: true });
}

// Stable per campaign + kind, so Paypal rejects an accidental second invoice (<= 25 chars)
export const invoiceNumberFor = (campaignId: string, kind: "deposit" | "balance"): string => {
    return `OT-${campaignId.slice(0, 8).toUpperCase()}-${kind === "deposit" ? "DEP": "BAL"}`;
}

// The payer's link. In the sandbox, open it logged in as the client's personal test account to pay.
export async function getInvoiceViewUrl(pp: PayPalClient, invoiceId: string): Promise<string | null> {
    const inv = await pp.request<{ detail?: {metadata?: { recipient_view_url?: string } } }>("GET", `/v2/invoicing/invoices/${invoiceId}`);
    return inv.detail?.metadata?.recipient_view_url ?? null;
}
// Asking PayPal directly: the backup for when the INVOICING.INVOICE.PAID webhook never arrives.
export async function getInvoiceStatus(pp: PayPalClient, invoiceId: string): Promise<string> {
    const inv = await pp.request<{ status: string }>("GET", `/v2/invoicing/invoices/${invoiceId}`);
    return inv.status;
}

// PARTIALLY_PAID and PAYMENT_PENDING are not paid: the deposit lock stays on.
export const isPaidStatus = (status: string): boolean => status === "PAID" || status === "MARKED_AS_PAID";
