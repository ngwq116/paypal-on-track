import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const aiModel = (): string => process.env.AI_MODEL || DEFAULT_MODEL;

// The slice of the SDK we use, so tests can pass a fake.
export type AiClient = Pick<Anthropic, "messages">;

let client: AiClient | null = null;

export function aiFromEnv(): AiClient {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY in .env");
    client ??= new Anthropic();  // reads ANTHROPIC_API_KEY
    return client;
}