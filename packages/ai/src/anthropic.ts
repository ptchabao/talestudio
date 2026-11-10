import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { scriptSchema, shotCount, STEP_COSTS } from "@talestudio/core";
import { z } from "zod";
import { claimSchema, highlightSchema } from "@talestudio/core";
import { AD_SYSTEM_PROMPT, FACTCHECK_SYSTEM_PROMPT, HIGHLIGHTS_SYSTEM_PROMPT, NEWS_SYSTEM_PROMPT, PODCAST_SYSTEM_PROMPT, SCRIPT_SYSTEM_PROMPT, scriptUserPrompt } from "./prompts";
import type { FactChecker, HighlightFinder, IdentityChecker } from "./types";
import type { ScriptWriter } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/** USD per million tokens. */
export interface TokenPrices {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Where Claude calls go: the Anthropic API directly, or any Messages-compatible gateway (Rodium). */
export interface ClaudeRoute {
  client: Anthropic;
  model: string;
  provider: string;
  /** Anthropic-only beta: on a safety refusal the API re-runs the call on a fallback model. */
  serverFallback: boolean;
  prices: TokenPrices;
}

const CHECK_MODEL = process.env.ANTHROPIC_CHECK_MODEL ?? "claude-sonnet-5-5";

/** $4 / $20 per MTok for claude-opus-5-5 (cache writes ×1.25, reads $0.20); identity checks budget $3 / $15 for Sonnet. */
export function anthropicDirect(model: "script" | "check" = "script"): ClaudeRoute {
  if (model === "check") return { client: new Anthropic(), model: CHECK_MODEL, provider: `anthropic:${CHECK_MODEL}`, serverFallback: true, prices: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } };
  return { client: new Anthropic(), model: MODEL, provider: `anthropic:${MODEL}`, serverFallback: true, prices: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } };
}

export class ClaudeScriptWriter implements ScriptWriter {
  constructor(private route: ClaudeRoute = anthropicDirect()) {}

  async write(req: Parameters<ScriptWriter["write"]>[0]) {
    const clipSec = 5;
    const shots = shotCount(req.durationSec, clipSec);
    const system = { ad: AD_SYSTEM_PROMPT, news: NEWS_SYSTEM_PROMPT, podcast: PODCAST_SYSTEM_PROMPT, episode: SCRIPT_SYSTEM_PROMPT }[req.format];
    const { data: script, costUsd } = await structured(this.route, system, scriptUserPrompt(req, shots, clipSec), scriptSchema, "medium");

    // Normalise: the model is asked for exact counts, but never trust it with indices or durations.
    script.shots = script.shots.slice(0, shots).map((s, index) => ({ ...s, index, durationSec: clipSec }));
    const castIds = new Set(script.characters.map((c) => c.id));
    for (const s of script.shots) {
      s.characterIds = s.characterIds.filter((id) => castIds.has(id));
      if (s.speakerId && !castIds.has(s.speakerId)) s.speakerId = null;
    }

    return { script, costUsd: costUsd || STEP_COSTS.script.expected, provider: this.route.provider };
  }
}

function usageCost(u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }, p: TokenPrices) {
  return (u.input_tokens * p.input + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead + u.output_tokens * p.output) / 1_000_000;
}

/** Shared structured call. On the direct route, refusals are retried server-side on a fallback model. */
async function structured<T extends z.ZodType>(route: ClaudeRoute, system: string, user: string | Anthropic.Beta.BetaContentBlockParam[], schema: T, effort: "low" | "medium" | "high") {
  const response = await route.client.beta.messages.parse({
    model: route.model,
    ...(route.serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") {
    // Without server-side fallback, the direct route (which has it) may still get an answer.
    throw new ScriptRefusedError(response.stop_details?.explanation ?? "The premise was declined by the model.", !route.serverFallback);
  }
  if (!response.parsed_output) throw new Error(`No structured output (stop_reason=${response.stop_reason})`);
  return { data: response.parsed_output as z.infer<T>, costUsd: usageCost(response.usage, route.prices) };
}

const IDENTITY_SYSTEM_PROMPT = `You check visual identity for an animation studio. You compare a reference image of a fictional character with a newly generated image and decide whether they show the same character.
Judge only identity: face shape, eyes, nose, mouth, skin tone, hair, apparent age and distinctive marks. Ignore clothing, pose, expression, lighting, framing and background — those are allowed to change.
score: 0 = clearly a different person, 1 = unmistakably the same. sameIdentity is true only if a viewer would recognise the same character at a glance (score ≥ 0.7).
issues: one short sentence naming what differs, or an empty string.`;

const identitySchema = z.object({ sameIdentity: z.boolean(), score: z.number().min(0).max(1), issues: z.string() });

/** Claude only reads raster images it can decode; anything else (e.g. mock SVGs) cannot be checked. */
const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

async function imageBlock(url: string): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!VISION_TYPES.has(type)) return null;
  const data = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { type: "image", source: { type: "base64", media_type: type as "image/jpeg", data } };
}

/** Compares a generated image to a character's master portrait (images inline: gateways do not fetch URLs). */
export class ClaudeIdentityChecker implements IdentityChecker {
  constructor(private route: ClaudeRoute = anthropicDirect("check")) {}
  async check(input: { referenceUrl: string; candidateUrl: string; name: string }) {
    const [reference, candidate] = await Promise.all([imageBlock(input.referenceUrl), imageBlock(input.candidateUrl)]);
    if (!reference || !candidate) return { same: true, score: 1, issues: "", costUsd: 0, provider: "skipped:unsupported-image" };
    const { data, costUsd } = await structured(
      this.route,
      IDENTITY_SYSTEM_PROMPT,
      [
        { type: "text", text: `Reference image of ${input.name}:` },
        reference,
        { type: "text", text: "Newly generated image:" },
        candidate,
        { type: "text", text: `Is this the same character as ${input.name}?` },
      ],
      identitySchema,
      "low",
    );
    return { same: data.sameIdentity && data.score >= 0.7, score: data.score, issues: data.issues, costUsd, provider: this.route.provider };
  }
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export class ClaudeHighlightFinder implements HighlightFinder {
  constructor(private route: ClaudeRoute = anthropicDirect()) {}
  async find(input: Parameters<HighlightFinder["find"]>[0]) {
    const transcript = input.segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)} | ${fmtTime(s.start)}] ${s.text}`).join("\n");
    const { data, costUsd } = await structured(
      this.route,
      HIGHLIGHTS_SYSTEM_PROMPT,
      `<context>${input.context}</context>\n<transcript language="${input.language}">\n${transcript}\n</transcript>\n\nPick ${input.count} clips.`,
      z.object({ highlights: z.array(highlightSchema) }),
      "medium",
    );
    // Never trust timings blindly: clamp to the transcript, enforce 20–60s and drop overlaps.
    const last = input.segments.at(-1)?.end ?? 0;
    const clean = data.highlights
      .map((h) => ({ ...h, start: Math.max(0, Math.min(h.start, last)), end: Math.min(last, Math.max(h.end, h.start + 20, Math.min(h.end, h.start + 60))) }))
      .filter((h) => h.end - h.start >= 10)
      .sort((a, b) => a.start - b.start)
      .filter((h, i, arr) => i === 0 || h.start >= arr[i - 1]!.end)
      .slice(0, input.count)
      .map((h) => ({ ...h, end: Math.min(h.end, h.start + 60), selected: true }));
    return { highlights: clean, costUsd, provider: this.route.provider };
  }
}

export class ClaudeFactChecker implements FactChecker {
  constructor(private route: ClaudeRoute = anthropicDirect()) {}
  async check(input: Parameters<FactChecker["check"]>[0]) {
    const sources = splitSources(input.sources);
    const { data, costUsd } = await structured(
      this.route,
      FACTCHECK_SYSTEM_PROMPT,
      `<report_idea>${input.premise}</report_idea>\n<sources>\n${sources.map((s, i) => `<source index="${i + 1}">\n${s}\n</source>`).join("\n")}\n</sources>\nWrite notes in: ${input.language}`,
      z.object({ claims: z.array(claimSchema) }),
      "high",
    );
    return { claims: enforceQuotes(data.claims, sources), costUsd, provider: this.route.provider };
  }
}

/** Sources are separated by blank lines or "---". */
export function splitSources(raw: string): string[] {
  return raw.split(/\n\s*(?:-{3,}\s*)?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Safety net on top of the prompt: a claim can only stay "verified"/"contradicted" if its quote really
 * appears in the cited source (whitespace/case-insensitive). Otherwise it is downgraded to "unverified".
 */
export function enforceQuotes<T extends { status: string; sourceIndex: number | null; quote: string | null }>(claims: T[], sources: string[]): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/[«»“”"']/g, "").trim();
  return claims.map((c) => {
    if (c.status !== "verified" && c.status !== "contradicted") return c;
    const src = c.sourceIndex ? sources[c.sourceIndex - 1] : undefined;
    const ok = Boolean(src && c.quote && c.quote.trim().length >= 8 && norm(src).includes(norm(c.quote)));
    return ok ? c : { ...c, status: "unverified", sourceIndex: null, quote: null };
  });
}

/** Non-retryable: the user must change the premise. */
export class ScriptRefusedError extends Error {
  readonly nonRetryable = true;
  /** True when another route (direct Anthropic with server-side fallback) is worth trying. */
  constructor(message: string, readonly fallbackable = false) {
    super(message);
  }
}
