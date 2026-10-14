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