export interface CostRange {
  low: number;
  expected: number;
  high: number;
}

/**
 * Unit costs per pipeline step, in USD. `low` / `high` bound the realistic range; `expected` is what we plan with.
 * Keep these in one place: pricing, margin guards and the admin dashboard all read them.
 *
 * STEP_COSTS is the primary route: RodiumAI with the default models (packages/ai/src/rodium.ts), converted
 * at ~565 RODI per USD. The range absorbs EUR/USD moves (RODI = XOF, pegged to the euro) and longer prompts.
 */
export const STEP_COSTS = {
  /** Script + storyboard via Claude Opus 5.5 (~5k tokens in, ~8k out with thinking), per episode. */
  script: { low: 0.12, expected: 0.24, high: 0.4 },
  /** Character / keyframe image, per image (Seedream 5.0 Lite, 26.5 RODI). */
  image: { low: 0.04, expected: 0.047, high: 0.055 },
  /** Image-to-video, per 5s clip (Seedance 1.0 Pro, 14.6 RODI/s). */
  videoClip: { low: 0.1, expected: 0.13, high: 0.15 },
  /** Text-to-speech, per 60s of narration (~150 words, gpt-4o-mini-tts). */
  ttsPerMinute: { low: 0.01, expected: 0.02, high: 0.03 },
  /** Lip-sync, per spoken 5s clip. No Rodium model: always fal (Sync Labs). */
  lipSyncClip: { low: 0.05, expected: 0.075, high: 0.1 },
  /** FFmpeg render + subtitles, per episode. */
  render: { low: 0.02, expected: 0.03, high: 0.05 },
  /** Speech-to-text per minute of recording (gpt-4o-transcribe-diarize, 4.6 RODI/min). */
  transcribePerMinute: { low: 0.006, expected: 0.0081, high: 0.01 },
  /** Highlight detection: one Claude call — fixed part (thinking + answer, 3–8k output tokens)… */
  highlights: { low: 0.06, expected: 0.12, high: 0.22 },
  /** …plus the transcript it reads (~250 input tokens per minute of recording). */
  highlightsPerMinute: { low: 0.001, expected: 0.0013, high: 0.002 },
  /** Fact-check: one Claude call at high effort over up to 20k characters of sources. */
  factCheck: { low: 0.1, expected: 0.25, high: 0.5 },
  /** Identity check: Claude Sonnet compares two images (~3.5k input tokens, short answer). */
  identityCheck: { low: 0.008, expected: 0.011, high: 0.02 },
} as const satisfies Record<string, CostRange>;

/**
 * Degraded mode: the direct providers the pipeline falls back to when Rodium fails or runs out of balance
 * (Anthropic, fal Flux / Kling / Whisper, ElevenLabs). Rare, but plans must not lose money on it.
 */
export const DIRECT_STEP_COSTS = {
  script: { low: 0.1, expected: 0.18, high: 0.3 },
  image: { low: 0.01, expected: 0.0125, high: 0.0167 },
  /** Kling v2.1 standard on fal: $0.25–0.28 per 5s clip (fal model page, Nov 2026). */
  videoClip: { low: 0.25, expected: 0.28, high: 0.3 },
  ttsPerMinute: { low: 0.1, expected: 0.17, high: 0.25 },
  lipSyncClip: STEP_COSTS.lipSyncClip,
  render: STEP_COSTS.render,
  /** Whisper on fal, $0.006/min. */
  transcribePerMinute: { low: 0.006, expected: 0.006, high: 0.009 },
  highlights: { low: 0.05, expected: 0.09, high: 0.17 },
  highlightsPerMinute: { low: 0.0008, expected: 0.001, high: 0.0015 },
  factCheck: { low: 0.08, expected: 0.19, high: 0.4 },
  identityCheck: { low: 0.008, expected: 0.012, high: 0.02 },
} as const satisfies Record<keyof typeof STEP_COSTS, CostRange>;

export type StepCosts = Record<keyof typeof STEP_COSTS, CostRange>;

export interface EpisodeShape {
  durationSec: number;
  /** Seconds per generated clip. Providers bill per 5s clip. */
  clipSec?: number;
  /** Character reference images + one keyframe per shot. */
  characterImages: number;
  /** Fraction of shots where a character speaks on camera (needs lip-sync). */
  spokenShotRatio: number;
}

type EpisodeStep = "script" | "image" | "videoClip" | "ttsPerMinute" | "lipSyncClip" | "render";

export interface CostBreakdown {
  shots: number;
  lines: Record<EpisodeStep, CostRange>;
  total: CostRange;
}

const scale = (r: CostRange, n: number): CostRange => ({
  low: r.low * n,
  expected: r.expected * n,
  high: r.high * n,
});

export function shotCount(durationSec: number, clipSec = 5): number {
  return Math.max(1, Math.ceil(durationSec / clipSec));
}

/** Cost of goods sold for one episode, on the primary route unless another cost table is given. */
export function estimateEpisodeCogs(shape: EpisodeShape, costs: StepCosts = STEP_COSTS): CostBreakdown {
  const shots = shotCount(shape.durationSec, shape.clipSec);
  const spokenShots = Math.ceil(shots * shape.spokenShotRatio);
  const lines = {
    script: costs.script,
    image: scale(costs.image, shape.characterImages + shots),
    videoClip: scale(costs.videoClip, shots),
    ttsPerMinute: scale(costs.ttsPerMinute, shape.durationSec / 60),
    lipSyncClip: scale(costs.lipSyncClip, spokenShots),
    render: costs.render,
  };
  const total = Object.values(lines).reduce<CostRange>(
    (acc, r) => ({ low: acc.low + r.low, expected: acc.expected + r.expected, high: acc.high + r.high }),
    { low: 0, expected: 0, high: 0 },
  );
  return { shots, lines, total };
}

export const DEFAULT_EPISODE: EpisodeShape = {
  durationSec: 60,
  characterImages: 4,
  spokenShotRatio: 0.5,
};
