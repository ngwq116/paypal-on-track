import { formatDay, isDay } from "./format";
import type { PostBrief } from "./types";

export interface PostObservation {
  brandTagsSeen: string[];
  hashtagsSeen: string[];
  postedOn: string; // YYYY-MM-DD or ""
  confidence: number;
}

type Item = "brandTag" | "hashtags" | "window";
const MIN_CONFIDENCE = 0.5;

// R24: the AI reports what it saw; this decides the suggested ticks. Staff still confirm every one.
export function suggestTicks(brief: PostBrief, o: PostObservation): { ticked: Item[]; reasons: Record<Item, string> } {
  if (o.confidence < MIN_CONFIDENCE) {
    const unsure = "The AI couldn't read the screenshot clearly; check it yourself";
    return { ticked: [], reasons: { brandTag: unsure, hashtags: unsure, window: unsure } };
  }
  const lower = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));
  const tags = lower(o.brandTagsSeen);
  const hashtags = lower(o.hashtagsSeen);
  const range = `${formatDay(brief.windowStart)} – ${formatDay(brief.windowEnd)}`;

  const brandOk = tags.has(brief.brandTag.toLowerCase());
  const missing = brief.hashtags.filter((h) => !hashtags.has(h.toLowerCase()));
  const dated = isDay(o.postedOn);
  const inWindow = dated && o.postedOn >= brief.windowStart && o.postedOn <= brief.windowEnd;

  const ticked: Item[] = [];
  if (brandOk) ticked.push("brandTag");
  if (!missing.length) ticked.push("hashtags");
  if (inWindow) ticked.push("window");
  return {
    ticked,
    reasons: {
      brandTag: brandOk ? `Saw ${brief.brandTag}` : `Didn't see ${brief.brandTag}`,
      hashtags: missing.length ? `Missing ${missing.join(" ")}` : `Saw ${brief.hashtags.join(" ")}`,
      window: !dated ? "No posting date visible" : `Posted ${formatDay(o.postedOn)}, ${inWindow ? "inside" : "outside"} ${range}`,
    },
  };
}
