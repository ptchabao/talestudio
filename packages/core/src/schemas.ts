import { z } from "zod";
import { adBriefSchema, MAX_SOURCE_SEC, newsBriefSchema, PLATFORM_IDS, podcastBriefSchema, STUDIOS } from "./studios";

export const EPISODE_STATUSES = [
  "queued",
  "scripting",
  "casting",
  "storyboarding",
  "animating",
  "voicing",
  "lipsyncing",
  "rendering",
  "storyboard_ready",
  "completed",
  "failed",
  "canceled",
] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export const TERMINAL_STATUSES: readonly EpisodeStatus[] = ["storyboard_ready", "completed", "failed", "canceled"];

export const STYLES = ["cinematic", "anime", "pixar-3d", "watercolor", "comic", "claymation"] as const;
export type Style = (typeof STYLES)[number];

/**
 * A project belongs to a studio. Story projects are series (bible + recurring cast);
 * advertising projects are campaigns (brand brief). Productions inherit style and language.
 */
export const createProjectInput = z
  .object({
    studio: z.enum(STUDIOS).default("story"),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().min(10).max(4000),
    style: z.enum(STYLES).default("cinematic"),
    language: z.string().min(2).max(10).default("en"),
    brief: z.unknown().optional(),
  })
  .transform((p, ctx) => {
    // Each studio has its own brief shape; story projects have none.
    const schema = { advertising: adBriefSchema, podcast: podcastBriefSchema, journalism: newsBriefSchema, story: null }[p.studio];
    if (!schema) return { ...p, brief: null };
    const parsed = schema.safeParse(p.brief);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: ["brief", ...issue.path.map(String)], message: issue.message });
      return z.NEVER;
    }
    return { ...p, brief: parsed.data };
  });
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const createEpisodeInput = z.object({
  title: z.string().trim().min(2).max(120),
  premise: z.string().trim().min(10).max(2000),
  durationSec: z.number().int().min(15).max(180).default(60),
  mode: z.enum(["storyboard", "full"]).default("full"),
  /** "clips": cut an uploaded recording into vertical clips (Podcast to Clips). */
  kind: z.enum(["generated", "clips"]).default("generated"),
  /** Journalism: sources the report must be checked against (URLs + pasted excerpts). */
  sources: z.string().trim().max(20000).optional(),
  /** Podcast to Clips: uploaded recording (key from POST /api/uploads) and its duration. */
  sourceKey: z.string().max(300).optional(),
  sourceDurationSec: z.number().int().min(30).max(MAX_SOURCE_SEC).optional(),
  /** Where it will be posted; the first platform sets the generation aspect ratio. */
  platforms: z.array(z.enum(PLATFORM_IDS)).min(1).max(PLATFORM_IDS.length).optional(),
  /** Library characters to feature (TaleStudio Characters). */
  characterIds: z.array(z.string().uuid()).max(8).optional(),
});

/** Storyboard edits before approval: everything the user can change on a shot. */
export const shotEditInput = z.object({
  caption: z.string().trim().min(1).max(500).optional(),
  visual: z.string().trim().min(3).max(1000).optional(),
  camera: z.string().trim().min(2).max(200).optional(),
  line: z.string().trim().max(300).nullable().optional(),
});
export type CreateEpisodeInput = z.infer<typeof createEpisodeInput>;

/** Structured output requested from the LLM. Kept flat and bounded so it validates reliably. */
export const characterSchema = z.object({
  id: z.string().describe("short slug, e.g. 'mira'"),
  name: z.string(),
  appearance: z.string().describe("visual description reused verbatim in every image prompt"),
  voice: z.string().describe("voice description: gender, age, tone"),
  bio: z.string().describe("one-sentence presentation of the character shown to the user, in the dialogue language"),
});

export const shotSchema = z.object({
  index: z.number().int(),
  durationSec: z.number().int(),
  camera: z.string().describe("shot type and movement, e.g. 'slow push-in, medium close-up'"),
  visual: z.string().describe("what is on screen, self-contained image prompt"),
  characterIds: z.array(z.string()),
  speakerId: z.string().nullable().describe("character id speaking on camera, or null for narration/silence"),
  line: z.string().nullable().describe("spoken line or narration for this shot, or null"),
  caption: z.string().describe("one-sentence summary of what happens in the shot, shown to the user, in the dialogue language"),
});

export const scriptSchema = z.object({
  logline: z.string(),
  characters: z.array(characterSchema),
  shots: z.array(shotSchema),
});
export type Script = z.infer<typeof scriptSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type Character = z.infer<typeof characterSchema>;
