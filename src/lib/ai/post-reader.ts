import { z } from "zod";
import type { UploadedFile } from "@/lib/domain/upload";
import type { AiClient } from "./client";
import { readFileAsJson } from "./read-file";

export const PostObservationSchema = z.object({
  brandTagsSeen: z.array(z.string()),
  hashtagsSeen: z.array(z.string()),
  postedOn: z.string(),
  confidence: z.number().min(0).max(1),
});

const strings = (description: string) => ({ type: "array", items: { type: "string" }, description });

export const POST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brandTagsSeen", "hashtagsSeen", "postedOn", "confidence"],
  properties: {
    brandTagsSeen: strings("Every @handle tagged in the caption, on screen or in the tag list, exactly as shown"),
    hashtagsSeen: strings("Every #hashtag in the caption or on screen, exactly as shown"),
    postedOn: { type: "string", description: "Date the post went live as YYYY-MM-DD; empty string if no date is visible" },
    confidence: { type: "number", description: "0 to 1: how clearly you could read the tags, hashtags and date" },
  },
};

// The AI only says what it sees. Whether that satisfies the brief is decided by suggestTicks().
export function readPost(ai: AiClient, file: UploadedFile, today: string) {
  const instructions = [
    "This is a screenshot of a social media post an influencer made for a brand campaign.",
    "List what you can see: tagged @handles, #hashtags and the posting date. Do not judge the post or guess what is not visible.",
    `Today is ${today}; turn relative dates such as "2d" or "yesterday" into a YYYY-MM-DD date.`,
  ].join(" ");
  return readFileAsJson(ai, { file, instructions, jsonSchema: POST_JSON_SCHEMA, parse: PostObservationSchema, maxTokens: 1024 });
}
