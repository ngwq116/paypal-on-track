import { describe, it, expect } from "vitest";
import { formatDay } from "./format";
import { formatUsd, parseUsdToCents } from "./money";
import { checklistFor, decidePostCheck } from "./post-checklist";
import { compareInvoice, payoutAmountFor } from "./invoice-match";
import { checkUpload, IMAGE_TYPES, INVOICE_TYPES } from "./upload";
import type { PostBrief } from "./types";

const brief: PostBrief = { brandTag: "@kopikita", hashtags: ["#KopiKitaPagi", "#ad"], windowStart: "2026-10-30", windowEnd: "2026-11-01" };

describe("formatDay", () => {
  it("formats a calendar day without timezone shifts", () => {
    expect(formatDay("2026-10-29")).toBe("Oct 29");
    expect(formatDay("2026-11-01")).toBe("Nov 1");
  });
});

describe("parseUsdToCents", () => {
  it("accepts what people type", () => {
    expect(parseUsdToCents("1,200.00")).toBe(120000);
    expect(parseUsdToCents("1200")).toBe(120000);
    expect(parseUsdToCents("$1,000.10")).toBe(100010);
    expect(parseUsdToCents(" 0.05 ")).toBe(5);
  });
  it("rejects junk instead of guessing", () => {
    for (const bad of ["", "abc", "-5", "0", "0.00", "12.345", "1,2,00", "1.2.3", "$"]) {
      expect(parseUsdToCents(bad)).toBeNull();
    }
  });
});

describe("formatUsd", () => {
  it("always shows cents", () => {
    expect(formatUsd(120000)).toBe("$1,200.00");
    expect(formatUsd(5)).toBe("$0.05");
  });
});

describe("post checklist", () => {
  it("builds the three items from the brief", () => {
    expect(checklistFor(brief)).toEqual([
      { id: "brandTag", label: "Brand tagged", hint: "@kopikita appears in the caption or on screen" },
      { id: "hashtags", label: "Required hashtags", hint: "#KopiKitaPagi and #ad" },
      { id: "window", label: "Posted inside the window", hint: "Between Oct 30 and Nov 1" },
    ]);
  });
  it("verifies only when every item is ticked", () => {
    expect(decidePostCheck({ brief, ticked: ["brandTag", "hashtags", "window"], intent: "verify", note: "" })).toEqual({
      kind: "verified",
      ticked: ["brandTag", "hashtags", "window"],
    });
    expect(decidePostCheck({ brief, ticked: ["brandTag"], intent: "verify", note: "" })).toEqual({
      kind: "invalid",
      error: "Tick every item to verify. Missing: Required hashtags, Posted inside the window",
    });
  });
  it("holds with a note and lists what is missing; ignores unknown ids", () => {
    expect(decidePostCheck({ brief, ticked: ["brandTag", "bogus"], intent: "hold", note: " No #ad " })).toEqual({
      kind: "held",
      ticked: ["brandTag"],
      missing: ["Required hashtags", "Posted inside the window"],
      note: "No #ad",
    });
  });
  it("needs a note to hold", () => {
    expect(decidePostCheck({ brief, ticked: [], intent: "hold", note: "  " })).toEqual({ kind: "invalid", error: "A note is required to hold" });
  });
});

describe("compareInvoice", () => {
  const contract = { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 × 30s product video edits", currency: "USD", feeCents: 100000 };
  const invoice = { payee: "  daniel  lim ", paypalEmail: "Daniel@Example.com", deliverable: "2 x 30s product video edits", currency: "usd", amountCents: 100000 };

  it("matches despite spacing, case and × vs x", () => {
    const r = compareInvoice(contract, invoice);
    expect(r.match).toBe(true);
    expect(r.fields.map((f) => f.ok)).toEqual([true, true, true, true, true]);
  });
  it("flags the amount side by side", () => {
    const r = compareInvoice(contract, { ...invoice, amountCents: 120000 });
    expect(r.match).toBe(false);
    expect(r.fields.find((f) => f.field === "amount")).toEqual({ field: "amount", label: "Amount", contract: "$1,000.00", invoice: "$1,200.00", ok: false });
  });
  it("flags a different payee", () => {
    expect(compareInvoice(contract, { ...invoice, payee: "Danny Lee" }).match).toBe(false);
  });
  it("never pays more than the contract or more than was invoiced", () => {
    expect(payoutAmountFor(100000, 120000)).toBe(100000);
    expect(payoutAmountFor(100000, 90000)).toBe(90000);
  });
});

describe("checkUpload", () => {
  const file = (type: string, size = 1000) => ({ name: "x", type, size, bytes: Buffer.alloc(0) });
  it("accepts allowed types under 4 MB", () => {
    expect(checkUpload(file("image/png"), IMAGE_TYPES)).toBeNull();
    expect(checkUpload(file("application/pdf"), INVOICE_TYPES)).toBeNull();
  });
  it("rejects SVG, HTML, PDFs as post proof, empty and oversized files", () => {
    expect(checkUpload(file("image/svg+xml"), IMAGE_TYPES)).toBe("Upload a PNG, JPEG or WebP image");
    expect(checkUpload(file("text/html"), INVOICE_TYPES)).toBe("Upload a PDF, PNG, JPEG or WebP file");
    expect(checkUpload(file("application/pdf"), IMAGE_TYPES)).toBe("Upload a PNG, JPEG or WebP image");
    expect(checkUpload(file("image/png", 0), IMAGE_TYPES)).toBe("The file is empty");
    expect(checkUpload(file("image/png", 20 * 1024 * 1024), IMAGE_TYPES)).toBe("The file is larger than 4 MB");
  });
});
