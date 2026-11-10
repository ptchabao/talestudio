import type { VoiceKind } from "./elevenlabs";
import type { AdBrief, Character, Claim, Format, Highlight, NewsBrief, Platform, PodcastBrief, Script, Shot, Style, TranscriptSegment } from "@talestudio/core";

/** What every provider returns. Either a short-lived URL or raw bytes, plus what it cost us. */
export interface GeneratedAsset {
  url?: string;
  bytes?: Uint8Array;
  contentType: string;
  costUsd: number;
  provider: string;
}

/** A cast member as the writer sees it; library characters (TaleStudio Characters) carry their memory. */
export interface CastCharacter extends Character {
  personality?: string;
  /** Story memory, oldest first: what already happened to this character. */
  memory?: string[];
  /** Persona whose identity is locked: appearance, voice and personality must not change. */
  locked?: boolean;
}

export interface ProjectContext {
  title: string;
  /** Series bible / campaign context written by the user. */
  description: string;
  /** Recurring cast already established in earlier episodes — must be reused as-is. */
  characters: CastCharacter[];
  /** Loglines of earlier episodes, oldest first. */
  previously: { number: number; title: string; logline: string }[];
}

export interface ScriptRequest {
  title: string;
  premise: string;
  style: Style;
  durationSec: number;
  language: string;
  number: number;
  /** Which writer: story episode, ad creative, podcast episode or news report. */
  format: "episode" | "ad" | "podcast" | "news";
  project: ProjectContext;
  /** Studio brief (ad / podcast / news), when the project has one. */
  brief?: AdBrief | PodcastBrief | NewsBrief | null;
  /** News only: the checked claims the report may use. */
  claims?: Claim[] | null;
  /** Where it will be posted: pacing and framing guidance for the writer. */
  platforms?: Platform[];
  /** Output formats; the first is the frame every shot is composed for. */
  formats?: Format[];
  /** Ids of cast characters the user asked to feature: they must appear. */
  featured?: string[];
}

export interface ScriptWriter {
  write(req: ScriptRequest): Promise<{ script: Script; costUsd: number; provider: string }>;
}

export interface ImageGenerator {
  /** Reference portrait used to keep a character consistent across shots. */
  character(c: Character, style: Style): Promise<GeneratedAsset>;
  /**
   * Keyframe for one shot, conditioned on the characters' reference images, in the production's main aspect ratio.
   * `imageUrl` is each character's master portrait; `extraUrls` are more approved references (angles, outfits).
   */
  keyframe(shot: Shot, style: Style, refs: { character: Character; imageUrl: string; extraUrls?: string[] }[], aspect: Format): Promise<GeneratedAsset>;
  /** Free-form reference image for TaleStudio Characters (face proposals, angles, expressions, outfits). */
  variant(input: { prompt: string; refs: string[]; aspect: "portrait" | Format }): Promise<GeneratedAsset>;
}

export interface VideoGenerator {
  animate(input: { imageUrl: string; prompt: string; durationSec: number; aspect: Format }): Promise<GeneratedAsset>;
}

export interface SpeechSynthesizer {
  /** `preset` pins a library character's voice archetype instead of guessing it from the description. */
  speak(input: { text: string; voice: string; language: string; preset?: VoiceKind }): Promise<GeneratedAsset>;
}

export interface LipSyncer {
  sync(input: { videoUrl: string; audioUrl: string }): Promise<GeneratedAsset>;
}

export interface Transcriber {
  transcribe(input: { audioUrl: string; language: string; durationSec: number }): Promise<{ segments: TranscriptSegment[]; costUsd: number; provider: string }>;
}

export interface HighlightFinder {
  find(input: { segments: TranscriptSegment[]; count: number; language: string; context: string }): Promise<{ highlights: Highlight[]; costUsd: number; provider: string }>;
}

export interface FactChecker {
  check(input: { premise: string; sources: string; language: string }): Promise<{ claims: Claim[]; costUsd: number; provider: string }>;
}

/** Does `candidateUrl` show the same person as `referenceUrl`? Used to keep library characters recognisable. */
export interface IdentityChecker {
  check(input: { referenceUrl: string; candidateUrl: string; name: string }): Promise<{ same: boolean; score: number; issues: string; costUsd: number; provider: string }>;
}

export interface Providers {
  script: ScriptWriter;
  image: ImageGenerator;
  video: VideoGenerator;
  speech: SpeechSynthesizer;
  lipsync: LipSyncer;
  transcriber: Transcriber;
  highlights: HighlightFinder;
  factCheck: FactChecker;
  identity: IdentityChecker;
}
