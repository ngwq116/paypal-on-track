import { describe, it, expect, vi } from "vitest";
import type { PayPalClient } from "./client";
import { buildVerifyBody, interpretEvent, verifyWebhook } from "./webhooks";

const headers = (over: Record<string, string | null> = {}) => {
  const h: Record<string, string | null> = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
    "paypal-transmission-id": "tid-1",
    "paypal-transmission-sig": "sig==",
    "paypal-transmission-time": "2026-10-27T01:00:00Z",
    ...over,
  };
  return { get: (n: string) => h[n] ?? null };
};

describe("buildVerifyBody", () => {
  it("embeds the event exactly as received (re-serialising can break the signature)", () => {
    const raw = '{"id":"WH-1",  "event_type":"X","resource":{"a":1.0}}';
    const body = buildVerifyBody(headers(), raw, "WEBHOOK-ID")!;
    expect(body.endsWith(`"webhook_event":${raw}}`)).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ webhook_id: "WEBHOOK-ID", transmission_id: "tid-1", auth_algo: "SHA256withRSA" });
  });
  it("returns null when a signature header is missing", () => {
    expect(buildVerifyBody(headers({ "paypal-transmission-sig": null }), "{}", "W")).toBeNull();
  });
});

describe("verifyWebhook", () => {
  it("is true only when PayPal answers SUCCESS", async () => {
    const request = vi.fn().mockResolvedValueOnce({ verification_status: "SUCCESS" }).mockResolvedValueOnce({ verification_status: "FAILURE" });
    const pp = { request } as unknown as PayPalClient;
    expect(await verifyWebhook(pp, headers(), "{}", "W")).toBe(true);
    expect(await verifyWebhook(pp, headers(), "{}", "W")).toBe(false);
    expect(request.mock.calls[0][1]).toBe("/v1/notifications/verify-webhook-signature");
  });
  it("does not call PayPal when headers are missing", async () => {
    const request = vi.fn();
    expect(await verifyWebhook({ request } as unknown as PayPalClient, headers({ "paypal-cert-url": null }), "{}", "W")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("interpretEvent", () => {
  it("reads the paid invoice id from resource.invoice.id or resource.id", () => {
    expect(interpretEvent({ id: "1", event_type: "INVOICING.INVOICE.PAID", resource: { invoice: { id: "INV2-A" } } })).toEqual({ kind: "invoice_paid", paypalInvoiceId: "INV2-A" });
    expect(interpretEvent({ id: "2", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-B" } })).toEqual({ kind: "invoice_paid", paypalInvoiceId: "INV2-B" });
  });
  it("reads payout items by sender_item_id, with the batch id as fallback", () => {
    expect(
      interpretEvent({ id: "3", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "B1", payout_item: { sender_item_id: "p-1" } } }),
    ).toEqual({ kind: "payout_item", outcome: "paid", payoutId: "p-1", batchId: "B1", status: "SUCCEEDED" });
    expect(interpretEvent({ id: "4", event_type: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", resource: { payout_batch_id: "B2" } })).toEqual({
      kind: "payout_item", outcome: "failed", payoutId: null, batchId: "B2", status: "UNCLAIMED",
    });
  });
  it("ignores other events and events it can't match", () => {
    expect(interpretEvent({ id: "5", event_type: "CHECKOUT.ORDER.APPROVED", resource: {} })).toEqual({ kind: "ignored" });
    expect(interpretEvent({ id: "6", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: {} })).toEqual({ kind: "ignored" });
    expect(interpretEvent({ id: "7", event_type: "INVOICING.INVOICE.PAID" })).toEqual({ kind: "ignored" });
  });
});
