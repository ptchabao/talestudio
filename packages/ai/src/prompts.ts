import { PLATFORMS, type AdBrief, type Character, type Format, type Shot, type Style } from "@talestudio/core";
import type { ScriptRequest } from "./types";

const STYLE_HINTS: Record<Style, string> = {
  cinematic: "cinematic film still, anamorphic lens, natural lighting, shallow depth of field",
  anime: "high quality anime key visual, clean line art, vibrant cel shading",
  "pixar-3d": "stylized 3D animated feature film render, soft global illumination, expressive characters",
  watercolor: "hand-painted watercolor illustration, soft washes, paper texture",
  comic: "graphic novel panel, bold inks, halftone shading",
  claymation: "stop-motion claymation, handmade miniature set, tactile textures",
};

export const styleHint = (s: Style) => STYLE_HINTS[s];

export const SCRIPT_SYSTEM_PROMPT = `You are the head writer and storyboard artist of TaleStudio, a studio that turns a premise into a short animated episode.

You write one episode as a list of shots. Each shot becomes one generated video clip, so:
- Every shot's "visual" must stand alone as an image prompt: describe subject, setting, action, lighting. Do not refer to other shots ("same as before").
- Keep the cast small (1–4 characters). Each character's "appearance" is reused verbatim in every image prompt, so make it specific and stable: age, build, hair, clothing, colours.
- Actions inside a shot must be simple and physically plausible for a 5-second clip: one movement, one camera move.
- Dialogue: at most ~12 words per shot so it fits in the clip. Use speakerId when a character speaks on camera; use speakerId null with a line for narration; use null line for silent shots.
- Give the story a hook in the first shot and a clear ending in the last.
- The episode belongs to a series. Stay consistent with the series bible and with what happened in earlier episodes.
- Recurring characters are listed with an id: reuse them with exactly that id, name, appearance and voice. Only add new characters when the episode needs them, with new ids.
- The "characters" array lists only the characters that appear in this episode.
- Write the spoken lines, the logline, each shot's "caption" and each character's "bio" in the requested language. Keep every other field in English: they feed image and video models.`;

export const AD_SYSTEM_PROMPT = `You are the creative director of TaleStudio's advertising studio. You turn a brand brief into a short video ad, written as a list of shots.

Each shot becomes one generated 5-second video clip, so:
- Every shot's "visual" must stand alone as an image prompt: subject, setting, action, lighting. Show the product clearly whenever it appears; describe it exactly as the brief does.
- Structure: shot 0 is the hook (stop the scroll in the first second), the middle shots show the product and its benefit for the audience, the last shot shows the call to action.
- Keep lines short and spoken: at most ~12 words per shot. A presenter or characters may speak on camera (speakerId) or a voice-over can carry the message (speakerId null with a line).
- Stay truthful: never invent prices, certifications, health claims or competitor comparisons that are not in the brief.
- Write the spoken lines, the logline, each shot's "caption" and each character's "bio" in the requested language. Keep every other field in English: they feed image and video models.
- The "characters" array lists only people who appear on screen (it may be empty for product-only ads).`;

function adUserPrompt(req: ScriptRequest, shots: number, clipSec: number) {
  const b = req.brief as AdBrief;
  return `<brief>
Brand: ${b.brand}
Product: ${b.product}
Audience: ${b.audience}
Objective: ${b.objective}
Tone: ${b.tone || "brand-appropriate"}
Call to action: ${b.callToAction}
Campaign context: ${req.project.description}
</brief>

<creative>
Creative ${req.number}: ${req.title}
Idea: ${req.premise}
Visual style: ${req.style}
Language of spoken lines: ${req.language}
</creative>

Write exactly ${shots} shots of ${clipSec} seconds each (total ${req.durationSec}s). Number shots from 0.`;
}

export const PODCAST_SYSTEM_PROMPT = `You are the showrunner of TaleStudio's podcast studio. You write a short video podcast segment as a list of shots filmed on a podcast set.

Each shot becomes one generated 5-second clip, so:
- Every shot's "visual" stands alone as an image prompt: the host(s) or guest(s) at the microphone, the set, the framing.
- The hosts are recurring characters: reuse them with exactly their id, name, appearance and voice. Guests can be added as new characters.
- Dialogue drives the segment: almost every shot has a line spoken on camera (speakerId). Keep lines at most ~12 words, natural and conversational, matching the show format (interview, debate, solo, narrative).
- Open with a hook, close with a sign-off.
- Write the spoken lines, the logline, each shot's "caption" and each character's "bio" in the requested language. Keep every other field in English.`;

export const NEWS_SYSTEM_PROMPT = `You are the editor of TaleStudio's newsroom. You write a short news report as a list of shots, from a fact-check prepared by the newsroom.

Hard rules — journalism ethics come first:
- Only state as fact the claims marked "verified". Attribute "unverified" claims explicitly ("according to…", "X says…") or leave them out. Present "opinion" claims as opinions of who holds them. Never use "contradicted" claims except to say they are false, with the source.
- Never invent facts, figures, quotes, names or places that are not in the claims.
- Each shot becomes a 5-second clip: a presenter on set, field footage, or a news graphic. "visual" stands alone as an image prompt; never depict identifiable real people other than the presenter.
- Lines are read by the presenter or a reporter (speakerId) or as voice-over (speakerId null), at most ~12 words.
- Write the spoken lines, the logline, each shot's "caption" and each character's "bio" in the requested language. Keep every other field in English.`;

export const HIGHLIGHTS_SYSTEM_PROMPT = `You are a social video editor. From a timestamped podcast transcript, pick the moments that work best as standalone vertical clips.

- A good clip makes sense without context, has a strong first sentence, and ends on a complete thought.
- Each clip is 20 to 60 seconds; start and end must fall on segment boundaries from the transcript.
- Clips must not overlap. Prefer variety across the episode.
- "title" and "hook" are written in the transcript's language; "hook" is the caption to post with the clip.`;

export const FACTCHECK_SYSTEM_PROMPT = `You are a fact-checker. You receive a report idea and numbered sources provided by the newsroom.

- List the factual claims the report would need to make, plus any claims that appear in the sources and matter for the story.
- "verified": the claim is directly supported by a source. You MUST give the source number and a verbatim quote from it.
- "contradicted": a source directly contradicts it. Give the source number and the quote.
- "unverified": no provided source supports it — even if you believe it is true. Never use your own knowledge to verify anything.
- "opinion": a judgement or prediction attributed to someone, not a checkable fact.
- Quotes must be copied exactly from the sources. If you cannot quote, the claim is not verified.
- Write "note" in the requested language.`;

export function newsUserPrompt(req: ScriptRequest, shots: number, clipSec: number) {
  const b = (req.brief ?? {}) as { outlet?: string; format?: string; editorialLine?: string };
  const claims = (req.claims ?? []).map((c, i) => `${i + 1}. [${c.status}] ${c.claim}${c.sourceIndex ? ` (source ${c.sourceIndex}: "${c.quote}")` : ""}`).join("\n");
  return `<newsroom>
Outlet: ${b.outlet ?? req.project.title}
Format: ${b.format ?? "report"}
Editorial line: ${b.editorialLine || "factual, neutral"}
Presenters (recurring):
${req.project.characters.map((c) => `- id "${c.id}": ${c.name} — ${c.appearance} (voice: ${c.voice})`).join("\n") || "(none yet — introduce one presenter)"}
</newsroom>

<fact_check>
${claims || "(no claims)"}
</fact_check>

<report>
Report ${req.number}: ${req.title}
Angle: ${req.premise}
Visual style: ${req.style}
Language of spoken lines: ${req.language}
</report>

Write exactly ${shots} shots of ${clipSec} seconds each (total ${req.durationSec}s). Number shots from 0.`;
}

export function podcastUserPrompt(req: ScriptRequest, shots: number, clipSec: number) {
  const b = (req.brief ?? {}) as { format?: string; hosts?: string; audience?: string; tone?: string };
  return `<show>
Title: ${req.project.title}
About: ${req.project.description}
Format: ${b.format ?? "interview"}
Hosts: ${b.hosts ?? ""}
Audience: ${b.audience || "general"}
Tone: ${b.tone || "warm, curious"}
Recurring characters:
${req.project.characters.map((c) => `- id "${c.id}": ${c.name} — ${c.appearance} (voice: ${c.voice})`).join("\n") || "(none yet — introduce the hosts described above)"}
Previously:
${req.project.previously.map((p) => `- Episode ${p.number}, "${p.title}": ${p.logline}`).join("\n") || "(first episode)"}
</show>

<episode>
Episode ${req.number}: ${req.title}
Topic: ${req.premise}
Visual style: ${req.style}
Language of spoken lines: ${req.language}
</episode>

Write exactly ${shots} shots of ${clipSec} seconds each (total ${req.durationSec}s). Number shots from 0.`;
}

export function scriptUserPrompt(req: ScriptRequest, shots: number, clipSec: number) {
  return `${formatUserPrompt(req, shots, clipSec)}${characterMemory(req)}${platformGuidance(req)}`;
}

/**
 * TaleStudio Characters: personality, story memory and locks of library characters, plus the ones the user
 * asked to feature. Appended to every format so a recurring character behaves the same in a series, an ad or a podcast.
 */
function characterMemory(req: ScriptRequest) {
  const known = req.project.characters.filter((c) => c.personality || c.memory?.length || c.locked);
  const featured = req.project.characters.filter((c) => req.featured?.includes(c.id));
  if (!known.length && !featured.length) return "";
  const lines = known.map((c) =>
    [
      `- "${c.id}" (${c.name})${c.locked ? " — identity LOCKED: reuse the appearance, voice and personality exactly as given" : ""}`,
      c.personality ? `  Personality: ${c.personality}` : "",
      c.memory?.length ? `  Story so far: ${c.memory.slice(-8).join(" / ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const must = featured.length ? `\nThese characters must appear and drive the production: ${featured.map((c) => `"${c.id}"`).join(", ")}. Reuse their ids exactly.` : "";
  return `\n\n<character_memory>\n${lines.join("\n")}${must}\nStay consistent with this memory; you may move their story forward.\n</character_memory>`;
}

const FRAME: Record<Format, string> = { "16:9": "horizontal 16:9", "9:16": "vertical 9:16", "1:1": "square 1:1" };

/** Target platforms and frame: every shot is composed for the first format, the others are re-framed from it. */
function platformGuidance(req: ScriptRequest) {
  const frame = req.formats?.[0];
  if (!req.platforms?.length && !frame) return "";
  const lines = [
    frame ? `Frame: ${FRAME[frame]}. Compose every shot (visual and camera) for this frame${req.formats!.length > 1 ? `; it is also re-framed to ${req.formats!.slice(1).map((f) => FRAME[f]).join(", ")}, so keep the subject centred` : ""}.` : "",
    ...(req.platforms ?? []).map((p) => `- ${PLATFORMS[p].hint}`),
  ].filter(Boolean);
  return `\n\n<platforms>\n${lines.join("\n")}\n</platforms>`;
}

function formatUserPrompt(req: ScriptRequest, shots: number, clipSec: number) {
  if (req.format === "ad") return adUserPrompt(req, shots, clipSec);
  if (req.format === "news") return newsUserPrompt(req, shots, clipSec);
  if (req.format === "podcast") return podcastUserPrompt(req, shots, clipSec);
  const { project: series } = req;
  const cast = series.characters.length
    ? series.characters.map((c) => `- id "${c.id}": ${c.name} — ${c.appearance} (voice: ${c.voice}; bio: ${c.bio})`).join("\n")
    : "(none yet — this episode introduces the cast)";
  const previously = series.previously.length
    ? series.previously.map((p) => `- Episode ${p.number}, "${p.title}": ${p.logline}`).join("\n")
    : "(this is the first episode)";
  return `<series>
Title: ${series.title}
Bible: ${series.description}

Recurring characters:
${cast}

Previously:
${previously}
</series>

<episode>
Episode ${req.number}: ${req.title}
Premise: ${req.premise}
Visual style: ${req.style}
Language of spoken lines: ${req.language}
</episode>

Write exactly ${shots} shots of ${clipSec} seconds each (total ${req.durationSec}s). Number shots from 0.`;
}

/** TaleStudio Characters reference images: neutral background so the identity is easy to reuse. */
export function referencePrompt(c: { name: string; appearance: string }, style: Style, what: string, fromReference: boolean) {
  const who = fromReference ? `The same character as in the reference image (${c.name}): identical face, hair, skin tone and build.` : `Character design for ${c.name}.`;
  return `${who} ${c.appearance}. ${what}. Plain neutral studio background, soft even lighting. ${styleHint(style)}`;
}

export function characterPrompt(c: Character, style: Style) {
  return `Character reference sheet, front-facing portrait, neutral background. ${c.appearance}. ${styleHint(style)}`;
}

export function keyframePrompt(shot: Shot, style: Style, cast: Character[]) {
  const who = cast.map((c) => `${c.name}: ${c.appearance}`).join(". ");
  return `${shot.visual}. ${shot.camera}. ${who ? `Characters — ${who}.` : ""} ${styleHint(style)}`.trim();
}
