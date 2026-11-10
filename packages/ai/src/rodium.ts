import Anthropic from "@anthropic-ai/sdk";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Character, Format, Shot, Style } from "@talestudio/core";
import type { ClaudeRoute } from "./anthropic";
import { voiceKind, type VoiceKind } from "./elevenlabs";
import { characterPrompt, keyframePrompt } from "./prompts";
import { compressSpeech } from "./render";
import type { GeneratedAsset, ImageGenerator, SpeechSynthesizer, Transcriber, VideoGenerator } from "./types";

/**
 * RodiumAI: one key and one RODI wallet for every model (https://www.rodiumai.io/docs/api/overview).
 * It is the primary route; `withFallback` switches to the direct providers when it fails.
 * Lip-sync has no Rodium model and stays on fal.
 */
const BASE_URL = (process.env.RODIUM_BASE_URL ?? "https://api.rodiumai.io").replace(/\/$/, "");

const MODELS = {
  script: process.env.RODIUM_SCRIPT_MODEL ?? "anthropic/claude-opus-5-5",
  /** Identity checks compare two images: a smaller model is plenty. */
  check: process.env.RODIUM_CHECK_MODEL ?? "anthropic/claude-sonnet-5-5",
  image: process.env.RODIUM_IMAGE_MODEL ?? "bytedance/seedream-5-0-lite",
  video: process.env.RODIUM_VIDEO_MODEL ?? "bytedance/seedance-1-0-pro",
  speech: process.env.RODIUM_SPEECH_MODEL ?? "openai/gpt-4o-mini-tts",
  transcribe: process.env.RODIUM_TRANSCRIBE_MODEL ?? "openai/gpt-4o-transcribe-diarize",
};

/** 1 RODI = 1 XOF. XOF is pegged to the euro, so this only moves with EUR/USD. */
const RODI_PER_USD = Number(process.env.RODI_PER_USD ?? 565);
const usd = (rodi: number) => rodi / RODI_PER_USD;

/** Catalogue tariffs in RODI (GET /v1/models, Nov 2026). Keep in sync with STEP_COSTS in @talestudio/core. */
const RODI = {
  /** claude-opus-5-5, per MTok. */
  claude: { input: 3025.8, output: 15129, cacheRead: 151.3, cacheWrite: 3782.3 },
  /** claude-sonnet-5-5, per MTok. */
  claudeCheck: { input: 1512.9, output: 7564.5, cacheRead: 75.7, cacheWrite: 1891.2 },
  speechPerMinute: 10,
  transcribePerMinute: 4.6,
};

/** Per image. Gemini 3.1 Flash Image is token-billed: ~1290 output tokens at 45 386.8 / MTok. */
const IMAGE_RODI: Record<string, number> = {
  "bytedance/seedream-5-0-lite": 26.5,
  "bytedance/seedream-5-0-pro": 72.9,
  "google/nano-banana-2": 52.2,
  "google/gemini-3.1-flash-image": 58.5,
};

/** Per second at the default resolution, and the clip lengths each family renders (rounded up to). */
const VIDEO: Record<string, { rodiPerSecond: number; durations: number[] }> = {
  "bytedance/seedance-1-0-pro": { rodiPerSecond: 14.6, durations: [5, 10] },
  "bytedance/seedance-1-0-pro-fast": { rodiPerSecond: 11.1, durations: [5, 10] },
  "minimax/hailuo-02": { rodiPerSecond: 42.4, durations: [6, 10] },
  "google/veo-3.1-lite": { rodiPerSecond: 37.9, durations: [4, 6, 8] },
  "google/veo-3.1-fast": { rodiPerSecond: 75.7, durations: [4, 6, 8] },
  "openai/sora-2": { rodiPerSecond: 75.4, durations: [4, 8, 12] },
};
const imageRodi = () => IMAGE_RODI[MODELS.image] ?? 50;
const videoSpec = () => VIDEO[MODELS.video] ?? { rodiPerSecond: 75, durations: [5, 10] };

/** Every request body (base64 images included) must stay under 10 MiB, or the gateway returns 413. */
const MAX_BODY = 10 * 1024 * 1024;

export class RodiumError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "RodiumError";
  }
}

function apiKey(): string {
  const key = process.env.RODIUM_API_KEY;
  if (!key) throw new Error("RODIUM_API_KEY is not set");
  return key;
}

/**
 * POST with node:http(s) rather than fetch: video and long transcriptions answer after several minutes,
 * past undici's 5-minute headers timeout.
 */
function post(path: string, body: Buffer, contentType: string, timeoutMs: number): Promise<{ status: number; body: Buffer }> {
  if (body.byteLength > MAX_BODY) return Promise.reject(new RodiumError(413, "payload_too_large", `Rodium request for ${path} is ${body.byteLength} bytes (limit 10 MiB)`));
  const url = new URL(`${BASE_URL}/v1${path}`);
  const send = url.protocol === "http:" ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const req = send(url, { method: "POST", timeout: timeoutMs, headers: { authorization: `Bearer ${apiKey()}`, "content-type": contentType, "content-length": body.byteLength } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new RodiumError(504, "timeout", `Rodium ${path} did not answer within ${timeoutMs / 1000}s`)));
    req.on("error", reject);
    req.end(body);
  });
}

async function postJson<T>(path: string, json: unknown, timeoutMs: number): Promise<T> {
  const res = await post(path, Buffer.from(JSON.stringify(json)), "application/json", timeoutMs);
  if (res.status >= 400) throw toError(res.status, res.body);
  return JSON.parse(res.body.toString("utf8")) as T;
}

/** Gateway errors use `{ error: { code } }`; maintenance uses a top-level `code`. 402 = insufficient_balance. */
function toError(status: number, body: Buffer): RodiumError {
  const text = body.toString("utf8");
  let code: string | undefined;
  try {
    const j = JSON.parse(text) as { code?: string; error?: { code?: string; type?: string } };
    code = j.error?.code ?? j.error?.type ?? j.code;
  } catch {}
  return new RodiumError(status, code, `Rodium ${status}${code ? ` ${code}` : ""}: ${text.slice(0, 500)}`);
}

/** The gateway never fetches remote media: images and audio go inline as base64. */
async function download(url: string): Promise<{ bytes: Buffer; type: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "image/png" };
}

const dataUrl = ({ bytes, type }: { bytes: Buffer; type: string }) => `data:${type};base64,${bytes.toString("base64")}`;

interface MediaOut {
  data?: { b64_json?: string; url?: string; mime_type?: string }[];
}

function media(out: MediaOut, fallbackType: string, costUsd: number, provider: string): GeneratedAsset {
  const first = out.data?.[0];
  if (first?.b64_json) return { bytes: new Uint8Array(Buffer.from(first.b64_json, "base64")), contentType: first.mime_type ?? fallbackType, costUsd, provider };
  if (first?.url) return { url: first.url, contentType: first.mime_type ?? fallbackType, costUsd, provider };
  throw new Error(`${provider} returned no media`);
}

/** Claude through Rodium's Anthropic Messages drop-in: same SDK, different base URL and key. */
export function rodiumClaude(model: "script" | "check" = "script"): ClaudeRoute {
  const p = model === "check" ? RODI.claudeCheck : RODI.claude;
  const id = model === "check" ? MODELS.check : MODELS.script;
  return {
    // One SDK retry, then let withFallback move to the direct API instead of retrying here.
    client: new Anthropic({ apiKey: apiKey(), baseURL: BASE_URL, maxRetries: 1 }),
    model: id,
    provider: `rodium:${id}`,
    serverFallback: false,
    prices: { input: usd(p.input), output: usd(p.output), cacheRead: usd(p.cacheRead), cacheWrite: usd(p.cacheWrite) },
  };
}

export class RodiumImageGenerator implements ImageGenerator {
  async character(c: Character, style: Style): Promise<GeneratedAsset> {
    return generate(characterPrompt(c, style), "1024x1536", []);
  }

  async keyframe(shot: Shot, style: Style, refs: { character: Character; imageUrl: string; extraUrls?: string[] }[], aspect: Format): Promise<GeneratedAsset> {
    const prompt = keyframePrompt(
      shot,
      style,
      refs.map((r) => r.character),
    );
    // Unlike PuLID (one face), the model takes every cast portrait as a reference.
    const images = await references(refs.flatMap((r) => [r.imageUrl, ...(r.extraUrls ?? [])]));
    return generate(images.length ? `${prompt}\nThe reference images are the cast references, grouped per character in the order listed: keep each face, hairstyle and outfit identical.` : prompt, SIZES[aspect], images);
  }

  async variant(input: { prompt: string; refs: string[]; aspect: "portrait" | Format }): Promise<GeneratedAsset> {
    return generate(input.prompt, input.aspect === "portrait" ? "1024x1536" : SIZES[input.aspect], await references(input.refs));
  }
}

const SIZES: Record<Format, string> = { "16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" };

/** Up to 14 references, dropping the last ones if they would push the body past the size limit. */
async function references(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  let size = 0;
  for (const url of urls.slice(0, 14)) {
    const encoded = dataUrl(await download(url));
    if (size + encoded.length > MAX_BODY - 512 * 1024) break;
    size += encoded.length;
    out.push(encoded);
  }
  return out;
}

async function generate(prompt: string, size: string, images: string[]): Promise<GeneratedAsset> {
  const out = await postJson<MediaOut>("/images/generations", { model: MODELS.image, prompt, size, n: 1, ...(images.length ? { images } : {}) }, 3 * 60_000);
  return media(out, "image/png", usd(imageRodi()), `rodium:${MODELS.image}`);
}

export class RodiumVideoGenerator implements VideoGenerator {
  async animate(input: { imageUrl: string; prompt: string; durationSec: number; aspect: Format }): Promise<GeneratedAsset> {
    // Round up to a length the model renders: the renderer trims every clip to the shot length and keeps only the voice track.
    const { rodiPerSecond, durations } = videoSpec();
    const seconds = durations.find((s) => s >= input.durationSec) ?? durations.at(-1)!;
    const veo = MODELS.video.startsWith("google/veo");
    const out = await postJson<MediaOut>(
      "/videos/generations",
      { model: MODELS.video, prompt: input.prompt, image: dataUrl(await download(input.imageUrl)), duration_seconds: seconds, aspect_ratio: input.aspect, ...(veo ? { resize_mode: "crop" } : {}) },
      // The call is synchronous: Rodium documents up to ~10 minutes.
      12 * 60_000,
    );
    return media(out, "video/mp4", usd(seconds * rodiPerSecond), `rodium:${MODELS.video}`);
  }
}

/** OpenAI TTS voices per archetype; the free-text description also goes in as speaking instructions. */
const VOICES: Record<VoiceKind, string> = {
  narrator: "onyx",
  womanAdult: "coral",
  womanYoung: "nova",
  manAdult: "ash",
  manOld: "echo",
  child: "shimmer",
};

export class RodiumSpeechSynthesizer implements SpeechSynthesizer {
  async speak(input: { text: string; voice: string; language: string; preset?: VoiceKind }): Promise<GeneratedAsset> {
    const res = await post(
      "/audio/speech",
      Buffer.from(JSON.stringify({ model: MODELS.speech, input: input.text, voice: VOICES[input.preset ?? voiceKind(input.voice)], response_format: "mp3", instructions: `Speak in language "${input.language}". Voice: ${input.voice}.` })),
      "application/json",
      2 * 60_000,
    );
    if (res.status >= 400) throw toError(res.status, res.body);
    if (!res.body.byteLength) throw new Error(`rodium:${MODELS.speech} returned no audio`);
    const words = input.text.split(/\s+/).length;
    // ~150 words per minute of speech.
    return { bytes: new Uint8Array(res.body), contentType: "audio/mpeg", costUsd: usd((words / 150) * RODI.speechPerMinute), provider: `rodium:${MODELS.speech}` };
  }
}

export class RodiumTranscriber implements Transcriber {
  async transcribe(input: { audioUrl: string; language: string; durationSec: number }) {
    // Compressed to speech-grade Opus so recordings up to ~1h20 fit the 10 MiB limit.
    const audio = await compressSpeech(input.audioUrl);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/ogg" }), "audio.ogg");
    form.append("model", MODELS.transcribe);
    form.append("language", input.language);
    // Only the diarize model returns timestamped segments; the plain gpt-4o models return text only.
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    const encoded = new Request("http://localhost", { method: "POST", body: form });
    const res = await post("/audio/transcriptions", Buffer.from(await encoded.arrayBuffer()), encoded.headers.get("content-type")!, 20 * 60_000);
    if (res.status >= 400) throw toError(res.status, res.body);
    const out = JSON.parse(res.body.toString("utf8")) as { segments?: { start: number; end: number; text: string }[] };
    const segments = (out.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })).filter((s) => s.text);
    if (!segments.length) throw new Error(`rodium:${MODELS.transcribe} returned no timestamped segments`);
    return { segments, costUsd: usd((input.durationSec / 60) * RODI.transcribePerMinute), provider: `rodium:${MODELS.transcribe}` };
  }
}
