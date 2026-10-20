import { describe, expect, it } from "vitest";
import { daysBetween, planReschedule } from "./reschedule";

const current = {
  dueDate: "2026-10-27",
  payoutDate: "2026-10-30",
  brief: { brandTag: "@kopikita", hashtags: ["#ad"], windowStart: "2026-10-26", windowEnd: "2026-10-28" },
};

describe("daysBetween", () => {
  it("counts calendar days across a month end", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-11-02", "2026-10-30")).toBe(-3);
  });
});

describe("planReschedule", () => {
  it("moves the due date, the payout date and the posting window by the same number of days", () => {
    expect(planReschedule(current, "2026-10-30", "2026-10-20")).toEqual({
      ok: true,
      changed: true,
      dueDate: "2026-10-30",
      payoutDate: "2026-11-02",
      brief: { brandTag: "@kopikita", hashtags: ["#ad"], windowStart: "2026-10-29", windowEnd: "2026-10-31" },
    });
  });
  it("keeps a freelancer's missing brief missing", () => {
    expect(planReschedule({ ...current, brief: null }, "2026-10-28", "2026-10-20")).toMatchObject({ ok: true, brief: null, payoutDate: "2026-10-31" });
  });
  it("does nothing when dropped back on the same day", () => {
    expect(planReschedule(current, "2026-10-27", "2026-10-20")).toEqual({ ok: true, changed: false, ...current });
  });
  it("refuses a past day or a non-date", () => {
    expect(planReschedule(current, "2026-10-19", "2026-10-20")).toEqual({ ok: false, error: "Can't move a deliverable into the past" });
    expect(planReschedule(current, "2026-13-01", "2026-10-20")).toEqual({ ok: false, error: "That isn't a valid date" });
  });
});
