import { ClaudeFactChecker, ClaudeHighlightFinder, ClaudeIdentityChecker, ClaudeScriptWriter, anthropicDirect } from "./anthropic";
import { ElevenLabsSynthesizer } from "./elevenlabs";
import { FalImageGenerator, FalLipSyncer, FalTranscriber, FalVideoGenerator } from "./fal";
import { withFallback } from "./fallback";
import { MockFactChecker, MockHighlightFinder, MockIdentityChecker, MockImageGenerator, MockLipSyncer, MockScriptWriter, MockSpeechSynthesizer, MockTranscriber, MockVideoGenerator } from "./mock";
import { rodiumClaude, RodiumImageGenerator, RodiumSpeechSynthesizer, RodiumTranscriber, RodiumVideoGenerator } from "./rodium";
import type { Providers } from "./types";

export * from "./types";
export { enforceQuotes, ScriptRefusedError, splitSources } from "./anthropic";
export { pickVoice, voiceKind } from "./elevenlabs";
export { withFallback } from "./fallback";
export { RodiumError } from "./rodium";
export { keyframePrompt, characterPrompt, referencePrompt } from "./prompts";
export { buildSrt, clipSrt } from "./subtitles";
export { compressSpeech, cutClip, ffmpegAvailable, ffmpegBin, gradientFrame, probeDuration, renderEpisode, type RenderClip } from "./render";

/**
 * AI_PROVIDERS=mock  → everything mocked (default when keys are missing)
 * AI_PROVIDERS=live  → real providers
 * Per-step override, e.g. AI_SCRIPT=live with everything else mocked, to iterate on prompts cheaply.
 *
 * Live steps run on Rodium when RODIUM_API_KEY is set, and fall back to the direct provider (Anthropic, fal,
 * ElevenLabs) only when Rodium fails and that provider's key is set. Without a Rodium key, direct providers only.
 * Lip-sync has no Rodium model and always runs on fal.
 */
export function createProviders(env: NodeJS.ProcessEnv = process.env): Providers {
  const base = env.AI_PROVIDERS ?? "mock";
  const live = (step: string) => (env[`AI_${step.toUpperCase()}`] ?? base) === "live";
  const route = <T extends object>(step: string, rodium: () => T, direct: () => T, directKey: string | undefined): T =>
    env.RODIUM_API_KEY ? withFallback(step, rodium(), directKey ? direct() : null) : direct();
  const claude = <T extends object>(step: string, make: (r?: ReturnType<typeof rodiumClaude>) => T) => route(step, () => make(rodiumClaude()), () => make(), env.ANTHROPIC_API_KEY);
  return {
    script: live("script") ? claude("script", (r) => new ClaudeScriptWriter(r)) : new MockScriptWriter(),
    image: live("image") ? route("image", () => new RodiumImageGenerator(), () => new FalImageGenerator(), env.FAL_KEY) : new MockImageGenerator(),
    video: live("video") ? route("video", () => new RodiumVideoGenerator(), () => new FalVideoGenerator(), env.FAL_KEY) : new MockVideoGenerator(),
    speech: live("speech") ? route("speech", () => new RodiumSpeechSynthesizer(), () => new ElevenLabsSynthesizer(), env.ELEVENLABS_API_KEY) : new MockSpeechSynthesizer(),
    lipsync: live("lipsync") ? new FalLipSyncer() : new MockLipSyncer(),
    transcriber: live("transcribe") ? route("transcribe", () => new RodiumTranscriber(), () => new FalTranscriber(), env.FAL_KEY) : new MockTranscriber(),
    highlights: live("highlights") ? claude("highlights", (r) => new ClaudeHighlightFinder(r)) : new MockHighlightFinder(),
    factCheck: live("factcheck") ? claude("factcheck", (r) => new ClaudeFactChecker(r)) : new MockFactChecker(),
    // Identity checks follow the image step: real images get a real check.
    identity: live("image") ? route("identity", () => new ClaudeIdentityChecker(rodiumClaude("check")), () => new ClaudeIdentityChecker(anthropicDirect("check")), env.ANTHROPIC_API_KEY) : new MockIdentityChecker(),
  };
}
