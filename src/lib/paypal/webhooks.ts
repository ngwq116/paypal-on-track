import { PayPalClient } from "./client";

const HEADERS = {
    auth_algo: "paypal-auth-algo",
    cert_url: "paypal-cert-url",
    transmission_id: "paypal-transmission-id",
    transmission_sig: "paypal-transmission-sig",
    transmission_time: "paypal-transmission-time",
} as const;

type HeaderBag = { get(name: string): string | null };

export const buildVerifyBody = (headers: HeaderBag, rawBody: string, webhookId: string): string | null => {
    const fields: Record<string, string> = {};

    for (const [key, header] of Object.entries(HEADERS)) {
        const value = headers.get(header);
        if (!value) return null;
        fields[key] = value;
    }

    fields.webhook_id = webhookId;

    // Embed the event byte-for-byte: parsing and re-stringify it can change it and fail verification.
    return JSON.stringify(fields).slice(0, -1) + `,"webhook_event":${rawBody}}`;
}

export async function verifyWebhook(pp: PayPalClient, headers: HeaderBag, rawBody: string, webhookId: string): Promise<boolean> {
    const body = buildVerifyBody(headers, rawBody, webhookId);
    if (!body) return false;

    const res = await pp.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", body);
    return res.verification_status === "SUCCESS";
}

export interface PayPalWebhookEvent {
    id: string;
    event_type: string;
    resource?: unknown;
}

export type InterpretedEvent = 
| { kind: "invoice_paid"; paypalInvoiceId: string }
| { kind: "payout_item"; outcome: "paid" | "failed"; payoutId: string | null; batchId: string | null; status: string; reason: string }
| { kind: "ignored" }

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const PAYOUT_FAILED = new Set(["FAILED", "UNCLAIMED", "BLOCKED", "DENIED", "RETURNED"]);

export function interpretEvent(e: PayPalWebhookEvent): InterpretedEvent {
    const r = obj(e.resource);

    if (e.event_type === "INVOICING.INVOICE.PAID") {
        const id = str(obj(r.invoice).id) ?? str(r.id);

        return id ? { kind: "invoice_paid", paypalInvoiceId: id} : { kind: "ignored"};
    }

    if (e.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
        const status = e.event_type.slice("PAYMENT.PAYOUTS-ITEM.".length);
        if (status !== "SUCCEEDED" && !PAYOUT_FAILED.has(status)) return { kind: "ignored" };
        const payoutId = str(obj(r.payout_item).sender_item_id) ?? str(r.sender_item_id);
        const batchId = str(r.payout_batch_id);

        if (!payoutId && !batchId) return { kind: "ignored" };
        // A failed item carries PayPal's own error name (e.g. SELF_PAY_NOT_ALLOWED); it says more than "FAILED".
        const reason = str(obj(r.errors).name) ?? status;
        return { kind: "payout_item", outcome: status === "SUCCEEDED" ? "paid" : "failed", payoutId, batchId, status, reason};
    }

    return { kind: "ignored" };
}