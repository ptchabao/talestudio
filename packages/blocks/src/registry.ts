import { MAX_NEW_PORTRAITS, TOKEN_COSTS, type CostRange } from "@talestudio/core";
import { z } from "zod";
import type { BlockDefinition } from "./types";

const scale = (r: CostRange, n: number): CostRange => ({ low: r.low * n, expected: r.expected * n, high: r.high * n });
const define = <C extends z.ZodType>(b: BlockDefinition<C>) => b;

/**
 * The block registry. Keyed by `type@version` so a new version can ship next to the old one;
 * existing projects keep the version their workflow pinned.
 */
const BLOCKS = [
  define({
    type: "story.script",
    version: 1,
    category: "story",
    inputs: [
      { name: "brief", type: "brief", optional: true },
      { name: "claims", type: "claims", optional: true },
    ],
    outputs: [{ name: "script", type: "script" }],
    configSchema: z.object({ format: z.enum(["episode", "ad", "podcast", "news"]).default("episode") }),
    providers: [{ id: "anthropic", label: "Claude" }],
    fanOut: "once",
    executor: "writeScript",
    status: "scripting",
    // The storyboard base covers the script, the new cast portraits and the final render; keyframes add per shot.
    credits: () => TOKEN_COSTS.storyboardBase,
    cogs: (_c, _ctx, k) => k.script,
  }),
  define({
    type: "character.cast",
    version: 1,
    category: "character",
    inputs: [{ name: "script", type: "script" }],
    outputs: [{ name: "cast", type: "cast" }],
    configSchema: z.object({}),
    providers: [{ id: "fal:flux", label: "Flux" }],
    fanOut: "once",
    executor: "castCharacters",
    status: "casting",
    credits: () => 0,
    // At most MAX_NEW_PORTRAITS per production (recurring cast makes later episodes cheaper).
    cogs: (_c, _ctx, k) => scale(k.image, MAX_NEW_PORTRAITS),
  }),
  define({
    type: "image.keyframes",
    version: 1,
    category: "image",
    inputs: [
      { name: "script", type: "script" },
      { name: "cast", type: "cast" },
    ],
    outputs: [{ name: "keyframes", type: "keyframes" }],
    configSchema: z.object({}),
    providers: [{ id: "fal:flux-pulid", label: "Flux PuLID" }],
    fanOut: "shots",
    executor: "drawKeyframe",
    status: "storyboarding",
    credits: (_c, ctx) => ctx.shots * TOKEN_COSTS.storyboardPerShot,
    // Every keyframe of a library character is checked against its master portrait.
    cogs: (_c, ctx, k) => scale({ low: k.image.low + k.identityCheck.low, expected: k.image.expected + k.identityCheck.expected, high: k.image.high + k.identityCheck.high }, ctx.shots),
  }),
  define({
    type: "video.animate",
    version: 1,
    category: "video",
    inputs: [{ name: "keyframes", type: "keyframes" }],
    outputs: [{ name: "clips", type: "clips" }],
    configSchema: z.object({}),
    providers: [
      { id: "fal:kling", label: "Kling" },
      { id: "runway", label: "Runway" },
      { id: "luma", label: "Luma" },
    ],
    fanOut: "shots",
    executor: "animateShot",
    status: "animating",
    credits: (_c, ctx) => ctx.shots * TOKEN_COSTS.videoClip,
    cogs: (_c, ctx, k) => scale(k.videoClip, ctx.shots),
  }),
  define({
    type: "audio.voice",
    version: 1,
    category: "audio",
    inputs: [{ name: "script", type: "script" }],
    outputs: [{ name: "voice", type: "voice" }],
    configSchema: z.object({}),
    providers: [{ id: "elevenlabs", label: "ElevenLabs" }],
    fanOut: "spokenShots",
    executor: "voiceShot",
    status: "voicing",
    // Voice + lip-sync are priced together per spoken shot (see CREDIT_COSTS.spokenShot).
    credits: (_c, ctx) => ctx.spokenShots * TOKEN_COSTS.spokenShot,
    cogs: (_c, ctx, k) => scale(k.ttsPerMinute, ctx.durationSec / 60),
  }),
  define({
    type: "audio.lipsync",
    version: 1,
    category: "audio",
    inputs: [
      { name: "clips", type: "clips" },
      { name: "voice", type: "voice" },
    ],
    outputs: [{ name: "synced", type: "synced-clips" }],
    configSchema: z.object({}),
    providers: [{ id: "fal:sync", label: "Sync Labs" }],
    fanOut: "onCameraShots",
    executor: "lipsyncShot",
    status: "lipsyncing",
    credits: () => 0,
    cogs: (_c, ctx, k) => scale(k.lipSyncClip, ctx.onCameraShots),
  }),
  define({
    type: "export.render",
    version: 1,
    category: "export",
    inputs: [
      { name: "clips", type: "clips" },
      { name: "synced", type: "synced-clips", optional: true },
      { name: "voice", type: "voice", optional: true },
    ],
    outputs: [{ name: "video", type: "video" }],
    configSchema: z.object({ subtitles: z.boolean().default(true) }),
    providers: [{ id: "ffmpeg", label: "FFmpeg" }],
    fanOut: "formats",
    executor: "renderFinal",
    status: "rendering",
    credits: () => 0,
    cogs: (_c, ctx, k) => scale(k.render, ctx.formats.length),
  }),
  define({
    type: "news.factcheck",
    version: 1,
    category: "story",
    // Sources come from the production itself (pasted by the newsroom), hence optional here.
    inputs: [{ name: "sources", type: "sources", optional: true }],
    outputs: [{ name: "claims", type: "claims" }],
    configSchema: z.object({}),
    providers: [{ id: "anthropic", label: "Claude" }],
    fanOut: "once",
    executor: "checkFacts",
    status: "scripting",
    credits: () => TOKEN_COSTS.factCheck,
    cogs: (_c, _ctx, k) => k.factCheck,
  }),
  define({
    type: "audio.transcribe",
    version: 1,
    category: "audio",
    inputs: [{ name: "media", type: "media", optional: true }],
    outputs: [{ name: "transcript", type: "transcript" }],
    configSchema: z.object({}),
    providers: [{ id: "fal:whisper", label: "Whisper" }],
    fanOut: "once",
    executor: "transcribe",
    status: "scripting",
    // Per started 10 minutes of recording.
    credits: (_c, ctx) => Math.max(1, Math.ceil((ctx.sourceSec ?? 0) / 600)) * TOKEN_COSTS.transcriptionPer10Min,
    cogs: (_c, ctx, k) => scale(k.transcribePerMinute, (ctx.sourceSec ?? 0) / 60),
  }),
  define({
    type: "story.highlights",
    version: 1,
    category: "editing",
    inputs: [{ name: "transcript", type: "transcript" }],
    outputs: [{ name: "highlights", type: "highlights" }],
    configSchema: z.object({ count: z.number().int().min(3).max(10).default(6) }),
    providers: [{ id: "anthropic", label: "Claude" }],
    fanOut: "once",
    executor: "findHighlights",
    status: "storyboarding",
    credits: () => TOKEN_COSTS.highlights,
    cogs: (_c, ctx, k) => {
      const read = scale(k.highlightsPerMinute, (ctx.sourceSec ?? 0) / 60);
      return { low: k.highlights.low + read.low, expected: k.highlights.expected + read.expected, high: k.highlights.high + read.high };
    },
  }),
  define({
    type: "export.clips",
    version: 1,
    category: "export",
    inputs: [
      { name: "highlights", type: "highlights" },
      { name: "transcript", type: "transcript" },
    ],
    outputs: [{ name: "clips", type: "social-clips" }],
    configSchema: z.object({ format: z.enum(["9:16", "1:1", "16:9"]).default("9:16") }),
    providers: [{ id: "ffmpeg", label: "FFmpeg" }],
    fanOut: "highlights",
    executor: "cutClip",
    status: "rendering",
    credits: (_c, ctx) => (ctx.clips ?? 0) * TOKEN_COSTS.clip,
    cogs: (_c, ctx, k) => scale(k.render, ctx.clips ?? 0),
  }),
] as const;

export type AnyBlock = (typeof BLOCKS)[number];

const byKey = new Map<string, BlockDefinition>(BLOCKS.map((b) => [`${b.type}@${b.version}`, b as unknown as BlockDefinition]));

export function getBlock(type: string, version: number): BlockDefinition {
  const b = byKey.get(`${type}@${version}`);
  if (!b) throw new Error(`Unknown block ${type}@${version}`);
  return b;
}

export const listBlocks = (): BlockDefinition[] => [...byKey.values()];
