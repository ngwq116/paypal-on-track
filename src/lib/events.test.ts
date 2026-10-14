import { describe, it, expect } from "vitest";
import { addDays, toTimeline, type TimelineInput } from "./events";

const input: TimelineInput = {
  client: { id: "cl", name: "Kopi Kita Sdn Bhd" },
  assignments: [
    { id: "as1", creatorId: "cr1", creatorName: "@jasonlifts", creatorType: "influencer", dueDate: "2026-10-24", status: "verified", feeCents: 120000 },
    { id: "as2", creatorId: "cr2", creatorName: "Daniel Lim", creatorType: "freelancer", dueDate: "2026-10-27", status: "held", feeCents: 100000 },
  ],
  invoices: [{ id: "inv1", kind: "deposit", amountCents: 600000, dueDate: "2026-10-16", status: "paid" }],
  payouts: [{ id: "po1", assignmentId: "as1", amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval" }],
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
    expect(byId["payout-po1"]).toMatchObject({ kind: "payout", draggable: false, resourceId: "cr1", eventColor: "yellow", name: "Awaiting approval $1,200" });
  });

  it("never lets an event be resized", () => {
    expect(events.every((e) => e.resizable === false)).toBe(true);
  });
});
