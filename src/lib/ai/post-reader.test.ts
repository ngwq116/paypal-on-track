import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "./client";
import { POST_JSON_SCHEMA, PostObservationSchema, readPost } from "./post-reader";

describe("POST_JSON_SCHEMA", () => {
  it("asks for exactly the fields Zod checks", () => {
    expect([...POST_JSON_SCHEMA.required].sort()).toEqual(Object.keys(PostObservationSchema.shape).sort());
    expect(POST_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("readPost", () => {
  it("sends the screenshot with today's date so relative dates can be resolved", async () => {
    const reply = { brandTagsSeen: ["@kopikita"], hashtagsSeen: ["#ad"], postedOn: "2026-10-21", confidence: 0.9 };
    const create = vi.fn();
    create.mockResolvedValue({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] });
    const file = { name: "post.png", type: "image/png", size: 3, bytes: Buffer.from("abc") };
    expect(await readPost({ messages: { create } } as unknown as AiClient, file, "2026-10-23")).toEqual({ data: reply, model: "claude-haiku-5-5" });
    const text = create.mock.calls[0][0].messages[0].content[1].text as string;
    expect(text).toContain("2026-10-23");
  });
});
