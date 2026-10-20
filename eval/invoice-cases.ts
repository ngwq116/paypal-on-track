import type { ContractTerms } from "../src/lib/domain/invoice-match";

// The contract every eval invoice is checked against (matches the seed's Daniel Lim, with a fixed email).
export const EVAL_CONTRACT: ContractTerms = {
  payee: "Daniel Lim",
  paypalEmail: "daniel.lim@example.com",
  deliverable: "2 × 30s product video edits",
  currency: "USD",
  feeCents: 100000,
};

export interface InvoiceCase {
  id: string;
  expectMatch: boolean;
  note: string;
  lines: string[];
}

const top = (no: string) => [`# INVOICE ${no}`, "Date: 25 October 2026", "Bill to: Studio Rakan Sdn Bhd, Kuala Lumpur", ""];

export const INVOICE_CASES: InvoiceCase[] = [
  {
    id: "ok-plain",
    expectMatch: true,
    note: "clean single line",
    lines: [...top("INV-0142"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Amount: USD 1,000.00", "", "Total due: USD 1,000.00"],
  },
  {
    id: "ok-symbol",
    expectMatch: true,
    note: "dollar sign, no decimals",
    lines: [...top("0143"), "Payee: Daniel Lim", "", "Item                                   Qty   Price", "2 × 30s product video edits            1     $1000", "", "TOTAL  $1000", "", "Please pay via PayPal to daniel.lim@example.com"],
  },
  {
    id: "ok-subtotal",
    expectMatch: true,
    note: "subtotal and zero tax",
    lines: [...top("DL-2026-11"), "Daniel Lim · Video editor", "daniel.lim@example.com", "", "1. 2 × 30s product video edits ........ 1,000.00", "", "Subtotal: 1,000.00", "Tax (0%): 0.00", "Amount payable (USD): 1,000.00"],
  },
  {
    id: "ok-footer-email",
    expectMatch: true,
    note: "email only in the footer",
    lines: [...top("144"), "Freelancer: Daniel Lim", "Currency: USD", "", "Work: 2 × 30s product video edits", "Fee: 1,000.00", "", "", "", "Payment details: PayPal account daniel.lim@example.com"],
  },
  {
    id: "ok-terms",
    expectMatch: true,
    note: "payment terms and notes around the numbers",
    lines: [...top("INV-145"), "Issued by Daniel Lim (daniel.lim@example.com)", "Terms: due within 7 days", "", "Services rendered:", "  2 × 30s product video edits for Kopi Kita Pagi Launch", "", "Grand total: USD 1,000.00", "Thank you!"],
  },
  {
    id: "bad-amount",
    expectMatch: false,
    note: "invoices $1,200 on a $1,000 contract",
    lines: [...top("INV-0146"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Amount: USD 1,200.00", "", "Total due: USD 1,200.00"],
  },
  {
    id: "bad-email",
    expectMatch: false,
    note: "asks to be paid to a different PayPal account",
    lines: [...top("INV-0147"), "From: Daniel Lim", "PayPal: daniel.lim88@example.com", "", "Description: 2 × 30s product video edits", "Total due: USD 1,000.00"],
  },
  {
    id: "bad-deliverable",
    expectMatch: false,
    note: "bills for three edits instead of two",
    lines: [...top("INV-0148"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 3 × 30s product video edits", "Total due: USD 1,000.00"],
  },
  {
    id: "bad-currency",
    expectMatch: false,
    note: "billed in ringgit",
    lines: [...top("INV-0149"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Total due: MYR 1,000.00"],
  },
  {
    id: "bad-payee",
    expectMatch: false,
    note: "a different person",
    lines: [...top("INV-0150"), "From: Danial Lin", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Total due: USD 1,000.00"],
  },
];
