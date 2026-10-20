import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { overrideInvoice, submitInvoice, submitPostCheck } from "./verification";
import { verificationLabel } from "./queries";

const png = { name: "post.png", type: "image/png", size: 3, bytes: Buffer.from([1, 2, 3]) };
const ALL = ["brandTag", "hashtags", "window"];
const base = { link: "", note: "", actor: "Mei Tan", today: "2026-10-25" };

beforeEach(resetDb);

const assignmentRow = async (id: string) => (await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)))[0];
const payoutsFor = (id: string) => db.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, id));

describe("submitPostCheck", () => {
  it("verifies the post and queues a payout of the contract fee on the contract payout date (R9)", async () => {
    const { assignment } = await seedAssignment();
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("verified");
    expect(await payoutsFor(assignment.id)).toMatchObject([{ status: "awaiting_approval", amountCents: 120000, scheduledFor: "2026-10-29" }]);
  });
  it("schedules a late verification for today, never in the past", async () => {
    const { assignment } = await seedAssignment({ payoutDate: "2026-10-20" });
    await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" });
    expect((await payoutsFor(assignment.id))[0].scheduledFor).toBe("2026-10-25");
  });
  it("holds with a note and creates no payout", async () => {
    const { assignment } = await seedAssignment();
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ["brandTag"], intent: "hold", note: "No #ad" })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("held");
    expect(await payoutsFor(assignment.id)).toHaveLength(0);
  });
  it("can't verify the same post twice (R16)", async () => {
    const { assignment } = await seedAssignment({ status: "verified" });
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "This post is already verified" });
  });
  it("rejects a PDF or a missing file as post proof", async () => {
    const { assignment } = await seedAssignment();
    const pdf = { ...png, type: "application/pdf" };
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: pdf, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "Upload a PNG, JPEG or WebP image" });
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: null, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "Upload the post screenshot" });
  });
  it("refuses a checklist for a freelancer", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "This assignment has no post checklist" });
  });
});

const pdf = { name: "INV-0142.pdf", type: "application/pdf", size: 3, bytes: Buffer.from([1, 2, 3]) };
const fields = { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 x 30s product video edits", amount: "1,000.00" };
const who = { actor: "Mei Tan", today: "2026-10-27" };

describe("submitInvoice", () => {
  it("a matching invoice verifies the work and queues the contract fee (R12)", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, assignmentId: assignment.id, file: pdf })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("verified");
    expect(await payoutsFor(assignment.id)).toMatchObject([{ amountCents: 100000, status: "awaiting_approval" }]);
  });
  it("a $1,200 invoice on a $1,000 contract is held with both values recorded, and no payout", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, amount: "1,200.00", assignmentId: assignment.id, file: pdf })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("held");
    expect(await payoutsFor(assignment.id)).toHaveLength(0);
    const [v] = await db.select().from(schema.verifications);
    expect(v).toMatchObject({ task: "invoice_match", pass: false });
    expect((v.checks as { fields: Array<{ field: string; contract: string; invoice: string; ok: boolean }> }).fields).toContainEqual({
      field: "amount", label: "Amount", contract: "$1,000.00", invoice: "$1,200.00", ok: false,
    });
  });
  it("rejects an amount it can't read", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, amount: "12.345", assignmentId: assignment.id, file: pdf })).toEqual({ ok: false, reason: "Enter the invoiced amount like 1,200.00" });
  });
});

describe("overrideInvoice", () => {
  it("pays the contract fee, not the higher invoiced amount, and logs the reason", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    await submitInvoice({ ...who, ...fields, amount: "1,200.00", assignmentId: assignment.id, file: pdf });
    expect(await overrideInvoice({ ...who, assignmentId: assignment.id, reason: "Client approved an extra revision" })).toEqual({ ok: true });
    expect(await payoutsFor(assignment.id)).toMatchObject([{ amountCents: 100000, status: "awaiting_approval" }]);
    const actions = (await db.select().from(schema.auditEvents)).map((a) => a.action);
    expect(actions).toContain("invoice.override");
  });
  it("pays the lower invoiced amount when the invoice is under the fee", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    await submitInvoice({ ...who, ...fields, amount: "900", assignmentId: assignment.id, file: pdf });
    await overrideInvoice({ ...who, assignmentId: assignment.id, reason: "Partial delivery agreed" });
    expect((await payoutsFor(assignment.id))[0].amountCents).toBe(90000);
  });
  it("needs a reason, and a held invoice to override", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await overrideInvoice({ ...who, assignmentId: assignment.id, reason: " " })).toEqual({ ok: false, reason: "A reason is required to override" });
    expect(await overrideInvoice({ ...who, assignmentId: assignment.id, reason: "x" })).toEqual({ ok: false, reason: "There is no held invoice to override" });
  });
});

describe("submitInvoice read by AI", () => {
  it("stores an AI verification with the model and confidence, and labels it", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, assignmentId: assignment.id, file: pdf, reader: { model: "claude-haiku-5-5", confidence: 0.92 } })).toEqual({ ok: true });
    const [v] = await db.select().from(schema.verifications);
    expect(v).toMatchObject({ source: "ai", task: "invoice_match", pass: true });
    expect(v.checks).toMatchObject({ reader: { model: "claude-haiku-5-5", confidence: 0.92 } });
    expect(await verificationLabel(assignment.id)).toBe("Invoice matches (AI read) · Mei Tan");
  });
  it("holds an invoice billed in another currency", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    await submitInvoice({ ...who, ...fields, currency: "MYR", assignmentId: assignment.id, file: pdf });
    expect((await assignmentRow(assignment.id)).status).toBe("held");
  });
});
