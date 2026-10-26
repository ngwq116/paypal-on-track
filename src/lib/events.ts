import { formatDay } from "./domain/format";
import { formatUsd } from "./domain/money";

export interface TimelineInput {
  campaignId: string;
  today: string; // agency date, for "overdue"
  client: { id: string; name: string };
  assignments: Array<{
    id: string;
    creatorId: string;
    creatorName: string;
    creatorType: "influencer" | "freelancer";
    deliverable: string;
    dueDate: string;
    status: "scheduled" | "submitted" | "verified" | "held" | "paid";
    feeCents: number;
    verified: string; // e.g. "Post checklist · Wanz" or "Not verified"
  }>;
  invoices: Array<{ id: string; kind: "deposit" | "balance"; amountCents: number; dueDate: string; status: "draft" | "sent" | "paid"; paypalInvoiceId: string | null }>;
  payouts: Array<{
    id: string;
    assignmentId: string;
    amountCents: number;
    scheduledFor: string;
    status: "awaiting_approval" | "scheduled" | "payout_sent" | "paid" | "payout_failed" | "held";
    statusReason: string | null;
  }>;
}

export interface EventPanelContent {
  title: string;
  lines: string[];
  links: Array<{ href: string; label: string }>;
}

export interface TimelineResource {
  id: string;
  name: string;
}

export interface TimelineEvent {
  id: string;
  resourceId: string;
  name: string;
  shortName: string; // fits a one-day-wide Team chip
  startDate: string;
  endDate: string;
  eventColor: string;
  kind: "post" | "deliverable" | "invoice" | "payout";
  draggable: boolean;
  resizable: false;
  refId: string; // the assignment, invoice or payout id
  panel: EventPanelContent; // R18: what the side panel shows
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Team view range: the whole campaign (and any event past its end), at least two weeks,
// plus two weeks of room so an item can be dragged past the campaign end (R19).
export function timelineRange(
  campaign: { startDate: string; endDate: string },
  events: { endDate: string }[],
): { startDate: string; endDate: string } {
  let last = addDays(campaign.startDate, 14);
  for (const d of [campaign.endDate, ...events.map((e) => e.endDate)]) if (d > last) last = d;
  return { startDate: campaign.startDate, endDate: addDays(last, 14) };
}

const usd = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

// [label, short label, colour]
const PAYOUT_LABEL: Record<TimelineInput["payouts"][number]["status"], [string, string, string]> = {
  awaiting_approval: ["Awaiting approval", "Approve", "yellow"],
  scheduled: ["Scheduled", "Scheduled", "lime"],
  payout_sent: ["Sending", "Sending", "green"],
  paid: ["Paid", "Paid", "green"],
  payout_failed: ["Payout failed", "Failed", "red"],
  held: ["Held", "Held", "red"],
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function toTimeline(input: TimelineInput): { resources: TimelineResource[]; events: TimelineEvent[] } {
  const resources: TimelineResource[] = [{ id: "client", name: input.client.name }];
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (!seen.has(a.creatorId)) {
      seen.add(a.creatorId);
      resources.push({ id: a.creatorId, name: a.creatorName });
    }
  }

  const day = (start: string) => ({ startDate: start, endDate: addDays(start, 1) });
  const events: TimelineEvent[] = [];

  for (const a of input.assignments) {
    const kind = a.creatorType === "influencer" ? "post" : "deliverable";
    const overdue = (a.status === "scheduled" || a.status === "submitted") && a.dueDate < input.today;
    const what = kind === "post" ? "Post" : "Deliverable";
    events.push({
      id: `assignment-${a.id}`,
      refId: a.id,
      resourceId: a.creatorId,
      name: `${a.creatorName} · ${what} · ${overdue ? "overdue" : a.status}`, // the Calendar has no rows, so the name says who
      shortName: overdue ? "Overdue" : capitalize(a.status),
      ...day(a.dueDate),
      eventColor: overdue || a.status === "held" ? "red" : kind === "post" ? "violet" : "orange",
      kind,
      draggable: a.status !== "paid",
      resizable: false,
      panel: {
        title: `${a.creatorName} · ${a.deliverable}`,
        lines: [`${what} due ${formatDay(a.dueDate)}`, `Fee ${formatUsd(a.feeCents)}`, `Status: ${overdue ? "overdue" : a.status}`, `Verification: ${a.verified}`],
        links: [{ href: `/campaigns/${input.campaignId}/assignments/${a.id}`, label: kind === "post" ? "Verify post" : "Check invoice" }],
      },
    });
  }

  for (const inv of input.invoices) {
    const overdue = inv.status === "sent" && inv.dueDate < input.today;
    const label = inv.kind === "deposit" ? "Deposit" : "Balance";
    events.push({
      id: `invoice-${inv.id}`,
      refId: inv.id,
      resourceId: "client",
      name: `${label} ${usd(inv.amountCents)} · ${overdue ? "overdue" : inv.status}`,
      shortName: overdue ? "Overdue" : `${label} ${usd(inv.amountCents)}`,
      ...day(inv.dueDate),
      eventColor: overdue ? "red" : "blue",
      kind: "invoice",
      draggable: false,
      resizable: false,
      panel: {
        title: `${label} invoice · ${input.client.name}`,
        lines: [
          `Amount ${formatUsd(inv.amountCents)}`,
          `Due ${formatDay(inv.dueDate)}`,
          `Status: ${overdue ? "overdue" : inv.status}`,
          inv.paypalInvoiceId ? `PayPal invoice ${inv.paypalInvoiceId}` : "Not created in PayPal yet",
        ],
        links: [{ href: `/campaigns/${input.campaignId}/team`, label: "Invoices on the Team view" }],
      },
    });
  }

  const creatorOf = new Map(input.assignments.map((a) => [a.id, a]));
  for (const p of input.payouts) {
    const [label, short, color] = PAYOUT_LABEL[p.status];
    const a = creatorOf.get(p.assignmentId);
    const open = p.status === "awaiting_approval" || p.status === "scheduled";
    events.push({
      id: `payout-${p.id}`,
      refId: p.id,
      resourceId: a?.creatorId ?? "client",
      name: `${a ? `${a.creatorName} · ` : ""}${label} ${usd(p.amountCents)}`,
      shortName: `${short} ${usd(p.amountCents)}`,
      ...day(p.scheduledFor),
      eventColor: color,
      kind: "payout",
      draggable: false,
      resizable: false,
      panel: {
        title: `Payout · ${a?.creatorName ?? "creator"}`,
        lines: [
          `Amount ${formatUsd(p.amountCents)}${a ? ` (contract fee ${formatUsd(a.feeCents)})` : ""}`,
          `Payout date ${formatDay(p.scheduledFor)}`,
          `Status: ${label}`,
          ...(p.statusReason ? [`Reason: ${p.statusReason}`] : []),
        ],
        links: [
          ...(open ? [{ href: "/approvals", label: p.status === "awaiting_approval" ? "Approve in the queue" : "Send now in the queue" }] : []),
          ...(open ? [{ href: `/approvals/${p.id}`, label: "Edit or reject" }] : []),
          { href: `/campaigns/${input.campaignId}/audit`, label: "Audit log" },
        ],
      },
    });
  }

  return { resources, events };
}
