import { z } from "zod";

/** Studios share one engine (blocks + workflows) and differ by their workflows, prompts and settings. */
export const STUDIOS = ["story", "advertising", "podcast", "journalism"] as const;
export type Studio = (typeof STUDIOS)[number];
export const AVAILABLE_STUDIOS: readonly Studio[] = STUDIOS;

/** Output aspect ratios. Re-framing the same clips is FFmpeg-only work, so extra formats cost no credits. */
export const FORMATS = ["16:9", "9:16", "1:1"] as const;
export type Format = (typeof FORMATS)[number];

/** Where a production will be posted. Drives the output formats and the script's pacing. */
export const PLATFORM_IDS = ["tiktok", "instagram_reels", "youtube_shorts", "facebook_reels", "instagram_feed", "facebook_feed", "linkedin", "youtube", "x"] as const;
export type Platform = (typeof PLATFORM_IDS)[number];

export const PLATFORMS: Record<Platform, { format: Format; /** Recommended maximum length. */ maxSec: number; /** Guidance for the script writer. */ hint: string }> = {
  tiktok: { format: "9:16", maxSec: 60, hint: "TikTok: hook in the first 2 seconds, fast cuts, one clear idea, subject centred in the vertical frame, made for sound on." },
  instagram_reels: { format: "9:16", maxSec: 90, hint: "Instagram Reels: strong visual hook, polished aesthetic, vertical framing, an ending that loops cleanly." },
  youtube_shorts: { format: "9:16", maxSec: 60, hint: "YouTube Shorts: immediate hook, clear payoff, vertical framing, an ending that loops back to the opening." },
  facebook_reels: { format: "9:16", maxSec: 90, hint: "Facebook Reels: warm, accessible tone, vertical framing, understandable without sound." },
  instagram_feed: { format: "1:1", maxSec: 60, hint: "Instagram feed: striking first frame that works as a still, square framing, captions carry the message." },
  facebook_feed: { format: "1:1", maxSec: 60, hint: "Facebook feed: most people watch muted, so the story must read without sound; key message in the first 3 seconds; square framing." },
  linkedin: { format: "1:1", maxSec: 90, hint: "LinkedIn: professional tone, the value stated early, readable muted, square framing." },
  youtube: { format: "16:9", maxSec: 180, hint: "YouTube: cinematic widescreen framing, room to develop the story." },
  x: { format: "16:9", maxSec: 140, hint: "X: get to the point immediately, widescreen framing, works muted with captions." },
};

/**
 * Output formats for the chosen platforms, in order of first appearance. The first one is the aspect ratio
 * frames and clips are generated in; the others are re-framed by FFmpeg at no extra credit.
 */
export function formatsFor(platforms: readonly Platform[]): Format[] {
  return [...new Set(platforms.map((p) => PLATFORMS[p].format))];
}

export const adBriefSchema = z.object({
  brand: z.string().trim().min(1).max(120),
  product: z.string().trim().min(2).max(500),
  audience: z.string().trim().min(2).max(300),
  objective: z.enum(["awareness", "consideration", "conversion"]).default("awareness"),
  tone: z.string().trim().max(200).default(""),
  callToAction: z.string().trim().min(2).max(120),
  formats: z.array(z.enum(FORMATS)).min(1).default(["9:16", "1:1", "16:9"]),
});
export type AdBrief = z.infer<typeof adBriefSchema>;

/** Ad lengths follow platform norms (TikTok/Reels 15s, Instagram 30s, YouTube 45s). */
export const AD_DURATIONS = [15, 30, 45] as const;

export const podcastBriefSchema = z.object({
  format: z.enum(["interview", "debate", "solo", "narrative"]).default("interview"),
  hosts: z.string().trim().min(2).max(500),
  audience: z.string().trim().max(300).default(""),
  tone: z.string().trim().max(200).default(""),
});
export type PodcastBrief = z.infer<typeof podcastBriefSchema>;

export const newsBriefSchema = z.object({
  outlet: z.string().trim().min(1).max(120),
  format: z.enum(["newscast", "report", "explainer"]).default("report"),
  editorialLine: z.string().trim().max(500).default(""),
});
export type NewsBrief = z.infer<typeof newsBriefSchema>;

export type ProjectBrief = AdBrief | PodcastBrief | NewsBrief;

/** Podcast to Clips: source recordings up to 2 hours. */
export const MAX_SOURCE_SEC = 2 * 3600;
export const CLIP_COUNT = { min: 3, max: 10 } as const;

/** A moment worth clipping, found in a transcript. Times in seconds from the start of the source. */
export const highlightSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  title: z.string(),
  hook: z.string().describe("one-line caption to post with the clip, in the transcript language"),
  reason: z.string().describe("why this moment works as a standalone clip"),
});
export type Highlight = z.infer<typeof highlightSchema> & { selected?: boolean };

export const transcriptSegmentSchema = z.object({ start: z.number(), end: z.number(), text: z.string() });
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

/**
 * Fact-check result. "verified" requires a verbatim quote from a provided source; the checker
 * never confirms anything on its own knowledge.
 */
export const claimSchema = z.object({
  claim: z.string(),
  status: z.enum(["verified", "unverified", "opinion", "contradicted"]),
  sourceIndex: z.number().int().nullable().describe("1-based index of the supporting source, or null"),
  quote: z.string().nullable().describe("verbatim excerpt from that source supporting or contradicting the claim, or null"),
  note: z.string().describe("short explanation for the editor, in the report language"),
});
export type Claim = z.infer<typeof claimSchema>;
