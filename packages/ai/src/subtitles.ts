import type { Shot } from "@talestudio/core";

const ts = (sec: number) => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
};

/** SRT built from the script timing: one cue per shot that has a line. */
export function buildSrt(shots: Pick<Shot, "durationSec" | "line">[]): string {
  let t = 0;
  let n = 0;
  const cues: string[] = [];
  for (const shot of shots) {
    if (shot.line) {
      n += 1;
      cues.push(`${n}\n${ts(t + 0.1)} --> ${ts(t + shot.durationSec - 0.1)}\n${shot.line}\n`);
    }
    t += shot.durationSec;
  }
  return cues.join("\n");
}

/** SRT for one clip cut from a long recording: transcript segments inside [start, end], re-timed from 0. */
export function clipSrt(segments: { start: number; end: number; text: string }[], start: number, end: number): string {
  let n = 0;
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => {
      n += 1;
      return `${n}\n${ts(Math.max(0, s.start - start))} --> ${ts(Math.min(end, s.end) - start)}\n${s.text}\n`;
    })
    .join("\n");
}
