import { afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { demoResetEnabled, seedDemo } from "./seed";

const emails = { creator: "creator@example.com", client: "client@example.com" };
const count = async () => ({
  campaigns: (await db.select().from(schema.campaigns)).length,
  creators: (await db.select().from(schema.creators)).length,
  payouts: (await db.select().from(schema.payouts)).length,
});

afterEach(() => vi.unstubAllEnvs());

describe("seedDemo", () => {
  it("roster mode leaves only the client and the four creators", async () => {
    expect(await seedDemo("roster", emails)).toBeNull();
    expect(await count()).toEqual({ campaigns: 0, creators: 4, payouts: 0 });
  });
  it("mid mode loads the campaign with one paid and one waiting payout, and wipes what was there", async () => {
    await seedDemo("mid", emails);
    const id = await seedDemo("mid", emails);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await count()).toEqual({ campaigns: 1, creators: 4, payouts: 2 });
  });
});

describe("demoResetEnabled", () => {
  it("is on only when DEMO_RESET is exactly 1", () => {
    vi.stubEnv("DEMO_RESET", "");
    expect(demoResetEnabled()).toBe(false);
    vi.stubEnv("DEMO_RESET", "true");
    expect(demoResetEnabled()).toBe(false);
    vi.stubEnv("DEMO_RESET", "1");
    expect(demoResetEnabled()).toBe(true);
  });
});
