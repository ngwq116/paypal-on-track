import { describe, it, expect, vi } from "vitest";
import type { PayPalClient } from "./client";
import { createInvoice } from "./invoicing";
import { getInvoiceStatus, getInvoiceViewUrl, invoiceNumberFor, isPaidStatus } from "./invoicing";

describe("createInvoice", () => {
  it("sends the item's unit_amount with currency_code USD and a 2-decimal value", async () => {
    const request = vi.fn(async () => ({ id: "INV2-1", status: "DRAFT" }));
    const pp = { request } as unknown as PayPalClient;

    await createInvoice(pp, {
      invoiceNumber: "OT-1",
      recipientEmail: "client@example.com",
      itemName: "Deposit",
      amountCents: 100,
      dueDate: "2026-11-20",
    });

    const body = (request.mock.calls[0] as unknown[])[2] as { items: { unit_amount: unknown }[] };
    expect(body.items[0].unit_amount).toEqual({ currency_code: "USD", value: "1.00" });
  });
});

describe("invoiceNumberFor", () => {
  it("is stable per campaign and kind, and short enough for PayPal (max 25 chars)", () => {
    const n = invoiceNumberFor("7954c4e7-f9aa-41d5-9c56-c17acb5fc9e3", "deposit");
    expect(n).toBe("OT-7954C4E7-DEP");
    expect(invoiceNumberFor("7954c4e7-f9aa-41d5-9c56-c17acb5fc9e3", "balance")).toBe("OT-7954C4E7-BAL");
    expect(n.length).toBeLessThanOrEqual(25);
  });
});

describe("getInvoiceViewUrl", () => {
  it("returns the payer link from the invoice metadata, or null", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#INV2-1" } } })
      .mockResolvedValueOnce({ detail: {} });
    const pp = { request } as unknown as PayPalClient;
    expect(await getInvoiceViewUrl(pp, "INV2-1")).toBe("https://www.sandbox.paypal.com/invoice/p/#INV2-1");
    expect(await getInvoiceViewUrl(pp, "INV2-2")).toBeNull();
    expect(request.mock.calls[0][1]).toBe("/v2/invoicing/invoices/INV2-1");
  });
});
describe("getInvoiceStatus / isPaidStatus", () => {
  it("reads the invoice status from PayPal", async () => {
    const request = vi.fn().mockResolvedValueOnce({ status: "PAID" });
    const pp = { request } as unknown as PayPalClient;
    expect(await getInvoiceStatus(pp, "INV2-1")).toBe("PAID");
    expect(request.mock.calls[0]).toEqual(["GET", "/v2/invoicing/invoices/INV2-1"]);
  });
  it("counts only fully paid invoices as paid", () => {
    expect(isPaidStatus("PAID")).toBe(true);
    expect(isPaidStatus("MARKED_AS_PAID")).toBe(true);
    expect(isPaidStatus("PARTIALLY_PAID")).toBe(false);
    expect(isPaidStatus("PAYMENT_PENDING")).toBe(false);
    expect(isPaidStatus("SENT")).toBe(false);
  });
});
