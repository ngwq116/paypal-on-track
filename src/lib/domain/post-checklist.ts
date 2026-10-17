import { formatDay } from "./format";
import { PostBrief } from "./types";

export type ChecklistItemId = "brandTag" | "hashtags" | "window";
export interface ChecklistItem {
    id: ChecklistItemId;
    label: string;
    hint: string;
}

export const checklistFor = (brief: PostBrief): ChecklistItem[] => {
    return [
        { id: "brandTag", label: "Brand tagged", hint: `${brief.brandTag} appears in the caption or on screen`},
        { id: "hashtags", label: "Required hashtags", hint: brief.hashtags.join(" and ")},
        { id: "window", label: "Posted inside the window", hint: `Between ${formatDay(brief.windowStart)} and ${formatDay(brief.windowEnd)}`}
    ]
}

export type PostCheckDecision = 
| { kind: "verified"; ticked: ChecklistItemId[] }
| { kind: "held"; ticked: ChecklistItemId[]; missing: string[]; note: string }
| { kind: "invalid"; error: string }

// R8: all items ticked -> verified. "Hold" needs a note saying what is missing
export const decidePostCheck = (
    input: { brief: PostBrief; ticked: string[]; intent: "verify" | "hold"; note: string}
): PostCheckDecision => {
    const items = checklistFor(input.brief);
    const ticked = items.filter((i) => input.ticked.includes(i.id)).map((i) => i.id);
    const missing = items.filter((i) => !ticked.includes(i.id)).map(i => i.label);

    if (input.intent === "verify") {
        if (missing.length) return { kind: "invalid", error: `Tick every item to verify. Missing: ${missing.join(", ")}`};
        return { kind: "verified", ticked};
    }

    const note = input.note.trim();
    if (!note) return { kind: "invalid", error: "A note is required to hold"};
    return { kind: "held", ticked, missing, note };
}