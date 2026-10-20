import { z } from "zod";
import { isDay } from "./format";
import { parseUsdToCents } from "./money";
import type { PostBrief } from "./types";

// The review form edits strings exactly as typed (or as the AI read them); parseContractForm turns them into terms.
export const CreatorLineSchema = z.object({
  creatorId: z.string(), // roster id, or "" for a new creator
  name: z.string(),
  type: z.enum(["influencer", "freelancer"]),
  detail: z.string(),
  paypalEmail: z.string(),
  deliverable: z.string(),
  fee: z.string(),
  dueDate: z.string(),
  payoutDate: z.string(),
  brandTag: z.string(),
  hashtags: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
});

export const ContractFormSchema = z.object({
  campaignName: z.string(),
  clientName: z.string(),
  clientEmail: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  totalFee: z.string(),
  depositAmount: z.string(),
  depositDueDate: z.string(),
  balanceAmount: z.string(),
  balanceDueDate: z.string(),
  creators: z.array(CreatorLineSchema),
});

// What the AI returns: the same, without roster ids.
export const ContractReadingSchema = ContractFormSchema.extend({ creators: z.array(CreatorLineSchema.omit({ creatorId: true })) });

export type CreatorLine = z.infer<typeof CreatorLineSchema>;
export type ContractForm = z.infer<typeof ContractFormSchema>;
export type ContractReading = z.infer<typeof ContractReadingSchema>;
export type RosterCreator = { id: string; name: string; type: "influencer" | "freelancer"; detail: string; paypalEmail: string };

export interface CampaignTerms {
  campaignName: string;
  clientName: string;
  clientEmail: string;
  startDate: string;
  endDate: string;
  totalCents: number;
  depositCents: number;
  depositDueDate: string;
  balanceCents: number;
  balanceDueDate: string;
  creators: Array<{
    creatorId: string | null;
    name: string;
    type: "influencer" | "freelancer";
    detail: string;
    paypalEmail: string;
    deliverable: string;
    feeCents: number;
    dueDate: string;
    payoutDate: string;
    brief: PostBrief | null;
  }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// R4: only an exact name match (ignoring case and spaces) links a roster creator. Never guess a payee.
export function matchRoster(name: string, roster: Array<{ id: string; name: string }>): string {
  const key = name.trim().toLowerCase();
  const hits = roster.filter((r) => r.name.trim().toLowerCase() === key);
  return key && hits.length === 1 ? hits[0].id : "";
}

// A linked roster creator keeps the roster's payout details: the roster, not the PDF, decides where money goes.
export function formFromReading(reading: ContractReading, roster: RosterCreator[]): ContractForm {
  return {
    ...reading,
    creators: reading.creators.map((c) => {
      const r = roster.find((x) => x.id === matchRoster(c.name, roster));
      return r ? { ...c, creatorId: r.id, name: r.name, type: r.type, detail: r.detail, paypalEmail: r.paypalEmail } : { ...c, creatorId: "" };
    }),
  };
}

// R2: live numbers for the review form.
export function contractTotals(f: ContractForm) {
  const totalCents = parseUsdToCents(f.totalFee);
  const deposit = parseUsdToCents(f.depositAmount);
  const balance = parseUsdToCents(f.balanceAmount);
  const creatorCents = f.creators.reduce((sum, c) => sum + (parseUsdToCents(c.fee) ?? 0), 0);
  return {
    totalCents,
    creatorCents,
    marginCents: totalCents === null ? null : totalCents - creatorCents,
    splitOk: totalCents !== null && deposit !== null && balance !== null && deposit + balance === totalCents,
  };
}

export function parseContractForm(f: ContractForm): { ok: true; terms: CampaignTerms } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const need = (v: string, label: string) => {
    if (!v.trim()) errors.push(`${label} is required`);
  };
  const day = (v: string, label: string) => {
    if (!isDay(v)) errors.push(`${label} must be a date`);
  };
  const money = (v: string, label: string): number => {
    const cents = parseUsdToCents(v);
    if (cents === null) errors.push(`${label} must be an amount like 1,200.00`);
    return cents ?? 0;
  };
  const ordered = (a: string, b: string, message: string) => {
    if (isDay(a) && isDay(b) && b < a) errors.push(message);
  };

  need(f.campaignName, "Campaign name");
  need(f.clientName, "Client name");
  if (!EMAIL.test(f.clientEmail.trim())) errors.push("Client email must be an email address");
  day(f.startDate, "Start date");
  day(f.endDate, "End date");
  ordered(f.startDate, f.endDate, "End date is before the start date");
  const totalCents = money(f.totalFee, "Total fee");
  const depositCents = money(f.depositAmount, "Deposit");
  const balanceCents = money(f.balanceAmount, "Balance");
  day(f.depositDueDate, "Deposit due date");
  day(f.balanceDueDate, "Balance due date");
  if (totalCents && depositCents && balanceCents && depositCents + balanceCents !== totalCents) {
    errors.push("Deposit and balance must add up to the total fee");
  }
  if (f.creators.length === 0) errors.push("Add at least one creator");

  const creators = f.creators.map((c, i) => {
    const who = `Creator ${i + 1}${c.name.trim() ? ` (${c.name.trim()})` : ""}`;
    need(c.name, `${who}: name`);
    need(c.deliverable, `${who}: deliverable`);
    if (!EMAIL.test(c.paypalEmail.trim())) errors.push(`${who}: PayPal email must be an email address`);
    const feeCents = money(c.fee, `${who}: fee`);
    day(c.dueDate, `${who}: due date`);
    day(c.payoutDate, `${who}: payout date`);
    ordered(c.dueDate, c.payoutDate, `${who}: payout date is before the due date`);
    let brief: PostBrief | null = null;
    if (c.type === "influencer") {
      const hashtags = c.hashtags
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((h) => (h.startsWith("#") ? h : `#${h}`));
      need(c.brandTag, `${who}: brand tag`);
      if (!hashtags.length) errors.push(`${who}: add at least one hashtag`);
      day(c.windowStart, `${who}: posting window start`);
      day(c.windowEnd, `${who}: posting window end`);
      ordered(c.windowStart, c.windowEnd, `${who}: posting window ends before it starts`);
      brief = { brandTag: c.brandTag.trim(), hashtags, windowStart: c.windowStart, windowEnd: c.windowEnd };
    }
    return {
      creatorId: c.creatorId || null,
      name: c.name.trim(),
      type: c.type,
      detail: c.detail.trim(),
      paypalEmail: c.paypalEmail.trim(),
      deliverable: c.deliverable.trim(),
      feeCents,
      dueDate: c.dueDate,
      payoutDate: c.payoutDate,
      brief,
    };
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    terms: {
      campaignName: f.campaignName.trim(),
      clientName: f.clientName.trim(),
      clientEmail: f.clientEmail.trim(),
      startDate: f.startDate,
      endDate: f.endDate,
      totalCents,
      depositCents,
      depositDueDate: f.depositDueDate,
      balanceCents,
      balanceDueDate: f.balanceDueDate,
      creators,
    },
  };
}
