import { describe, it, expect, vi } from "vitest";
import type { PayPalClient } from "./client";
import { createInvoice } from "./invoicing";

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
