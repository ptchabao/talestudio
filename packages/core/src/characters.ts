import { z } from "zod";
import { STYLES } from "./schemas";

/**
 * TaleStudio Characters: persistent characters owned by the workspace and reused by every production.
 *   story   → a narrative character: can age, change clothes, evolve with the story.
 *   persona → a permanent virtual identity (influencer, ambassador, presenter): once locked, the face,
 *             the voice and the personality never change; only outfits, sets and poses do.
 * Fictional characters only: references are generated, never uploaded photos of real people.
 */
export const CHARACTER_KINDS = ["story", "persona"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export const CHARACTER_STATUSES = ["draft", "locked"] as const;
export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];

/** Voice archetypes every TTS provider maps to a fixed voice of its own. */
export const VOICE_KINDS = ["narrator", "womanAdult", "womanYoung", "manAdult", "manOld", "child"] as const;
export type VoiceKindId = (typeof VOICE_KINDS)[number];

/** candidate: one of the 4 face proposals · master: the approved main portrait · angle/expression/outfit: identity pack. */
export const REFERENCE_KINDS = ["candidate", "master", "angle", "expression", "outfit"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/** The identity pack: 6 angles + 4 expressions, each generated from the master portrait. */
export const IDENTITY_PACK = {
  angles: ["front close-up portrait", "three-quarter view facing left", "three-quarter view facing right", "side profile", "full body, standing, front view", "full body, three-quarter view, natural pose"],
  expressions: ["joyful, wide genuine smile", "angry, frowning", "sad, downcast eyes", "surprised, eyebrows raised"],
} as const;

/** References sent with each keyframe per character (master first), within the image models' 14-image limit. */
export const MAX_REFS_PER_CHARACTER = 3;

export const characterInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(CHARACTER_KINDS).default("story"),
  style: z.enum(STYLES).default("cinematic"),
  /** Visual DNA: everything that makes the face and body recognisable, reused verbatim in image prompts. */
  appearance: z.string().trim().min(10).max(1200),
  personality: z.string().trim().max(1200).default(""),
  backstory: z.string().trim().max(3000).default(""),
  voiceKind: z.enum(VOICE_KINDS).default("narrator"),
  /** How the voice is performed: tone, accent, pace. */
  voiceStyle: z.string().trim().max(300).default(""),
});
export type CharacterInput = z.infer<typeof characterInput>;

export const characterExtraInput = z.object({
  kind: z.enum(["outfit", "expression"]),
  description: z.string().trim().min(3).max(300),
});

export const characterNoteInput = z.object({ text: z.string().trim().min(3).max(1000) });

export type CharacterJobKind = "candidates" | "pack" | "extra";
