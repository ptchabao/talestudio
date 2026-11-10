import { DIRECT_STEP_COSTS as STEP_COSTS } from "@talestudio/core";
import type { GeneratedAsset, SpeechSynthesizer } from "./types";

/** Premade ElevenLabs voices; picked from the free-text voice description the script writer gives us. */
const VOICES = {
  narrator: "JBFqnCBsd6RMkjVDRZzb",
  womanAdult: "EXAVITQu4vr4xnSDxMaL",
  womanYoung: "21m00Tcm4TlvDq8ikWAM",
  manAdult: "pNInz6obpgDQGcFmaJgB",
  manOld: "VR6AewLTigWG4xSOukaG",
  child: "jBpfuIE2acCO8z3wKNLl",
} as const;

export type VoiceKind = keyof typeof VOICES;

/** Voice archetype from the script writer's free-text description; each TTS provider maps it to its own voices. */
export function voiceKind(description: string): VoiceKind {
  const d = description.toLowerCase();
  if (/\b(child|kid|boy|girl|young child)\b/.test(d)) return "child";
  if (/\b(female|woman|girl|she|her)\b/.test(d)) return /\b(young|teen)\b/.test(d) ? "womanYoung" : "womanAdult";
  if (/\b(male|man|he|his)\b/.test(d)) return /\b(old|elder|elderly|gravel)\b/.test(d) ? "manOld" : "manAdult";
  return "narrator";
}

export function pickVoice(description: string): string {
  return VOICES[voiceKind(description)];
}

export class ElevenLabsSynthesizer implements SpeechSynthesizer {
  async speak(input: { text: string; voice: string; language: string; preset?: VoiceKind }): Promise<GeneratedAsset> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
    const voiceId = input.preset ? VOICES[input.preset] : pickVoice(input.voice);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: input.text, model_id: "eleven_multilingual_v2", language_code: input.language }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const words = input.text.split(/\s+/).length;
    // ~150 words per minute of speech.
    const costUsd = (words / 150) * STEP_COSTS.ttsPerMinute.expected;
    return { bytes, contentType: "audio/mpeg", costUsd, provider: "elevenlabs:eleven_multilingual_v2" };
  }
}
