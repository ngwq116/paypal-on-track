import { formatUsd } from "./money";

export interface ContractTerms {
    payee: string;
    paypalEmail: string;
    deliverable: string;
    currency: string; 
    feeCents: number;
}

export interface InvoiceFields { 
    payee: string;
    paypalEmail: string;
    deliverable: string;
    currency: string;
    amountCents: number;
}

export interface FieldComparison {
    field: "payee" | "paypalEmail" | "deliverable" | "currency" | "amount";
    label: string;
    contract: string;
    invoice: string;
    ok: boolean;
}

const norm = (s: string) => s.replace(/×/g, "x").replace(/\s+/g, " ").trim().toLowerCase();

// R11: the comparison is plain code. Whoever (or whatever) read the invoice can't decide the match.
export function compareInvoice(c: ContractTerms, i: InvoiceFields): { match: boolean; fields: FieldComparison[]} {
    const text = (field: FieldComparison["field"], label: string, a: string, b: string): FieldComparison => ({
        field, label, contract: a, invoice: b, ok: norm(a) === norm(b),
    });

    const fields: FieldComparison[] = [
        text("payee", "Payee", c.payee, i.payee),
        text("paypalEmail", "Paypal email", c.paypalEmail, i.paypalEmail),
        text("deliverable", "Deliverable", c.deliverable, i.deliverable),
        text("currency", "Currency", c.currency, i.currency),
        { field: "amount", label: "Amount", contract: formatUsd(c.feeCents), invoice: formatUsd(i.amountCents), ok: i.amountCents === c.feeCents}
    ];

    return { match: fields.every(f => f.ok), fields}
}

// An override pays what was invoiced, capped at the contract fee (R16). Raising it needs an amended contract.
export const payoutAmountFor = (feeCents: number, invoicedCents: number): number => Math.min(feeCents, invoicedCents);