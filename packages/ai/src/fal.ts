import { fal } from "@fal-ai/client";
import { DIRECT_STEP_COSTS as STEP_COSTS, type Character, type Format, type Shot, type Style } from "@talestudio/core";
import { characterPrompt, keyframePrompt } from "./prompts";
import type { GeneratedAsset, ImageGenerator, LipSyncer, Transcriber, VideoGenerator } from "./types";

/**
 * fal.ai is our GPU router (spec: "pay per second, no dedicated H100s at the start").
 * Model ids are env-overridable so we can swap Kling ↔ Runway ↔ Luma without a deploy.
 */
const MODELS = {
  image: process.env.FAL_IMAGE_MODEL ?? "fal-ai/flux/dev",
  consistentImage: process.env.FAL_CONSISTENT_IMAGE_MODEL ?? "fal-ai/flux-pulid",
  video: process.env.FAL_VIDEO_MODEL ?? "fal-ai/kling-video/v2.1/standard/image-to-video",
  lipsync: process.env.FAL_LIPSYNC_MODEL ?? "fal-ai/sync-lipsync",
  whisper: process.env.FAL_WHISPER_MODEL ?? "fal-ai/whisper",
};

fal.config({ credentials: process.env.FAL_KEY });

interface FalImageOut {
  images: { url: string; content_type?: string }[];
}
interface FalVideoOut {
  video: { url: string; content_type?: string };
}

async function run<T>(model: string, input: Record<string, unknown>): Promise<T> {
  const result = await fal.subscribe(model, { input, logs: false });
  return result.data as T;
}

export class FalImageGenerator implements ImageGenerator {
  async character(c: Character, style: Style): Promise<GeneratedAsset> {
    const out = await run<FalImageOut>(MODELS.image, {
      prompt: characterPrompt(c, style),
      image_size: "portrait_4_3",
      num_images: 1,
    });
    return img(out, STEP_COSTS.image.expected, MODELS.image);
  }

  /** PuLID conditions on one face: the first reference (the master portrait). */
  async variant(input: { prompt: string; refs: string[]; aspect: "portrait" | Format }): Promise<GeneratedAsset> {
    const ref = input.refs[0];
    const model = ref ? MODELS.consistentImage : MODELS.image;
    const out = await run<FalImageOut>(model, {
      prompt: input.prompt,
      image_size: input.aspect === "portrait" ? "portrait_4_3" : IMAGE_SIZES[input.aspect],
      num_images: 1,
      ...(ref ? { reference_image_url: ref } : {}),
    });
    return img(out, STEP_COSTS.image.expected, model);
  }

  async keyframe(shot: Shot, style: Style, refs: { character: Character; imageUrl: string; extraUrls?: string[] }[], aspect: Format): Promise<GeneratedAsset> {
    const prompt = keyframePrompt(
      shot,
      style,
      refs.map((r) => r.character),
    );
    // Identity conditioning on the main character keeps faces stable shot to shot.
    const main = refs[0];
    const model = main ? MODELS.consistentImage : MODELS.image;
    const out = await run<FalImageOut>(model, {
      prompt,
      image_size: IMAGE_SIZES[aspect],
      num_images: 1,
      ...(main ? { reference_image_url: main.imageUrl } : {}),
    });
    return img(out, STEP_COSTS.image.expected, model);
  }
}

const IMAGE_SIZES: Record<Format, string> = { "16:9": "landscape_16_9", "9:16": "portrait_16_9", "1:1": "square_hd" };

export class FalVideoGenerator implements VideoGenerator {
  async animate(input: { imageUrl: string; prompt: string; durationSec: number; aspect: Format }): Promise<GeneratedAsset> {
    const out = await run<FalVideoOut>(MODELS.video, {
      image_url: input.imageUrl,
      prompt: input.prompt,
      duration: input.durationSec <= 5 ? "5" : "10",
      aspect_ratio: input.aspect,
    });
    return { url: out.video.url, contentType: "video/mp4", costUsd: STEP_COSTS.videoClip.expected, provider: MODELS.video };
  }
}

export class FalLipSyncer implements LipSyncer {
  async sync(input: { videoUrl: string; audioUrl: string }): Promise<GeneratedAsset> {
    const out = await run<FalVideoOut>(MODELS.lipsync, { video_url: input.videoUrl, audio_url: input.audioUrl });
    return { url: out.video.url, contentType: "video/mp4", costUsd: STEP_COSTS.lipSyncClip.expected, provider: MODELS.lipsync };
  }
}

function img(out: FalImageOut, costUsd: number, provider: string): GeneratedAsset {
  const first = out.images[0];
  if (!first) throw new Error(`${provider} returned no image`);
  return { url: first.url, contentType: first.content_type ?? "image/jpeg", costUsd, provider };
}

/** Whisper on fal: ~$0.006 per minute of audio. Returns segment-level timestamps. */
export class FalTranscriber implements Transcriber {
  async transcribe(input: { audioUrl: string; language: string; durationSec: number }) {
    const out = await run<{ chunks?: { timestamp: [number, number | null]; text: string }[] }>(MODELS.whisper, {
      audio_url: input.audioUrl,
      task: "transcribe",
      language: input.language,
      chunk_level: "segment",
    });
    const segments = (out.chunks ?? []).map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 5, text: c.text.trim() })).filter((s) => s.text);
    return { segments, costUsd: (input.durationSec / 60) * 0.006, provider: MODELS.whisper };
  }
}
