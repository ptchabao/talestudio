import { describe, expect, it } from "vitest";
import { scriptUserPrompt } from "./prompts";
import type { ScriptRequest } from "./types";

const req: ScriptRequest = {
  title: "Pilot",
  premise: "A lighthouse keeper finds a map",
  style: "cinematic",
  durationSec: 30,
  language: "fr",
  number: 1,
  format: "episode",
  project: { title: "Series", description: "Bible", characters: [], previously: [] },
};

describe("platform guidance", () => {
  it("adds the frame and each platform's preferences", () => {
    const p = scriptUserPrompt({ ...req, platforms: ["tiktok", "youtube"], formats: ["9:16", "16:9"] }, 6, 5);
    expect(p).toContain("Frame: vertical 9:16");
    expect(p).toContain("re-framed to horizontal 16:9");
    expect(p).toContain("TikTok: hook in the first 2 seconds");
    expect(p).toContain("YouTube: cinematic widescreen");
  });

  it("leaves the prompt unchanged without platforms or formats", () => {
    expect(scriptUserPrompt(req, 6, 5)).not.toContain("<platforms>");
  });
});
