import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RenderClip {
  /** Local bytes of the clip (mp4) or still (image) for mock mode. */
  bytes: Uint8Array;
  kind: "video" | "image";
  /** File extension matching the bytes (jpg, png, webp, mp4) so FFmpeg picks the right decoder. */
  ext?: string;
  durationSec: number;
  /** Optional voice track for this shot, mixed at the shot's offset. */
  audio?: Uint8Array;
}

export interface RenderResult {
  video: Uint8Array;
  thumbnail: Uint8Array;
}

/** FFMPEG_PATH, else the binary shipped by ffmpeg-static (so every worker has the same build), else PATH. */
export function ffmpegBin(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const bundled = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (bundled) return bundled;
  } catch {}
  return "ffmpeg";
}

function run(args: string[], cwd: string, loglevel = "error"): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(/*turbopackIgnore: true*/ ffmpegBin(), ["-hide_banner", "-loglevel", loglevel, "-y", ...args], { cwd });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-2000)}`))));
  });
}
const ffmpeg = (args: string[], cwd: string) => run(args, cwd).then(() => undefined);

const FRAME: Record<string, [number, number]> = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] };

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await ffmpeg(["-version"], tmpdir());
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalise every shot to 1080p/30fps, concat, mix voice lines at their offsets, burn subtitles.
 * Runs in the worker (or a Modal/Fargate job) — never in the web tier.
 */
/** Re-frames clips for a platform: centre-crop to fill (vertical/square from 16:9 sources). */
/** Speech-grade mono Opus (~7 MB per hour) so long recordings fit upload-size limits of transcription APIs. */
export async function compressSpeech(input: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "ts-speech-"));
  try {
    await ffmpeg(["-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "16k", "speech.ogg"], dir);
    return new Uint8Array(await readFile(join(dir, "speech.ogg")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Duration in seconds of a local file or URL (ffmpeg prints it on stderr when no output is given). */
export async function probeDuration(input: string): Promise<number | null> {
  const err = await run(["-i", input], tmpdir(), "info").catch((e: Error) => e.message);
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** One still frame for mock/dev keyframes: a two-tone gradient, seeded per shot. */
export async function gradientFrame(seed: number, w = 1280, h = 720): Promise<Uint8Array> {
  const palette = ["0x1d2229", "0x60646c", "0xb9bbc6", "0x15191e", "0x8b8d98", "0xf3f3f7"];
  const dir = await mkdtemp(join(tmpdir(), "talestudio-frame-"));
  try {
    const c0 = palette[seed % palette.length]!;
    const c1 = palette[(seed + 3) % palette.length]!;
    await ffmpeg(["-f", "lavfi", "-i", `gradients=s=${w}x${h}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${w}:y1=${h}:duration=1:seed=${seed}`, "-frames:v", "1", "-q:v", "4", "f.jpg"], dir);
    return new Uint8Array(await readFile(join(dir, "f.jpg")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Cut one vertical clip out of a long recording, read straight from a (signed) URL with HTTP range
 * requests — the source is never downloaded whole. Burns the clip's own subtitles.
 */
export async function cutClip(opts: { sourceUrl: string; start: number; end: number; srt: string; format?: string; audioOnly?: boolean }): Promise<Uint8Array> {
  const [W, H] = FRAME[opts.format ?? "9:16"] ?? FRAME["9:16"]!;
  const dir = await mkdtemp(join(tmpdir(), "talestudio-clip-"));
  try {
    await writeFile(join(dir, "subs.srt"), opts.srt);
    const dur = String(Math.max(1, opts.end - opts.start));
    const subs = opts.srt.trim() ? ",subtitles=subs.srt:force_style='FontSize=14,Outline=2,MarginV=60,Alignment=2'" : "";
    // Audio-only podcasts get a plain branded background so the clip still works on video platforms.
    const input = opts.audioOnly
      ? ["-f", "lavfi", "-i", `color=c=0x15191e:s=${W}x${H}:r=30`, "-ss", String(opts.start), "-t", dur, "-i", opts.sourceUrl, "-map", "0:v", "-map", "1:a", "-shortest"]
      : ["-ss", String(opts.start), "-t", dur, "-i", opts.sourceUrl];
    const vf = opts.audioOnly ? `setsar=1${subs}` : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30${subs}`;
    await ffmpeg([...input, "-t", dur, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "clip.mp4"], dir);
    return new Uint8Array(await readFile(join(dir, "clip.mp4")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function renderEpisode(opts: { clips: RenderClip[]; srt: string; watermark: boolean; format?: string }): Promise<RenderResult> {
  const [W, H] = FRAME[opts.format ?? "16:9"] ?? FRAME["16:9"]!;
  const dir = await mkdtemp(join(tmpdir(), "talestudio-render-"));
  try {
    const parts: string[] = [];
    for (const [i, clip] of opts.clips.entries()) {
      const src = `src_${i}.${clip.ext ?? (clip.kind === "video" ? "mp4" : "jpg")}`;
      await writeFile(join(dir, src), clip.bytes);
      const out = `part_${i}.mp4`;
      const scale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30`;
      const input = clip.kind === "image" ? ["-loop", "1", "-t", String(clip.durationSec), "-i", src] : ["-i", src];
      const audio = clip.audio?.length ? (await writeFile(join(dir, `a_${i}.mp3`), clip.audio), ["-i", `a_${i}.mp3`]) : ["-f", "lavfi", "-t", String(clip.durationSec), "-i", "anullsrc=r=44100:cl=stereo"];
      await ffmpeg(
        [...input, ...audio, "-t", String(clip.durationSec), "-vf", scale, "-map", "0:v:0", "-map", "1:a:0", "-af", "apad", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2", out],
        dir,
      );
      parts.push(out);
    }
    await writeFile(join(dir, "list.txt"), parts.map((p) => `file '${p}'`).join("\n"));
    await writeFile(join(dir, "subs.srt"), opts.srt);

    const filters = [opts.srt.trim() ? "subtitles=subs.srt:force_style='FontSize=22,Outline=2,MarginV=40'" : null, opts.watermark ? "drawtext=text='TaleStudio':x=w-tw-32:y=32:fontsize=28:fontcolor=white@0.6" : null].filter(Boolean);
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", "list.txt", ...(filters.length ? ["-vf", filters.join(",")] : []), "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-movflags", "+faststart", "final.mp4"], dir);
    await ffmpeg(["-ss", "1", "-i", "final.mp4", "-frames:v", "1", "-vf", "scale=640:-2", "thumb.jpg"], dir);

    return { video: new Uint8Array(await readFile(join(dir, "final.mp4"))), thumbnail: new Uint8Array(await readFile(join(dir, "thumb.jpg"))) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
