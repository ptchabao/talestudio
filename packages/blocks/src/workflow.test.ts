import { DEFAULT_EPISODE, episodeTokenCost, estimateEpisodeCogs, MAX_NEW_PORTRAITS, STEP_COSTS } from "@talestudio/core";
import { describe, expect, it } from "vitest";
import { estimateWorkflow, resolveWorkflow, topoLevels } from "./workflow";
import { AD_CREATIVE_V1, defaultWorkflowFor, NEWS_REPORT_V1, PODCAST_CLIPS_V1, PODCAST_EPISODE_V1, STORY_EPISODE_V1 } from "./workflows";
import type { WorkflowDefinition } from "./types";

const ctx = { durationSec: 60, shots: 12, spokenShots: 6, onCameraShots: 6, formats: ["16:9" as const] };

describe("workflow engine", () => {
  it("ships valid workflows", () => {
    expect(() => resolveWorkflow(STORY_EPISODE_V1)).not.toThrow();
    for (const wf of [AD_CREATIVE_V1, PODCAST_EPISODE_V1, PODCAST_CLIPS_V1, NEWS_REPORT_V1]) expect(() => resolveWorkflow(wf)).not.toThrow();
  });

  it("routes each studio and kind to its workflow", () => {
    expect(defaultWorkflowFor("podcast", "clips").id).toBe("podcast-clips");
    expect(defaultWorkflowFor("podcast").id).toBe("podcast-episode");
    expect(defaultWorkflowFor("journalism").id).toBe("news-report");
  });

  it("fact-checks before writing a news script", () => {
    expect(topoLevels(NEWS_REPORT_V1, "storyboard")).toEqual([["factcheck"], ["script"], ["cast"], ["keyframes"]]);
  });

  it("prices Podcast to Clips by recording length and kept clips", () => {
    const est = estimateWorkflow(PODCAST_CLIPS_V1, { ...ctx, sourceSec: 45 * 60, clips: 5 });
    expect(est.credits.storyboard).toBe(5 * 30 + 40); // 45 min → 5 × 10-min transcription blocks + highlight detection
    expect(est.credits.production).toBe(5 * 10); // 5 clips
  });

  it("runs independent blocks in parallel (voice alongside animation)", () => {
    expect(topoLevels(STORY_EPISODE_V1, "production")).toEqual([["animate", "voice"], ["lipsync"], ["render"]]);
    expect(topoLevels(STORY_EPISODE_V1, "storyboard")).toEqual([["script"], ["cast"], ["keyframes"]]);
  });

  it("prices a story episode exactly like the published TaleToken table", () => {
    const est = estimateWorkflow(STORY_EPISODE_V1, ctx);
    expect(est.credits.storyboard).toBe(100 + 12 * 13);
    expect(est.totalCredits).toBe(episodeTokenCost({ ...DEFAULT_EPISODE, mode: "full" }));
    // Same as the episode cost model, plus one identity check per keyframe (TaleStudio Characters).
    const checks = 12 * STEP_COSTS.identityCheck.high;
    expect(est.cogs.high).toBeCloseTo(estimateEpisodeCogs({ ...DEFAULT_EPISODE, characterImages: MAX_NEW_PORTRAITS }).total.high + checks, 6);
  });

  it("charges nothing extra for additional ad formats (FFmpeg re-framing only)", () => {
    const one = estimateWorkflow(AD_CREATIVE_V1, ctx).totalCredits;
    const three = estimateWorkflow(AD_CREATIVE_V1, { ...ctx, formats: ["16:9", "9:16", "1:1"] }).totalCredits;
    expect(three).toBe(one);
  });

  it("rejects broken graphs with every problem listed", () => {
    const broken: WorkflowDefinition = {
      ...STORY_EPISODE_V1,
      nodes: [...STORY_EPISODE_V1.nodes, { id: "x", block: "nope", version: 1 }],
      edges: STORY_EPISODE_V1.edges.filter((e) => !(e.from === "keyframes" && e.to === "animate")).concat({ from: "render", to: "script" }),
    };
    expect(() => resolveWorkflow(broken)).toThrow(/Unknown block nope@1[\s\S]*not connected[\s\S]*earlier stage/);
  });
});
