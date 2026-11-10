import { shotCount } from "./costs";
import { PAYMENT_FEE } from "./plans";

/**
 * TaleToken (TT) price of every operation. 1 TT ≈ $0.01.
 * Prices are fixed and shown before anything runs; a stage reserves its tokens up front and refunds them if it
 * fails (minus the provider cost of what was already generated, see the pipeline's refundReservation).
 * economics.test.ts checks every line against provider costs on both routes, fees included.
 */
export const TOKEN_COSTS = {
  /** Storyboard = script + cast portraits + one keyframe per shot. Base covers the script and up to 6 new portraits. */
  storyboardBase: 100,
  storyboardPerShot: 13,
  /** One generated 5-second clip. */
  videoClip: 40,
  /** Voice for one shot with a line, lip-sync included when the speaker is on camera. */
  spokenShot: 25,
  /** Redrawing one storyboard frame after editing it. */
  keyframeRedraw: 15,
  /** Podcast to Clips: transcription per started 10 minutes of source. */
  transcriptionPer10Min: 30,
  /** Podcast to Clips: highlight detection over the whole transcript (one Claude call). */
  highlights: 40,
  /** Exported vertical clip (FFmpeg cut + subtitles). */
  clip: 10,
  /** Journalism fact-check of the provided sources. */
  factCheck: 100,
  /** Characters: 4 face proposals to choose the master portrait from. */
  characterCandidates: 60,
  /** Characters: identity pack (6 angles + 4 expressions), each checked against the master. */
  identityPack: 150,
  /** Characters: one extra outfit or expression, checked against the master. */
  characterExtra: 15,
} as const;
// Creating, editing, locking, duplicating and reusing a character is free: only generations are charged.
// Render, subtitles and extra formats (~$0.03, FFmpeg only) are included.

/** New portraits generated per production; more characters reuse no reference image (keeps the base price safe). */
export const MAX_NEW_PORTRAITS = 6;

/**
 * Tokens that cover a provider cost at cost price (no margin, payment fee included). Used to keep, on a failed
 * or canceled stage, what was really spent on the parts already generated.
 */
export function tokensForCost(usd: number): number {
  return usd > 0 ? Math.ceil((usd * 100) / (1 - PAYMENT_FEE)) : 0;
}

export interface EpisodeTokenInput {
  durationSec: number;
  spokenShotRatio: number;
  mode: "storyboard" | "full";
}

export function storyboardTokens(shots: number): number {
  return TOKEN_COSTS.storyboardBase + shots * TOKEN_COSTS.storyboardPerShot;
}

export function episodeTokenCost(input: EpisodeTokenInput): number {
  const shots = shotCount(input.durationSec);
  const storyboard = storyboardTokens(shots);
  if (input.mode === "storyboard") return storyboard;
  const spoken = Math.ceil(shots * input.spokenShotRatio);
  return storyboard + shots * TOKEN_COSTS.videoClip + spoken * TOKEN_COSTS.spokenShot;
}
