import { z } from "zod";
import { parseUsdToCents } from "@/lib/domain/money";
import type { UploadedFile } from "@/lib/domain/upload";
import type { AiClient } from "./client";
import { readFileAsJson } from "./read-file";

export const MIN_CONFIDENCE = 0.5;

export const InvoiceReadingSchema = z.object({
  payee: z.string(),
  paypalEmail: z.string(),
  deliverable: z.string(),
  currency: z.string(),
  amount: z.string(),
  confidence: z.number().min(0).max(1),
});
export type InvoiceReading = z.infer<typeof InvoiceReadingSchema>;

const str = (description: string) => ({ type: "string", description });

export const INVOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["payee", "paypalEmail", "deliverable", "currency", "amount", "confidence"],
  properties: {
    payee: str("Name of the person or business being paid, exactly as written"),
    paypalEmail: str("PayPal or payment email on the invoice, exactly as written; empty string if none"),
    deliverable: str("What the invoice charges for, copied from the line item description"),
    currency: str("ISO currency code of the total, e.g. USD or MYR"),
    amount: str("Total amount due, digits with optional thousands commas and 2 decimals, no currency, e.g. 1,200.00"),
    confidence: { type: "number", description: "0 to 1: how sure you are that every field was read correctly" },
  },
};

const INSTRUCTIONS = [
  "This is a freelancer's invoice to a marketing agency.",
  "Copy each field exactly as written: do not correct spelling, round amounts or guess.",
  "If a field is missing, return an empty string for it and lower your confidence.",
].join(" ");

// The model never sees the contract, so it can't be nudged toward "match". compareInvoice() decides.
export function readInvoice(ai: AiClient, file: UploadedFile) {
  return readFileAsJson(ai, { file, instructions: INSTRUCTIONS, jsonSchema: INVOICE_JSON_SCHEMA, parse: InvoiceReadingSchema, maxTokens: 1024 });
}

// The gate between the AI and the comparison: anything doubtful goes back to a person to type.
export function toInvoiceFields(
  r: InvoiceReading,
): { ok: true; fields: { payee: string; paypalEmail: string; deliverable: string; currency: string; amount: string } } | { ok: false; reason: string } {
  if (r.confidence < MIN_CONFIDENCE) return { ok: false, reason: "The AI wasn't sure it read this invoice correctly" };
  const amount = r.amount.trim().replace(/^[A-Za-z]{3}\s*/, "").replace(/^\$\s*/, "");
  if (parseUsdToCents(amount) === null) return { ok: false, reason: "The AI couldn't read the amount" };
  return {
    ok: true,
    fields: { payee: r.payee.trim(), paypalEmail: r.paypalEmail.trim(), deliverable: r.deliverable.trim(), currency: r.currency.trim().toUpperCase(), amount },
  };
}
