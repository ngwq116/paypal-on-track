export interface TimelineInput {
  client: { id: string; name: string };
  assignments: Array<{
    id: string;
    creatorId: string;
    creatorName: string;
    creatorType: "influencer" | "freelancer";
    dueDate: string;
    status: "scheduled" | "submitted" | "verified" | "held" | "paid";
    feeCents: number;
  }>;
  invoices: Array<{ id: string; kind: "deposit" | "balance"; amountCents: number; dueDate: string; status: "draft" | "sent" | "paid" }>;
  payouts: Array<{
    id: string;
    assignmentId: string;
    amountCents: number;
    scheduledFor: string;
    status: "awaiting_approval" | "scheduled" | "payout_sent" | "paid" | "payout_failed" | "held";
  }>;
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
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
    events.push({
      id: `assignment-${a.id}`,
      resourceId: a.creatorId,
      name: `${kind === "post" ? "Post" : "Deliverable"} · ${a.status}`,
      shortName: capitalize(a.status),
      ...day(a.dueDate),
      eventColor: a.status === "held" ? "red" : kind === "post" ? "violet" : "orange",
      kind,
      draggable: a.status !== "paid",
      resizable: false,
    });
  }

  for (const inv of input.invoices) {
    events.push({
      id: `invoice-${inv.id}`,
      resourceId: "client",
      name: `${inv.kind === "deposit" ? "Deposit" : "Balance"} ${usd(inv.amountCents)} · ${inv.status}`,
      shortName: `${inv.kind === "deposit" ? "Deposit" : "Balance"} ${usd(inv.amountCents)}`,
      ...day(inv.dueDate),
      eventColor: "blue",
      kind: "invoice",
      draggable: false,
      resizable: false,
    });
  }

  const creatorOf = new Map(input.assignments.map((a) => [a.id, a.creatorId]));
  for (const p of input.payouts) {
    const [label, short, color] = PAYOUT_LABEL[p.status];
    events.push({
      id: `payout-${p.id}`,
      resourceId: creatorOf.get(p.assignmentId) ?? "client",
      name: `${label} ${usd(p.amountCents)}`,
      shortName: `${short} ${usd(p.amountCents)}`,
      ...day(p.scheduledFor),
      eventColor: color,
      kind: "payout",
      draggable: false,
      resizable: false,
    });
  }

  return { resources, events };
}
