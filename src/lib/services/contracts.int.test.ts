import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContractForm } from "@/lib/domain/contract";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { confirmContract, getContractDraft, saveContractDraft } from "./contracts";

const pdf = { name: "contract.pdf", type: "application/pdf", size: 3, bytes: Buffer.from([1, 2, 3]) };
const form = (): ContractForm => ({
  campaignName: "Teh Tarik · Raya Push",
  clientName: "Teh Tarik Co",
  clientEmail: "billing@tehtarik.example",
  startDate: "2026-11-02",
  endDate: "2026-11-30",
  totalFee: "8,000.00",
  depositAmount: "4,000.00",
  depositDueDate: "2026-11-02",
  balanceAmount: "4,000.00",
  balanceDueDate: "2026-11-30",
  creators: [
    { creatorId: "", name: "@sara.sips", type: "influencer", detail: "Instagram", paypalEmail: "sara@example.com", deliverable: "1 Reel", fee: "2,500.00", dueDate: "2026-11-10", payoutDate: "2026-11-13", brandTag: "@tehtarikco", hashtags: "#RayaWithTehTarik #ad", windowStart: "2026-11-09", windowEnd: "2026-11-11" },
    { creatorId: "", name: "Lina Ho", type: "freelancer", detail: "Photography", paypalEmail: "lina@example.com", deliverable: "10 product photos", fee: "1,500.00", dueDate: "2026-11-06", payoutDate: "2026-11-09", brandTag: "", hashtags: "", windowStart: "", windowEnd: "" },
  ],
});
const draft = (f = form()) => saveContractDraft({ file: pdf, form: f, model: "claude-haiku-5-5", actor: "Mei Tan" });
const campaignCount = async () => (await db.select().from(schema.campaigns)).length;

beforeEach(resetDb);

describe("confirmContract", () => {
  it("creates the campaign, its assignments and both draft invoices (R3)", async () => {
    const contractId = await draft();
    const r = await confirmContract({ contractId, form: form(), actor: "Mei Tan" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, r.campaignId));
    expect(campaign).toMatchObject({ name: "Teh Tarik · Raya Push", startDate: "2026-11-02", endDate: "2026-11-30", depositCleared: false });
    const assignments = await db.select().from(schema.assignments).where(eq(schema.assignments.campaignId, r.campaignId));
    expect(assignments.map((a) => [a.deliverable, a.feeCents, a.payoutDate]).sort()).toEqual([
      ["1 Reel", 250000, "2026-11-13"],
      ["10 product photos", 150000, "2026-11-09"],
    ]);
    expect(assignments.find((a) => a.feeCents === 250000)?.brief).toMatchObject({ hashtags: ["#RayaWithTehTarik", "#ad"] });
    const invoices = await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, r.campaignId));
    expect(invoices.map((i) => [i.kind, i.amountCents, i.dueDate, i.status]).sort()).toEqual([
      ["balance", 400000, "2026-11-30", "draft"],
      ["deposit", 400000, "2026-11-02", "draft"],
    ]);
    expect(await getContractDraft(contractId)).toMatchObject({ status: "confirmed", campaignId: r.campaignId });
    expect((await db.select().from(schema.auditEvents)).map((a) => a.action)).toEqual(expect.arrayContaining(["contract.read", "campaign.created"]));
  });

  it("reuses a roster creator and an existing client instead of duplicating them (R4)", async () => {
    const { creator } = await seedAssignment(); // client "Client Co", creator "@tester"
    const f = form();
    f.clientName = "client co";
    f.creators[0] = { ...f.creators[0], creatorId: creator.id };
    await confirmContract({ contractId: await draft(f), form: f, actor: "Mei Tan" });
    expect(await db.select().from(schema.clients)).toHaveLength(1);
    expect(await db.select().from(schema.creators)).toHaveLength(2); // @tester (reused) + Lina Ho (new)
  });

  it("refuses invalid terms, creates nothing, and keeps the person's edits", async () => {
    const contractId = await draft();
    const f = { ...form(), depositAmount: "3,000.00" };
    expect(await confirmContract({ contractId, form: f, actor: "Mei Tan" })).toEqual({ ok: false, errors: ["Deposit and balance must add up to the total fee"] });
    expect(await campaignCount()).toBe(0);
    expect((await getContractDraft(contractId))?.extracted.depositAmount).toBe("3,000.00");
  });

  it("creates one campaign even when confirmed twice at the same moment", async () => {
    const contractId = await draft();
    const results = await Promise.all([confirmContract({ contractId, form: form(), actor: "Mei Tan" }), confirmContract({ contractId, form: form(), actor: "Hana Aziz" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, errors: ["This contract already created a campaign"] });
    expect(await campaignCount()).toBe(1);
  });
});
