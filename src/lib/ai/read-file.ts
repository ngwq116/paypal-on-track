import type Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import type { UploadedFile } from "@/lib/domain/upload";
import { aiModel, type AiClient } from "./client";

// A reading problem the person can act on ("type it yourself"), as opposed to a bug.
export class AiReadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AiReadError";
    }
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export function fileBlock(file: UploadedFile) {
    const data = file.bytes.toString("base64");
    if (file.type === "application/pdf") {
        return { type: "document" as const, source: {type: "base64" as const, media_type: "application/pdf" as const, data} }
    }

    if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
        return { type: "image" as const, source: { type: "base64" as const, media_type: file.type as ImageType, data}}
    }

    throw new AiReadError(`Can't read ${file.type || "this"} files`);
}

// Any content in, one validated JSON object out. The schema constrains Claude's output; Zod checks it again,
// because the rest of the app trusts these types.
export async function askForJson<T>(
  ai: AiClient,
  input: { content: Array<Record<string, unknown>>; jsonSchema: Record<string, unknown>; parse: ZodType<T>; maxTokens?: number },
): Promise<{ data: T; model: string }> {
  const res = await ai.messages.create({
    model: aiModel(),
    max_tokens: input.maxTokens ?? 2048,
    messages: [{ role: "user", content: input.content as unknown as Anthropic.ContentBlockParam[] }],
    output_config: { format: { type: "json_schema", schema: input.jsonSchema } },
  });

  const stop: string | null = res.stop_reason;
  if (stop === "max_tokens") throw new AiReadError("The AI reply was cut off");
  if (stop === "refusal") throw new AiReadError("The AI declined to read this file");

  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new AiReadError("The AI sent no answer");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiReadError("The AI reply wasn't valid JSON");
  }
  const parsed = input.parse.safeParse(json);
  if (!parsed.success) throw new AiReadError("The AI reply didn't have the expected fields");
  return { data: parsed.data, model: res.model };
}

// The one-file case: the file, then the instructions.
export function readFileAsJson<T>(
  ai: AiClient,
  input: { file: UploadedFile; instructions: string; jsonSchema: Record<string, unknown>; parse: ZodType<T>; maxTokens?: number },
) {
  return askForJson(ai, {
    content: [fileBlock(input.file), { type: "text", text: input.instructions }],
    jsonSchema: input.jsonSchema,
    parse: input.parse,
    maxTokens: input.maxTokens,
  });
}
