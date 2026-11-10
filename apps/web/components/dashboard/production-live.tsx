"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage, fmt } from "@/i18n/config";
import type { ProductionView } from "@/lib/productions";
import { PLATFORMS, TOKEN_COSTS, type Claim, type Format, type Shot } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Input, Label, Textarea } from "@talestudio/ui/input";
import { cn } from "@talestudio/ui/lib/utils";
import { Progress } from "@talestudio/ui/progress";
import { Skeleton } from "@talestudio/ui/skeleton";
import { AlertTriangle, Check, Circle, Download, Loader2, Lock, Mic, Pencil, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Animatic, ASPECT, PLAYER } from "./animatic";
import { StatusBadge } from "./status-badge";

interface Props {
  initial: ProductionView;
  can: { edit: boolean; approve: boolean; cancel: boolean };
  canProduceVideo: boolean;
}

export function ProductionLive({ initial, can, canProduceVideo }: Props) {
  const { t } = useI18n();
  const [ep, setEp] = useState(initial);
  const [redrawing, setRedrawing] = useState<Record<number, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const copy = t.studio[ep.project.studio];

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/episodes/${ep.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const next: ProductionView = await res.json();
    setEp(next);
    // A redraw is finished when the frame URL changed (new asset).
    setRedrawing((r) => Object.fromEntries(Object.entries(r).filter(([i, old]) => next.keyframes[i]?.url === old || !next.keyframes[i])));
  }, [ep.id]);

  const polling = !ep.done || Object.keys(redrawing).length > 0;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [polling, refresh]);

  const [signOff, setSignOff] = useState(false);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setNotice(null);
    const res = await fetch(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!res.ok) return setNotice(errorMessage(t, await res.json().catch(() => null)));
    await refresh();
  }

  async function redraw(index: number) {
    setRedrawing((r) => ({ ...r, [index]: ep.keyframes[String(index)]?.url ?? "" }));
    const res = await fetch(`/api/episodes/${ep.id}/shots/${index}/redraw`, { method: "POST" });
    if (!res.ok) {
      setRedrawing(({ [index]: _, ...rest }) => rest);
      setNotice(errorMessage(t, await res.json().catch(() => null)));
    }
  }

  const shots = ep.script?.shots ?? [];
  const isClips = ep.kind === "clips";
  const isNews = Boolean(ep.claims);
  const selectedMoments = (ep.highlights ?? []).map((h, i) => (h.selected === false ? -1 : i)).filter((i) => i >= 0);
  const approveLabel = isClips
    ? fmt(t.production.cutClips, { n: selectedMoments.length, c: selectedMoments.length * TOKEN_COSTS.clip })
    : fmt(t.production.approveButton, { n: ep.estimate.production });
  const approveBody = isNews ? { signOff: true } : undefined;

  async function toggleMoment(i: number) {
    const next = selectedMoments.includes(i) ? selectedMoments.filter((x) => x !== i) : [...selectedMoments, i];
    setEp((e) => ({ ...e, highlights: e.highlights?.map((h, k) => (k === i ? { ...h, selected: next.includes(k) } : h)) ?? null }));
    const res = await fetch(`/api/episodes/${ep.id}/highlights`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ selected: next }) });
    if (!res.ok) setNotice(errorMessage(t, await res.json().catch(() => null)));
  }
  const renders = Object.entries(ep.renders) as [keyof typeof t.formats, string][];
  const mainRender = renders[0]?.[1];
  const frame: Format = (renders[0]?.[0] as Format | undefined) ?? ep.formats[0] ?? "16:9";
  const stopped = ep.status === "failed" || ep.status === "canceled";

  return (
    <div className="grid gap-8 px-8 py-8 xl:grid-cols-[1fr_360px]">
      <div className="grid min-w-0 content-start gap-8">
        {isClips ? null : mainRender ? (
          <video src={mainRender} poster={ep.thumbnailUrl ?? undefined} controls playsInline className={cn("rounded-lg bg-black", ASPECT[frame], PLAYER[frame])} />
        ) : shots.length > 0 ? (
          <Animatic shots={shots} frames={ep.keyframes} clips={ep.clips} aspect={ep.formats[0] ?? "16:9"} />
        ) : (
          <Skeleton className={cn("rounded-lg", ASPECT[frame], PLAYER[frame])} />
        )}

        {notice && <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">{notice}</p>}

        {ep.status === "storyboard_ready" && ep.editable && can.approve && (
          canProduceVideo ? (
            <div className="flex flex-col gap-4 rounded-lg border border-foreground p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t.production.approveTitle}</p>
                <p className="mt-1 max-w-[520px] text-sm text-muted-foreground">{t.production.approveBody}</p>
              </div>
              <div className="grid gap-3 sm:justify-items-end">
                {isNews && (
                  <label className="flex max-w-[420px] items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={signOff} onChange={(e) => setSignOff(e.target.checked)} className="mt-0.5 accent-[var(--foreground)]" />
                    {t.production.signOff}
                  </label>
                )}
                <Button size="lg" disabled={busy || Object.keys(redrawing).length > 0 || (isNews && !signOff) || (isClips && selectedMoments.length === 0)} onClick={() => post(`/api/episodes/${ep.id}/approve`, approveBody)}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  {approveLabel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg bg-muted p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t.production.upgradeTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.production.upgradeBody}</p>
              </div>
              <Button asChild><Link href="/dashboard/billing">{t.production.upgradeCta}</Link></Button>
            </div>
          )
        )}

        {stopped && (
          <div className={cn("flex flex-col gap-4 rounded-lg border p-6 sm:flex-row sm:items-start sm:justify-between", ep.status === "failed" && "border-destructive/40")}>
            <div className="flex gap-3 text-sm">
              <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", ep.status === "failed" ? "text-destructive" : "text-steel")} />
              <div>
                <p className="font-semibold">{ep.status === "failed" ? t.production.failedTitle : t.production.canceledTitle}</p>
                <p className="mt-1 text-muted-foreground">{ep.status === "failed" && `${t.errors[ep.errorCode ?? "pipeline_failed"]} `}{t.production.refunded}</p>
                {ep.retryable && can.approve && <p className="mt-1 text-xs text-pewter">{t.production.retryHint}</p>}
                {ep.error && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{t.production.technical}</summary>
                    <code className="mt-1 block font-mono break-words">{ep.error}</code>
                  </details>
                )}
              </div>
            </div>
            {ep.retryable && can.approve && (
              <Button variant="outline" disabled={busy || (isNews && Boolean(ep.approvedAt) && !signOff)} onClick={() => post(`/api/episodes/${ep.id}/retry`, ep.approvedAt ? approveBody : undefined)}>
                <RefreshCw /> {t.production.retry}
              </Button>
            )}
          </div>
        )}

        {ep.claims && <FactCheck claims={ep.claims} sources={ep.sourcesList} />}

        {isClips && (
          <section className="grid gap-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{t.production.moments}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t.production.momentsHint}</p>
              </div>
              {ep.highlights && <span className="text-sm text-muted-foreground">{fmt(t.production.selected, { n: selectedMoments.length })}</span>}
            </div>
            {!ep.highlights ? (
              <div className="grid gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
            ) : (
              <ol className="grid gap-2">
                {ep.highlights.map((h, i) => {
                  const clipUrl = ep.socialClips[String(i)];
                  return (
                    <li key={i} className={cn("grid gap-4 rounded-lg border p-4 sm:grid-cols-[auto_1fr_auto]", h.selected !== false && "border-foreground/60")}>
                      <input type="checkbox" aria-label={h.title} checked={h.selected !== false} disabled={!ep.editable || !can.edit} onChange={() => toggleMoment(i)} className="mt-1 size-4 accent-[var(--foreground)]" />
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground">{fmtTime(h.start)} – {fmtTime(h.end)} · {Math.round(h.end - h.start)}s</p>
                        <p className="mt-1 font-semibold">{h.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{h.hook}</p>
                      </div>
                      {clipUrl && (
                        <div className="grid gap-2 justify-items-end">
                          <video src={clipUrl} controls playsInline className="aspect-[9/16] w-28 rounded-[8px] bg-black" />
                          <Button asChild variant="outline" size="sm"><a href={clipUrl} download><Download /> {fmt(t.production.clip, { n: i + 1 })}</a></Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {ep.transcriptPreview && (
              <details className="rounded-lg bg-muted p-4 text-sm">
                <summary className="cursor-pointer font-medium">{t.production.transcript}</summary>
                <div className="mt-3 grid max-h-80 gap-1 overflow-y-auto">
                  {ep.transcriptPreview.map((seg, i) => (
                    <p key={i}><span className="mr-2 font-mono text-xs text-pewter">{fmtTime(seg.start)}</span>{seg.text}</p>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        {!isClips && <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.production.storyboard}</h2>
            {!ep.editable && ep.approvedAt && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" />{t.production.locked}</span>}
          </div>
          {shots.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={cn("rounded-lg", ASPECT[ep.formats[0] ?? "16:9"])} />)}</div>
          ) : (
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shots.map((s) => (
                <ShotCard
                  key={s.index}
                  episodeId={ep.id}
                  shot={s}
                  aspect={ep.formats[0] ?? "16:9"}
                  frame={redrawing[s.index] !== undefined ? undefined : ep.keyframes[String(s.index)]?.url}
                  check={redrawing[s.index] !== undefined ? null : (ep.keyframes[String(s.index)]?.check ?? null)}
                  redrawing={redrawing[s.index] !== undefined}
                  editable={ep.editable && can.edit}
                  onSaved={refresh}
                  onRedraw={() => redraw(s.index)}
                  onError={(m) => setNotice(m)}
                />
              ))}
            </ol>
          )}
        </section>}
      </div>

      <aside className="grid content-start gap-4">
        <div className="rounded-lg border p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t.production.progress}</h2>
            <StatusBadge status={ep.status} />
          </div>
          <Progress value={ep.progress * 100} className="mt-4" />
          {!ep.done && can.cancel && (
            <Button variant="outline" size="sm" className="mt-4 w-full" disabled={busy} onClick={() => post(`/api/episodes/${ep.id}/cancel`)}>{t.production.cancel}</Button>
          )}
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="font-semibold">{t.production.pipeline}</h2>
          {(["storyboard", "production"] as const).filter((st) => ep.pipeline.some((b) => b.stage === st)).map((stage) => (
            <div key={stage} className="mt-5">
              <p className="text-xs font-medium tracking-wide text-steel uppercase">{t.production.stages[stage]}</p>
              <ol className="mt-2 grid gap-1.5">
                {ep.pipeline.filter((b) => b.stage === stage).map((b) => (
                  <li key={b.nodeId} className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
                    <BlockIcon status={b.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.production.blocks[b.block as keyof typeof t.production.blocks] ?? b.block}</span>
                      <span className="block truncate text-xs text-muted-foreground">{b.providers.join(" · ")} · v{b.version}</span>
                    </span>
                    <span className="text-right text-xs text-muted-foreground">
                      {b.itemsTotal > 1 && <span className="block font-mono">{fmt(t.production.items, { done: b.itemsDone, total: b.itemsTotal })}</span>}
                      <span className="block">{b.credits > 0 ? fmt(t.wallet.tokensShort, { n: b.credits }) : t.production.free}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        {!isClips && (renders.length > 0 || ep.formats.length > 1) && (
          <div className="rounded-lg border p-6">
            <h2 className="font-semibold">{t.production.exports}</h2>
            <ul className="mt-4 grid gap-2">
              {ep.formats.map((f) => {
                const url = ep.renders[f];
                return (
                  <li key={f} className="flex items-center justify-between gap-2 text-sm">
                    <span className="grid">
                      <span>{t.formats[f]}</span>
                      {ep.platforms.some((p) => PLATFORMS[p].format === f) && (
                        <span className="text-xs text-muted-foreground">{fmt(t.production.postOn, { platforms: ep.platforms.filter((p) => PLATFORMS[p].format === f).map((p) => t.platforms[p]).join(", ") })}</span>
                      )}
                    </span>
                    {url ? (
                      <Button asChild variant="outline" size="sm"><a href={url} download><Download /> {t.production.download}</a></Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{ep.status === "completed" ? t.production.previewOnly : t.production.blockStatus.pending}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {ep.script && ep.script.characters.length > 0 && (
          <div className="rounded-lg border p-6">
            <h2 className="font-semibold">{t.production.cast}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{ep.script.logline}</p>
            <div className="mt-4 grid gap-3">
              {ep.script.characters.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="size-11 shrink-0 overflow-hidden rounded-[8px] bg-muted">{ep.characters[c.id] && <img src={ep.characters[c.id]!.url} alt={c.name} className="size-full object-cover" />}</div>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{c.name}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.bio || c.appearance}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="px-1 text-xs text-pewter">{fmt(copy.productionN, { n: ep.number })}</p>
      </aside>
    </div>
  );
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Journalism: every claim with its status and the exact source quote that supports it. */
function FactCheck({ claims, sources }: { claims: Claim[]; sources: string[] }) {
  const { t } = useI18n();
  const tone: Record<Claim["status"], string> = {
    verified: "text-success",
    contradicted: "text-destructive",
    unverified: "text-muted-foreground",
    opinion: "text-muted-foreground",
  };
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t.production.factCheck}</h2>
        <p className="mt-1 max-w-[640px] text-sm text-muted-foreground">{t.production.factCheckHint}</p>
      </div>
      <ol className="divide-y rounded-lg border">
        {claims.map((c, i) => (
          <li key={i} className="grid gap-1 p-4 text-sm sm:grid-cols-[120px_1fr]">
            <span className={cn("text-xs font-semibold tracking-wide uppercase", tone[c.status])}>{t.production.claimStatus[c.status]}</span>
            <div className="min-w-0">
              <p className="font-medium">{c.claim}</p>
              {c.quote && (
                <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">
                  “{c.quote}” <span className="text-xs text-pewter">— {fmt(t.production.source, { n: c.sourceIndex ?? 0 })}</span>
                </blockquote>
              )}
              <p className="mt-1 text-xs text-pewter">{c.note}</p>
            </div>
          </li>
        ))}
      </ol>
      <details className="rounded-lg bg-muted p-4 text-sm">
        <summary className="cursor-pointer font-medium">{t.production.sources}</summary>
        <ol className="mt-3 grid gap-3">
          {sources.map((src, i) => (
            <li key={i}><p className="text-xs font-semibold text-pewter">{fmt(t.production.source, { n: i + 1 })}</p><p className="mt-1 whitespace-pre-wrap break-words">{src}</p></li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function BlockIcon({ status }: { status: string }) {
  if (status === "completed") return <Check className="size-4 shrink-0" />;
  if (status === "running") return <Loader2 className="size-4 shrink-0 animate-spin" />;
  if (status === "failed") return <X className="size-4 shrink-0 text-destructive" />;
  return <Circle className="size-4 shrink-0 text-mist" />;
}

interface ShotCardProps {
  episodeId: string;
  shot: Shot;
  /** Frame the keyframes were generated in. */
  aspect: Format;
  frame?: string;
  /** Identity check of a library character on this frame (TaleStudio Characters). */
  check: { same: boolean; score: number; issues: string; character: string } | null;
  redrawing: boolean;
  editable: boolean;
  onSaved: () => Promise<void>;
  onRedraw: () => void;
  onError: (message: string) => void;
}

/** One storyboard shot: view, edit (before approval) and redraw just this frame. */
function ShotCard({ episodeId, shot, aspect, frame, check, redrawing, editable, onSaved, onRedraw, onError }: ShotCardProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/episodes/${episodeId}/shots/${shot.index}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caption: f.get("caption"), visual: f.get("visual"), camera: f.get("camera"), line: String(f.get("line") ?? "") || null }),
    });
    setSaving(false);
    if (!res.ok) return onError(errorMessage(t, await res.json().catch(() => null)));
    setEditing(false);
    await onSaved();
  }

  return (
    <li className={cn("overflow-hidden rounded-lg border bg-card", editing && "border-foreground sm:col-span-2 lg:col-span-3")}>
      <div className={cn("grid", editing && "md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]")}>
        <div className={cn("relative bg-muted", ASPECT[aspect])}>
          {frame ? <img src={frame} alt={shot.caption || shot.visual} className="size-full object-cover" /> : <Skeleton className="size-full rounded-none" />}
          {check && !check.same && (
            <span title={check.issues} className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-sm bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-white">
              <AlertTriangle className="size-3" />
              {fmt(t.production.identityMismatch, { name: check.character })}
            </span>
          )}
          {redrawing && <span className="absolute inset-0 grid place-items-center text-xs font-medium"><span className="inline-flex items-center gap-1.5 rounded-sm bg-background px-2 py-1"><Loader2 className="size-3 animate-spin" />{t.production.redrawing}</span></span>}
          <span className="absolute top-2 left-2 rounded-sm bg-background/90 px-1.5 py-0.5 font-mono text-[10px]">#{shot.index + 1}</span>
          {shot.line && <span className="absolute top-2 right-2 rounded-sm bg-background/90 p-1"><Mic className="size-3" /></span>}
        </div>
        {editing ? (
          <form onSubmit={save} className="grid gap-3 p-4">
            <div className="grid gap-1.5"><Label htmlFor={`c${shot.index}`}>{t.production.caption}</Label><Input id={`c${shot.index}`} name="caption" defaultValue={shot.caption} maxLength={500} /></div>
            <div className="grid gap-1.5"><Label htmlFor={`v${shot.index}`}>{t.production.visual}</Label><Textarea id={`v${shot.index}`} name="visual" defaultValue={shot.visual} rows={3} minLength={3} maxLength={1000} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor={`k${shot.index}`}>{t.production.camera}</Label><Input id={`k${shot.index}`} name="camera" defaultValue={shot.camera} maxLength={200} /></div>
              <div className="grid gap-1.5"><Label htmlFor={`l${shot.index}`}>{t.production.line}</Label><Input id={`l${shot.index}`} name="line" defaultValue={shot.line ?? ""} maxLength={300} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>{t.production.cancelEdit}</Button>
              <Button type="submit" variant="outline" size="sm" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{t.production.save}</Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-2 p-4 text-sm">
            <p className="line-clamp-3">{shot.caption || shot.visual}</p>
            {shot.line && <p className="text-muted-foreground italic">“{shot.line}”</p>}
            {editable && (
              <div className="mt-1 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> {t.production.edit}</Button>
                <Button variant="ghost" size="sm" disabled={redrawing} onClick={onRedraw}><RefreshCw /> {t.production.redraw}</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
