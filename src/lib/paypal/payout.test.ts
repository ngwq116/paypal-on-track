import { describe, it, expect, vi } from "vitest";
import { createPayPalClient, PayPalError } from "./client";
import { toPayPalValue } from "./money";
import { buildPayoutBody, senderBatchId } from "./payouts";

const cfg = { clientId: "id", clientSecret: "secret", baseUrl: "https://api-m.sandbox.paypal.com" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("toPayPalValue", () => {
  it("formats cents as a 2-decimal string", () => {
    expect(toPayPalValue(100010)).toBe("1000.10");
    expect(toPayPalValue(120000)).toBe("1200.00");
    expect(toPayPalValue(5)).toBe("0.05");
  });
  it("rejects non-integer or negative cents", () => {
    expect(() => toPayPalValue(100.5)).toThrow();
    expect(() => toPayPalValue(-1)).toThrow();
  });
});

describe("createPayPalClient", () => {
  it("caches the access token until shortly before it expires", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => json({ access_token: "tok", expires_in: 3600 }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch, () => t);
    await pp.getToken();
    t = 3_000_000; // 50 min later, still valid
    await pp.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 3_560_000; // inside the last minute → refresh
    await pp.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws PayPalError with status and body on a failed request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('{"name":"VALIDATION_ERROR"}', { status: 422 }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch);
    await expect(pp.request("POST", "/v1/payments/payouts", {})).rejects.toMatchObject({ status: 422 });
    await expect(Promise.reject(new PayPalError(422, "x"))).rejects.toBeInstanceOf(PayPalError);
  });

  it("on a 401, drops the cached token, fetches a new one and retries once", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "old", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('{"error":"invalid_token"}', { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: "new", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch);
    await expect(pp.request("GET", "/v1/reporting/balances")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
  });

  it("does not retry more than once when the new token also gets a 401", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "a", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: "b", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch);
    await expect(pp.request("POST", "/v1/payments/payouts", {})).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("sends a string body as-is (webhook verification needs the raw event)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch);
    await pp.request("POST", "/x", '{"a":1.0}');
    expect(fetchImpl.mock.calls[1][1].body).toBe('{"a":1.0}');
  });
});

describe("buildPayoutBody", () => {
  it("uses the payout id as the idempotency key, so a retry can't pay twice", () => {
    const a = buildPayoutBody({ payoutId: "p-123", receiverEmail: "c@example.com", amountCents: 120000, note: "Kopi Kita" });
    const b = buildPayoutBody({ payoutId: "p-123", receiverEmail: "c@example.com", amountCents: 120000, note: "Kopi Kita" });
    expect(a.sender_batch_header.sender_batch_id).toBe("p-123");
    expect(a.items[0].sender_item_id).toBe("p-123");
    expect(a).toEqual(b);
    expect(a.items[0].amount).toEqual({ value: "1200.00", currency: "USD" });
  });
});

describe("senderBatchId", () => {
  it("is the payout id on the first attempt and payout id + attempt on a retry; the item id never changes", () => {
    expect(senderBatchId("p-123", 1)).toBe("p-123");
    expect(senderBatchId("p-123", 2)).toBe("p-123-2");
    const body = buildPayoutBody({ payoutId: "p-123", receiverEmail: "c@example.com", amountCents: 100, note: "x", attempt: 2 });
    expect(body.sender_batch_header.sender_batch_id).toBe("p-123-2");
    expect(body.items[0].sender_item_id).toBe("p-123");
  });
});
