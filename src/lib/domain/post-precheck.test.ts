import { describe, expect, it } from "vitest";
import { suggestTicks } from "./post-precheck";

const brief = { brandTag: "@kopikita", hashtags: ["#KopiKitaPagi", "#ad"], windowStart: "2026-10-20", windowEnd: "2026-10-22" };
const seen = { brandTagsSeen: ["@KopiKita"], hashtagsSeen: ["#kopikitapagi", "#ad", "#coffee"], postedOn: "2026-10-21", confidence: 0.9 };

describe("suggestTicks", () => {
  it("ticks what the AI saw, ignoring case, with a reason per item", () => {
    expect(suggestTicks(brief, seen)).toEqual({
      ticked: ["brandTag", "hashtags", "window"],
      reasons: { brandTag: "Saw @kopikita", hashtags: "Saw #KopiKitaPagi #ad", window: "Posted Oct 21, inside Oct 20 – Oct 22" },
    });
  });
  it("leaves an item unticked and says what is missing", () => {
    expect(suggestTicks(brief, { ...seen, brandTagsSeen: [], hashtagsSeen: ["#KopiKitaPagi"], postedOn: "2026-10-25" })).toEqual({
      ticked: [],
      reasons: { brandTag: "Didn't see @kopikita", hashtags: "Missing #ad", window: "Posted Oct 25, outside Oct 20 – Oct 22" },
    });
    expect(suggestTicks(brief, { ...seen, postedOn: "" }).reasons.window).toBe("No posting date visible");
  });
  it("suggests nothing when the AI couldn't read the screenshot well", () => {
    const r = suggestTicks(brief, { ...seen, confidence: 0.3 });
    expect(r.ticked).toEqual([]);
    expect(r.reasons.brandTag).toBe("The AI couldn't read the screenshot clearly; check it yourself");
  });
});
