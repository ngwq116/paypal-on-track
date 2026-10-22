import { describe, expect, it } from "vitest";
import { actorFrom } from "./form";

const form = (actor?: string) => {
  const f = new FormData();
  if (actor !== undefined) f.set("actor", actor);
  return f;
};

describe("actorFrom", () => {
  it("accepts the two staff names only", () => {
    expect(actorFrom(form("Mei Tan"))).toBe("Mei Tan");
    expect(actorFrom(form("Hana Aziz"))).toBe("Hana Aziz");
  });
  it("rejects a missing or tampered name", () => {
    expect(() => actorFrom(form())).toThrow("Unknown staff member");
    expect(() => actorFrom(form("Mallory"))).toThrow("Unknown staff member");
    expect(() => actorFrom(form("mei tan"))).toThrow("Unknown staff member");
  });
});
