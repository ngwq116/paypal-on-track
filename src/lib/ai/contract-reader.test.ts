import { describe, expect, it } from "vitest";
import { ContractReadingSchema, CreatorLineSchema } from "@/lib/domain/contract";
import { CONTRACT_JSON_SCHEMA } from "./contract-reader";

describe("CONTRACT_JSON_SCHEMA", () => {
  it("asks for exactly the fields Zod checks, at both levels, with no extra properties", () => {
    expect([...CONTRACT_JSON_SCHEMA.required].sort()).toEqual(Object.keys(ContractReadingSchema.shape).sort());
    const item = CONTRACT_JSON_SCHEMA.properties.creators.items;
    expect([...item.required].sort()).toEqual(Object.keys(CreatorLineSchema.omit({ creatorId: true }).shape).sort());
    expect(CONTRACT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
  });
});
