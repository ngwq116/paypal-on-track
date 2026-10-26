import { describe, expect, it } from "vitest";
import { currentStaff, isStaff } from "./staff";

describe("currentStaff", () => {
  it("is the signed-in staff member, so every action is recorded under a real name (R17, R21)", () => {
    expect(currentStaff()).toBe("Wanz");
    expect(isStaff(currentStaff())).toBe(true);
  });
  it("isStaff rejects anyone else", () => {
    expect(isStaff("Mallory")).toBe(false);
    expect(isStaff("wanz")).toBe(false); // names are exact, case included
  });
});
