import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "./client";
import { INVOICE_JSON_SCHEMA, InvoiceReadingSchema, readInvoice, toInvoiceFields } from "./invoice-reader";

const reading = { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 × 30s product video edits", currency: "usd", amount: "1,200.00", confidence: 0.9 };

describe("INVOICE_JSON_SCHEMA", () => {
  it("asks for exactly the fields Zod checks, with no extra properties", () => {
    expect([...INVOICE_JSON_SCHEMA.required].sort()).toEqual(Object.keys(InvoiceReadingSchema.shape).sort());
    expect(INVOICE_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("readInvoice", () => {
  it("sends the invoice file and returns the reading", async () => {
    const create = vi.fn();
    create.mockResolvedValue({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reading) }] });
    const ai = { messages: { create } } as unknown as AiClient;
    const file = { name: "inv.pdf", type: "application/pdf", size: 3, bytes: Buffer.from("abc") };
    expect(await readInvoice(ai, file)).toEqual({ data: reading, model: "claude-haiku-5-5" });
    expect(create.mock.calls[0][0].output_config.format.schema).toBe(INVOICE_JSON_SCHEMA);
  });
});

describe("toInvoiceFields", () => {
  it("turns a confident reading into the invoice form fields", () => {
    expect(toInvoiceFields(reading)).toEqual({
      ok: true,
      fields: { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 × 30s product video edits", currency: "USD", amount: "1,200.00" },
    });
  });
  it("strips a currency code or symbol from the amount", () => {
    expect(toInvoiceFields({ ...reading, amount: "USD 1,200.00" })).toMatchObject({ ok: true, fields: { amount: "1,200.00" } });
    expect(toInvoiceFields({ ...reading, amount: "$1,200" })).toMatchObject({ ok: true, fields: { amount: "1,200" } });
  });
  it("sends staff to type it themselves when the AI is unsure or the amount is unreadable", () => {
    expect(toInvoiceFields({ ...reading, confidence: 0.3 })).toEqual({ ok: false, reason: "The AI wasn't sure it read this invoice correctly" });
    expect(toInvoiceFields({ ...reading, amount: "twelve hundred" })).toEqual({ ok: false, reason: "The AI couldn't read the amount" });
  });
});
