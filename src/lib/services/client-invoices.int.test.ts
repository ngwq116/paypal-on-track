import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { checkInvoicePayment, createBalanceDraft, sendDepositInvoice, syncSentInvoices } from "./client-invoices";

function fakePayPal() {
  const request = vi.fn(async (method: string, path: string, _body?: unknown) => {
    if (method === "POST" && path === "/v2/invoicing/invoices") return { id: "INV2-NEW", status: "DRAFT" };
    if (method === "GET") return { detail: { metadata: { recipient_view_url: "https://sandbox.example/pay" } } };
    return {};
  });
  return { pp: { request } as unknown as PayPalClient, request };
}

async function withInvoices(depositStatus: "draft" | "sent" = "draft") {
  const base = await seedAssignment({ depositCleared: false });
  await db.insert(schema.clientInvoices).values([
    { campaignId: base.campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: depositStatus },
    { campaignId: base.campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "draft" },
  ]);
  return base;
}
const invoice = async (kind: "deposit" | "balance") => (await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.kind, kind)))[0];

beforeEach(resetDb);

describe("sendDepositInvoice", () => {
  it("creates, sends and stores the payer link; due date never in the past", async () => {
    const { campaign } = await withInvoices();
    const { pp, request } = fakePayPal();
    expect(await sendDepositInvoice(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: true });
    const create = request.mock.calls.find((c) => c[1] === "/v2/invoicing/invoices")!;
    expect(create[2]).toMatchObject({ detail: { payment_term: { due_date: "2026-10-21" } } });
    expect(request.mock.calls.some((c) => c[1] === "/v2/invoicing/invoices/INV2-NEW/send")).toBe(true);
    expect(await invoice("deposit")).toMatchObject({ status: "sent", paypalInvoiceId: "INV2-NEW", paypalViewUrl: "https://sandbox.example/pay" });
  });
  it("won't send twice", async () => {
    const { campaign } = await withInvoices("sent");
    const { pp, request } = fakePayPal();
    expect(await sendDepositInvoice(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: false, reason: "The deposit invoice was already sent" });
    expect(request).not.toHaveBeenCalled();
  });
  it("reuses an invoice PayPal already created if the send failed last time", async () => {
    const { campaign } = await withInvoices();
    await db.update(schema.clientInvoices).set({ paypalInvoiceId: "INV2-OLD" }).where(eq(schema.clientInvoices.kind, "deposit"));
    const { pp, request } = fakePayPal();
    expect(await sendDepositInvoice(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: true });
    expect(request.mock.calls.some((c) => c[1] === "/v2/invoicing/invoices")).toBe(false);
    expect(request.mock.calls.some((c) => c[1] === "/v2/invoicing/invoices/INV2-OLD/send")).toBe(true);
  });
});

describe("createBalanceDraft", () => {
  it("creates the balance invoice in PayPal as a draft and does not send it (R5)", async () => {
    const { campaign } = await withInvoices();
    const { pp, request } = fakePayPal();
    expect(await createBalanceDraft(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: true });
    expect(request.mock.calls.some((c) => String(c[1]).endsWith("/send"))).toBe(false);
    expect(await invoice("balance")).toMatchObject({ status: "draft", paypalInvoiceId: "INV2-NEW" });
  });
});

// Fallback for when PayPal's INVOICING.INVOICE.PAID webhook never arrives (seen in the sandbox).
describe("checkInvoicePayment", () => {
  const statusPayPal = (status: string) => {
    const request = vi.fn(async () => ({ status }));
    return { pp: { request } as unknown as PayPalClient, request };
  };
  async function sentDeposit() {
    const base = await withInvoices("sent");
    await db.update(schema.clientInvoices).set({ paypalInvoiceId: "INV2-SENT" }).where(eq(schema.clientInvoices.kind, "deposit"));
    return base;
  }

  it("marks the deposit paid and unlocks payouts when PayPal says PAID", async () => {
    const { campaign } = await sentDeposit();
    const { pp, request } = statusPayPal("PAID");
    expect(await checkInvoicePayment(pp, campaign.id, "deposit", "Mei Tan")).toEqual({ ok: true, paid: true });
    expect(request).toHaveBeenCalledWith("GET", "/v2/invoicing/invoices/INV2-SENT");
    expect((await invoice("deposit")).status).toBe("paid");
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    expect(c.depositCleared).toBe(true);
    const audits = await db.select().from(schema.auditEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor: "paypal", action: "invoice.paid", detail: { via: "status check", checkedBy: "Mei Tan" } });
  });
  it("changes nothing while PayPal still shows it unpaid", async () => {
    const { campaign } = await sentDeposit();
    expect(await checkInvoicePayment(statusPayPal("SENT").pp, campaign.id, "deposit", "Mei Tan")).toEqual({ ok: true, paid: false });
    expect((await invoice("deposit")).status).toBe("sent");
  });
  it("does not ask PayPal about an invoice that was never sent", async () => {
    const { campaign } = await withInvoices();
    const { pp, request } = statusPayPal("PAID");
    expect(await checkInvoicePayment(pp, campaign.id, "deposit", "Mei Tan")).toEqual({ ok: false, reason: "The deposit invoice hasn't been sent" });
    expect(request).not.toHaveBeenCalled();
  });
  it("is harmless after the webhook already marked it paid (no second audit entry)", async () => {
    const { campaign } = await sentDeposit();
    await db.update(schema.clientInvoices).set({ status: "paid" }).where(eq(schema.clientInvoices.kind, "deposit"));
    const { pp, request } = statusPayPal("PAID");
    expect(await checkInvoicePayment(pp, campaign.id, "deposit", "Mei Tan")).toEqual({ ok: true, paid: true });
    expect(request).not.toHaveBeenCalled();
    expect(await db.select().from(schema.auditEvents)).toHaveLength(0);
  });
});

describe("syncSentInvoices", () => {
  it("settles every sent invoice PayPal reports as paid, for the daily run", async () => {
    await withInvoices("sent");
    await db.update(schema.clientInvoices).set({ paypalInvoiceId: "INV2-A" }).where(eq(schema.clientInvoices.kind, "deposit"));
    const request = vi.fn(async () => ({ status: "PAID" }));
    expect(await syncSentInvoices({ request } as unknown as PayPalClient)).toBe(1);
    expect((await invoice("deposit")).status).toBe("paid");
    expect(request).toHaveBeenCalledTimes(1); // the balance draft is not checked
  });
});
