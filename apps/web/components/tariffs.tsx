import type { Dictionary } from "@/i18n/config";
import { fmt } from "@/i18n/config";
import { episodeTokenCost, TOKEN_COSTS, TOPUP } from "@talestudio/core";

const fcfa = (tokens: number) => (tokens * TOPUP.xofPerToken).toLocaleString("fr-FR");

/** The public TaleToken price list, read from TOKEN_COSTS so the page can never drift from what is charged. */
export function Tariffs({ t }: { t: Dictionary }) {
  const c = TOKEN_COSTS;
  const rows: [string, string][] = [
    [t.tariffs.storyboard, fmt(t.tariffs.storyboardPrice, { base: c.storyboardBase, perShot: c.storyboardPerShot })],
    [t.tariffs.videoClip, fmt(t.tariffs.perClip, { n: c.videoClip })],
    [t.tariffs.spokenShot, fmt(t.tariffs.perShot, { n: c.spokenShot })],
    [t.tariffs.redraw, `${c.keyframeRedraw} TT`],
    [t.tariffs.transcription, fmt(t.tariffs.per10Min, { n: c.transcriptionPer10Min })],
    [t.tariffs.highlights, `${c.highlights} TT`],
    [t.tariffs.socialClip, fmt(t.tariffs.perClip, { n: c.clip })],
    [t.tariffs.factCheck, `${c.factCheck} TT`],
    [t.tariffs.characterFaces, `${c.characterCandidates} TT`],
    [t.tariffs.identityPack, `${c.identityPack} TT`],
    [t.tariffs.characterExtra, `${c.characterExtra} TT`],
    [t.tariffs.render, t.tariffs.included],
  ];
  const examples = [30, 60].map((d) => ({ d, tt: episodeTokenCost({ durationSec: d, spokenShotRatio: 0.5, mode: "full" }) }));
  return (
    <div className="grid gap-4">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {rows.map(([label, price]) => (
            <tr key={label}>
              <td className="py-2 pr-4">{label}</td>
              <td className="py-2 text-right font-mono whitespace-nowrap">{price}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {examples.map(({ d, tt }) => (
          <li key={d}>{fmt(t.tariffs.example, { d, tt, fcfa: fcfa(tt) })}</li>
        ))}
      </ul>
    </div>
  );
}
