"use client";

import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/config";
import type { Format, Shot } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

/** Aspect class per output format (literal strings so Tailwind generates them). */
export const ASPECT: Record<Format, string> = { "16:9": "aspect-video", "9:16": "aspect-[9/16]", "1:1": "aspect-square" };
/** Player width per format: vertical and square previews stay readable instead of filling the column. */
export const PLAYER: Record<Format, string> = { "16:9": "w-full", "9:16": "mx-auto w-full max-w-[400px]", "1:1": "mx-auto w-full max-w-[600px]" };

/** Plays keyframes (or clips, when available) back-to-back with subtitles: a preview before/without the final render. */
export function Animatic({ shots, frames, clips, aspect = "16:9" }: { shots: Shot[]; frames: Record<string, { url: string }>; clips: Record<string, { url: string; contentType: string }>; aspect?: Format }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const shot = shots[i];

  useEffect(() => {
    if (!playing || !shot) return;
    const t = setTimeout(() => (i + 1 < shots.length ? setI(i + 1) : setPlaying(false)), shot.durationSec * 1000);
    return () => clearTimeout(t);
  }, [playing, i, shot, shots.length]);

  if (!shot) return null;
  const clip = clips[String(shot.index)];
  const frame = frames[String(shot.index)];

  return (
    <div className={`overflow-hidden rounded-lg border bg-black ${PLAYER[aspect]}`}>
      <div className={`relative overflow-hidden ${ASPECT[aspect]}`}>
        {clip?.contentType.startsWith("video/") ? (
          <video key={clip.url} src={clip.url} autoPlay={playing} muted playsInline className="size-full object-cover" />
        ) : frame ? (
          <img key={`${i}-${playing}`} src={frame.url} alt={shot.caption || shot.visual} className={`size-full object-cover ${playing ? "animate-ken-burns" : ""}`} />
        ) : (
          <div className="grid size-full place-items-center text-sm text-white/60">{fmt(t.production.drawing, { n: i + 1 })}</div>
        )}
        {shot.line && (
          <p className="absolute inset-x-6 bottom-6 text-center text-balance text-lg font-medium text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.9)]">{shot.line}</p>
        )}
      </div>
      <div className="flex items-center gap-3 bg-neutral-950 px-3 py-2 text-white">
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label={playing ? t.production.pause : t.production.play} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label={t.production.restart} onClick={() => { setI(0); setPlaying(true); }}>
          <RotateCcw />
        </Button>
        <div className="flex flex-1 gap-1">
          {shots.map((s, k) => (
            <button key={s.index} aria-label={fmt(t.production.shot, { n: k + 1 })} onClick={() => setI(k)} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-white" : "bg-white/20"}`} />
          ))}
        </div>
        <span className="font-mono text-xs text-white/70">{i + 1}/{shots.length}</span>
      </div>
    </div>
  );
}
