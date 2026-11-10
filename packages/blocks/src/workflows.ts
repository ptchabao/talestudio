import type { Studio } from "@talestudio/core";
import type { WorkflowDefinition } from "./types";

/** Story episode: storyboard first (cheap), production after the user approves it. */
export const STORY_EPISODE_V1: WorkflowDefinition = {
  id: "story-episode",
  version: 1,
  studio: "story",
  nodes: [
    { id: "script", block: "story.script", version: 1, config: { format: "episode" } },
    { id: "cast", block: "character.cast", version: 1 },
    { id: "keyframes", block: "image.keyframes", version: 1 },
    { id: "animate", block: "video.animate", version: 1 },
    { id: "voice", block: "audio.voice", version: 1 },
    { id: "lipsync", block: "audio.lipsync", version: 1 },
    { id: "render", block: "export.render", version: 1 },
  ],
  edges: [
    { from: "script", to: "cast" },
    { from: "script", to: "keyframes" },
    { from: "cast", to: "keyframes" },
    { from: "keyframes", to: "animate" },
    { from: "script", to: "voice" },
    { from: "animate", to: "lipsync" },
    { from: "voice", to: "lipsync" },
    { from: "animate", to: "render" },
    { from: "lipsync", to: "render" },
    { from: "voice", to: "render" },
  ],
  stages: [
    { id: "storyboard", nodes: ["script", "cast", "keyframes"] },
    { id: "production", nodes: ["animate", "voice", "lipsync", "render"] },
  ],
};

/** Ad: same engine, ad-specific script (hook → product → CTA), one render per platform format. */
export const AD_CREATIVE_V1: WorkflowDefinition = {
  ...STORY_EPISODE_V1,
  id: "ad-creative",
  studio: "advertising",
  nodes: STORY_EPISODE_V1.nodes.map((n) => (n.id === "script" ? { ...n, config: { format: "ad" } } : n)),
};

/** Video podcast episode: hosts on set, conversational script. */
export const PODCAST_EPISODE_V1: WorkflowDefinition = {
  ...STORY_EPISODE_V1,
  id: "podcast-episode",
  studio: "podcast",
  nodes: STORY_EPISODE_V1.nodes.map((n) => (n.id === "script" ? { ...n, config: { format: "podcast" } } : n)),
};

/** Podcast to Clips: transcribe a recording, propose highlights (the user picks), cut vertical clips. */
export const PODCAST_CLIPS_V1: WorkflowDefinition = {
  id: "podcast-clips",
  version: 1,
  studio: "podcast",
  nodes: [
    { id: "transcribe", block: "audio.transcribe", version: 1 },
    { id: "highlights", block: "story.highlights", version: 1, config: { count: 6 } },
    { id: "clips", block: "export.clips", version: 1, config: { format: "9:16" } },
  ],
  edges: [
    { from: "transcribe", to: "highlights" },
    { from: "highlights", to: "clips" },
    { from: "transcribe", to: "clips" },
  ],
  stages: [
    { id: "storyboard", nodes: ["transcribe", "highlights"] },
    { id: "production", nodes: ["clips"] },
  ],
};

/** News report: fact-check the sources first; the script may only state verified claims. */
export const NEWS_REPORT_V1: WorkflowDefinition = {
  id: "news-report",
  version: 1,
  studio: "journalism",
  nodes: [{ id: "factcheck", block: "news.factcheck", version: 1 }, ...STORY_EPISODE_V1.nodes.map((n) => (n.id === "script" ? { ...n, config: { format: "news" } } : n))],
  edges: [{ from: "factcheck", to: "script" }, ...STORY_EPISODE_V1.edges],
  stages: [
    { id: "storyboard", nodes: ["factcheck", "script", "cast", "keyframes"] },
    { id: "production", nodes: ["animate", "voice", "lipsync", "render"] },
  ],
};

const WORKFLOWS = [STORY_EPISODE_V1, AD_CREATIVE_V1, PODCAST_EPISODE_V1, PODCAST_CLIPS_V1, NEWS_REPORT_V1];

export const workflowKey = (wf: Pick<WorkflowDefinition, "id" | "version">) => `${wf.id}@${wf.version}`;

export function getWorkflow(key: string): WorkflowDefinition {
  const wf = WORKFLOWS.find((w) => workflowKey(w) === key);
  if (!wf) throw new Error(`Unknown workflow ${key}`);
  return wf;
}

/** Latest workflow for a studio (and production kind) — what new productions are pinned to. */
export function defaultWorkflowFor(studio: Studio, kind: "generated" | "clips" = "generated"): WorkflowDefinition {
  const family = studio === "podcast" ? (kind === "clips" ? "podcast-clips" : "podcast-episode") : null;
  const wf = WORKFLOWS.filter((w) => w.studio === studio && (!family || w.id === family)).sort((a, b) => b.version - a.version)[0];
  if (!wf) throw new Error(`No workflow for studio ${studio}`);
  return wf;
}
