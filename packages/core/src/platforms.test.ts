import { describe, expect, it } from "vitest";
import { formatsFor, PLATFORM_IDS, PLATFORMS } from "./studios";
import { createEpisodeInput } from "./schemas";

describe("platforms", () => {
  it("derives unique formats in pick order, the first being the generation frame", () => {
    expect(formatsFor(["tiktok", "youtube", "instagram_reels", "facebook_feed"])).toEqual(["9:16", "16:9", "1:1"]);
    expect(formatsFor(["youtube"])).toEqual(["16:9"]);
  });

  it("describes every platform", () => {
    for (const p of PLATFORM_IDS) expect(PLATFORMS[p].hint.length).toBeGreaterThan(20);
  });

  it("rejects unknown platforms and accepts none", () => {
    const base = { title: "Test", premise: "A long enough premise" };
    expect(createEpisodeInput.safeParse({ ...base, platforms: ["myspace"] }).success).toBe(false);
    expect(createEpisodeInput.safeParse({ ...base, platforms: [] }).success).toBe(false);
    expect(createEpisodeInput.safeParse(base).success).toBe(true);
  });
});
