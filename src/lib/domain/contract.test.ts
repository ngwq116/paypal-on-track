import { describe, expect, it } from "vitest";
import { isDay } from "./format";
import { contractTotals, formFromReading, matchRoster, parseContractForm, type ContractForm } from "./contract";

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
    {
      creatorId: "",
      name: "@sara.sips",
      type: "influencer",
      detail: "Instagram",
      paypalEmail: "sara@example.com",
      deliverable: "1 Reel",
      fee: "2,500.00",
      dueDate: "2026-11-10",
      payoutDate: "2026-11-13",
      brandTag: "@tehtarikco",
      hashtags: "#RayaWithTehTarik ad",
      windowStart: "2026-11-09",
      windowEnd: "2026-11-11",
    },
    {
      creatorId: "c-lina",
      name: "Lina Ho",
      type: "freelancer",
      detail: "Photography",
      paypalEmail: "lina@example.com",
      deliverable: "10 product photos",
      fee: "1,500",
      dueDate: "2026-11-06",
      payoutDate: "2026-11-09",
      brandTag: "",
      hashtags: "",
      windowStart: "",
      windowEnd: "",
    },
  ],
});

describe("isDay", () => {
  it("accepts real YYYY-MM-DD days only", () => {
    expect(isDay("2026-11-30")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("30/11/2026")).toBe(false);
    expect(isDay("")).toBe(false);
  });
});

describe("parseContractForm", () => {
  it("turns the reviewed form into cents, briefs and roster ids", () => {
    const r = parseContractForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.terms).toMatchObject({ totalCents: 800000, depositCents: 400000, balanceCents: 400000 });
    expect(r.terms.creators[0]).toMatchObject({
      creatorId: null,
      feeCents: 250000,
      brief: { brandTag: "@tehtarikco", hashtags: ["#RayaWithTehTarik", "#ad"], windowStart: "2026-11-09", windowEnd: "2026-11-11" },
    });
    expect(r.terms.creators[1]).toMatchObject({ creatorId: "c-lina", feeCents: 150000, brief: null });
  });
  it("requires deposit + balance to equal the total", () => {
    expect(parseContractForm({ ...form(), depositAmount: "3,000.00" })).toEqual({ ok: false, errors: ["Deposit and balance must add up to the total fee"] });
  });
  it("names the creator and field for each problem", () => {
    const f = form();
    f.creators[0] = { ...f.creators[0], paypalEmail: "sara", payoutDate: "2026-11-01", windowEnd: "2026-11-01" };
    f.creators[1] = { ...f.creators[1], fee: "1.234" };
    const r = parseContractForm(f);
    expect(r).toEqual({
      ok: false,
      errors: [
        "Creator 1 (@sara.sips): PayPal email must be an email address",
        "Creator 1 (@sara.sips): payout date is before the due date",
        "Creator 1 (@sara.sips): posting window ends before it starts",
        "Creator 2 (Lina Ho): fee must be an amount like 1,200.00",
      ],
    });
  });
  it("needs at least one creator and real dates", () => {
    const r = parseContractForm({ ...form(), creators: [], endDate: "2026-10-01" });
    expect(r).toEqual({ ok: false, errors: ["End date is before the start date", "Add at least one creator"] });
  });
});

describe("contractTotals", () => {
  it("adds up creator fees and the agency margin as the form changes", () => {
    expect(contractTotals(form())).toEqual({ totalCents: 800000, creatorCents: 400000, marginCents: 400000, splitOk: true });
    expect(contractTotals({ ...form(), totalFee: "", depositAmount: "1" })).toEqual({ totalCents: null, creatorCents: 400000, marginCents: null, splitOk: false });
  });
});

describe("matchRoster", () => {
  const roster = [
    { id: "1", name: "@aina.eats" },
    { id: "2", name: "Daniel Lim" },
    { id: "3", name: "Sam Lee" },
    { id: "4", name: "sam lee" },
  ];
  it("matches the exact name, ignoring case and spaces", () => {
    expect(matchRoster(" daniel lim ", roster)).toBe("2");
  });
  it("never guesses: a partial name or two people with the same name match nobody", () => {
    expect(matchRoster("Aina", roster)).toBe("");
    expect(matchRoster("Sam Lee", roster)).toBe("");
    expect(matchRoster("", roster)).toBe("");
  });
});

describe("formFromReading", () => {
  it("links roster creators and takes their payout details from the roster", () => {
    const { creators, ...rest } = form();
    const reading = { ...rest, creators: creators.map(({ creatorId: _, ...c }) => c) };
    const roster = [{ id: "r1", name: "Lina Ho", type: "freelancer" as const, detail: "Photos", paypalEmail: "lina.real@example.com" }];
    const f = formFromReading(reading, roster);
    expect(f.creators[0].creatorId).toBe("");
    expect(f.creators[1]).toMatchObject({ creatorId: "r1", paypalEmail: "lina.real@example.com", detail: "Photos" });
  });
});
