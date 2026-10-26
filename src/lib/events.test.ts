import { describe, it, expect } from "vitest";
import { addDays, timelineRange, toTimeline, type TimelineInput } from "./events";

const input: TimelineInput = {
  campaignId: "cp",
  today: "2026-10-20",
  client: { id: "cl", name: "Kopi Kita Sdn Bhd" },
  assignments: [
    { id: "as1", creatorId: "cr1", creatorName: "@jasonlifts", creatorType: "influencer", deliverable: "1 TikTok video", dueDate: "2026-10-24", status: "verified", feeCents: 120000, verified: "Post checklist · Wanz" },
    { id: "as2", creatorId: "cr2", creatorName: "Daniel Lim", creatorType: "freelancer", deliverable: "2 × 30s product video edits", dueDate: "2026-10-27", status: "held", feeCents: 100000, verified: "Not verified" },
  ],
  invoices: [{ id: "inv1", kind: "deposit", amountCents: 600000, dueDate: "2026-10-16", status: "paid", paypalInvoiceId: "INV2-1" }],
  payouts: [{ id: "po1", assignmentId: "as1", amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval", statusReason: null }],
};

describe("addDays", () => {
  it("adds days across a month boundary without timezone drift", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-27", 0)).toBe("2026-10-27");
  });
});

describe("toTimeline", () => {
  const { resources, events } = toTimeline(input);

  it("has a Client row first, then one row per creator", () => {
    expect(resources.map((r) => r.name)).toEqual(["Kopi Kita Sdn Bhd", "@jasonlifts", "Daniel Lim"]);
  });

  it("makes posts and deliverables draggable, invoices and payouts fixed", () => {
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(byId["assignment-as1"]).toMatchObject({ kind: "post", draggable: true, resourceId: "cr1", startDate: "2026-10-24", endDate: "2026-10-25" });
    expect(byId["assignment-as2"]).toMatchObject({ kind: "deliverable", draggable: true, eventColor: "red" });
    expect(byId["invoice-inv1"]).toMatchObject({ kind: "invoice", draggable: false, resourceId: "client", eventColor: "blue" });
    expect(byId["payout-po1"]).toMatchObject({ kind: "payout", draggable: false, resourceId: "cr1", eventColor: "yellow", name: "@jasonlifts · Awaiting approval $1,200" });
  });

  it("gives each event a short label for one-day-wide Team chips", () => {
    const short = Object.fromEntries(events.map((e) => [e.id, e.shortName]));
    expect(short).toEqual({
      "assignment-as1": "Verified", // colour + legend already say "Post"
      "assignment-as2": "Held",
      "invoice-inv1": "Deposit $6,000",
      "payout-po1": "Approve $1,200",
    });
  });

  it("never lets an event be resized", () => {
    expect(events.every((e) => e.resizable === false)).toBe(true);
  });
});

describe("overdue and side panel", () => {
  const late: TimelineInput = {
    ...input,
    today: "2026-10-26",
    assignments: [{ ...input.assignments[0], status: "scheduled" }],
    invoices: [{ ...input.invoices[0], status: "sent", dueDate: "2026-10-25" }],
  };
  const byId = Object.fromEntries(toTimeline(late).events.map((e) => [e.id, e]));

  it("turns a past-due post or unpaid invoice red (R13)", () => {
    expect(byId["assignment-as1"]).toMatchObject({ eventColor: "red", shortName: "Overdue" });
    expect(byId["invoice-inv1"]).toMatchObject({ eventColor: "red", shortName: "Overdue" });
  });

  it("gives every event its record id and the details and links for the side panel (R18)", () => {
    const { events } = toTimeline(input);
    const e = Object.fromEntries(events.map((x) => [x.id, x]));
    expect(e["assignment-as1"].refId).toBe("as1");
    expect(e["assignment-as1"].panel).toEqual({
      title: "@jasonlifts · 1 TikTok video",
      lines: ["Post due Oct 24", "Fee $1,200.00", "Status: verified", "Verification: Post checklist · Wanz"],
      links: [{ href: "/campaigns/cp/assignments/as1", label: "Verify post" }],
    });
    expect(e["payout-po1"].panel.links).toEqual([
      { href: "/approvals", label: "Approve in the queue" },
      { href: "/approvals/po1", label: "Edit or reject" },
      { href: "/campaigns/cp/audit", label: "Audit log" },
    ]);
    expect(e["invoice-inv1"].panel.lines).toContain("PayPal invoice INV2-1");
  });
});

describe("event names", () => {
  it("lead with the creator, so the Calendar (no rows) shows who each item belongs to", () => {
    const byId = Object.fromEntries(toTimeline(input).events.map((e) => [e.id, e]));
    expect(byId["assignment-as2"].name).toBe("Daniel Lim · Deliverable · held");
    expect(byId["assignment-as2"].shortName).toBe("Held");
  });
});

describe("timelineRange", () => {
  it("spans the whole campaign plus two weeks to drag past its end", () => {
    expect(timelineRange({ startDate: "2026-11-16", endDate: "2026-12-18" }, [])).toEqual({ startDate: "2026-11-16", endDate: "2027-01-01" });
  });

  it("reaches events after the campaign end", () => {
    const late = [{ endDate: "2026-12-25" }];
    expect(timelineRange({ startDate: "2026-11-16", endDate: "2026-12-18" }, late).endDate).toBe("2027-01-08");
  });

  it("shows at least two weeks for a short campaign", () => {
    expect(timelineRange({ startDate: "2026-11-16", endDate: "2026-11-18" }, []).endDate).toBe("2026-12-14");
  });
});
