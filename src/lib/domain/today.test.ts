import { describe, it, expect } from "vitest";
import { agencyToday } from "./today";

describe("agencyToday", () => {
    it("is already the next day at 00:30 in Malaysia", () => {
        expect(agencyToday(new Date("2026-10-26T16:30:00Z"))).toBe("2026-10-27");
    });

    it("is still the same day at 23:59 in Malaysia", () => {
        expect(agencyToday(new Date("2026-10-26T15:59:00Z"))).toBe("2026-10-26");
    });
})