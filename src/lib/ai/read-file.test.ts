import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiClient } from "./client";
import { AiReadError, fileBlock, readFileAsJson } from "./read-file";

const pdf = { name: "a.pdf", type: "application/pdf", size: 3, bytes: Buffer.from("abc") };
const png = { ...pdf, name: "a.png", type: "image/png" };
const Schema = z.object({ amount: z.string() });
const JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["amount"], properties: { amount: { type: "string" } } };

function fakeAi(reply: { text?: string; stop_reason?: string }) {
  const create = vi.fn();
  create.mockResolvedValue({
    model: "claude-haiku-5-5",
    stop_reason: reply.stop_reason ?? "end_turn",
    content: reply.text === undefined ? [] : [{ type: "text", text: reply.text }],
  });
  return { ai: { messages: { create } } as unknown as AiClient, create };
}
const ask = (ai: AiClient, file = pdf) => readFileAsJson(ai, { file, instructions: "Read it", jsonSchema: JSON_SCHEMA, parse: Schema });

afterEach(() => vi.unstubAllEnvs());

describe("fileBlock", () => {
  it("sends a PDF as a base64 document block and an image as an image block", () => {
    expect(fileBlock(pdf)).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "YWJj" } });
    expect(fileBlock(png)).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "YWJj" } });
  });
  it("refuses any other file type", () => {
    expect(() => fileBlock({ ...pdf, type: "image/svg+xml" })).toThrow(AiReadError);
  });
});

describe("readFileAsJson", () => {
  it("asks the AI_MODEL model for schema-shaped JSON and returns the validated object", async () => {
    vi.stubEnv("AI_MODEL", "claude-sonnet-5-5");
    const { ai, create } = fakeAi({ text: '{"amount":"1,200.00"}' });
    expect(await ask(ai)).toEqual({ data: { amount: "1,200.00" }, model: "claude-haiku-5-5" });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.output_config).toEqual({ format: { type: "json_schema", schema: JSON_SCHEMA } });
    expect(req.messages[0].content.map((b: { type: string }) => b.type)).toEqual(["document", "text"]);
  });
  it("defaults to Claude Haiku 5.5", async () => {
    vi.stubEnv("AI_MODEL", "");
    const { ai, create } = fakeAi({ text: '{"amount":"1"}' });
    await ask(ai);
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-5-5");
  });
  it("throws AiReadError when the reply is cut off, refused, not JSON, or the wrong shape", async () => {
    await expect(ask(fakeAi({ text: '{"amou', stop_reason: "max_tokens" }).ai)).rejects.toThrow("cut off");
    await expect(ask(fakeAi({ text: "", stop_reason: "refusal" }).ai)).rejects.toThrow("declined");
    await expect(ask(fakeAi({ text: "not json" }).ai)).rejects.toThrow("valid JSON");
    await expect(ask(fakeAi({ text: '{"total":1}' }).ai)).rejects.toThrow("expected fields");
    await expect(ask(fakeAi({}).ai)).rejects.toThrow(AiReadError);
  });
});
