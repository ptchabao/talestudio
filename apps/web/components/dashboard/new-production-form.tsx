"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage, fmt } from "@/i18n/config";
import { AD_DURATIONS, formatsFor, TOKEN_COSTS, MAX_SOURCE_SEC, PLATFORM_IDS, PLATFORMS, type Platform, type Studio } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Input, Label, Textarea } from "@talestudio/ui/input";
import { cn } from "@talestudio/ui/lib/utils";
import { Clapperboard, Loader2, Lock, Scissors, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  projectId: string;
  studio: Studio;
  inherited: string;
  credits: number;
  maxDuration: number;
  /** Estimates per duration, computed on the server from the pinned workflow. */
  estimates: Record<number, { storyboard: number; production: number }>;
  /** Pre-selected platforms (from the ad brief's formats, or YouTube). */
  defaultPlatforms: Platform[];
  /** TaleStudio Characters library of the workspace. */
  library: { id: string; name: string; status: "draft" | "locked"; masterUrl: string | null }[];
}

export function NewProductionForm({ projectId, studio, inherited, credits, maxDuration, estimates, defaultPlatforms, library }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const ad = studio === "advertising";
  const podcast = studio === "podcast";
  const news = studio === "journalism";
  const copy = t.studio[studio];
  const [kind, setKind] = useState<"generated" | "clips">("generated");
  const [duration, setDuration] = useState(ad ? 15 : 60);
  const [premise, setPremise] = useState("");
  // Order matters: the first platform picked sets the generation frame.
  const [platforms, setPlatforms] = useState<Platform[]>(defaultPlatforms);
  const togglePlatform = (p: Platform) => setPlatforms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  const tooLong = platforms.find((p) => PLATFORMS[p].maxSec < duration);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const toggleCharacter = (id: string) => setCharacterIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 8 ? ids : [...ids, id]));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [upload, setUpload] = useState<{ name: string; key?: string; progress: number; durationSec?: number } | null>(null);
  const clips = podcast && kind === "clips";
  // Podcast to Clips is priced on the recording: transcription per started 10 min + highlight detection, then ~6 clips.
  const est = clips
    ? { storyboard: Math.max(1, Math.ceil((upload?.durationSec ?? 0) / 600)) * TOKEN_COSTS.transcriptionPer10Min + TOKEN_COSTS.highlights, production: 6 * TOKEN_COSTS.clip }
    : (estimates[duration] ?? { storyboard: TOKEN_COSTS.storyboardBase, production: 0 });
  const short = credits < est.storyboard;
  const uploading = Boolean(upload && !upload.key);

  /** Read the media duration locally, then PUT the file straight to storage with progress. */
  async function onFile(file: File) {
    setError(null);
    const durationSec = await new Promise<number>((resolve) => {
      const el = document.createElement(file.type.startsWith("video") ? "video" : "audio");
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(Math.round(el.duration));
      el.onerror = () => resolve(0);
      el.src = URL.createObjectURL(file);
    });
    if (!durationSec || durationSec > MAX_SOURCE_SEC) return setError({ message: errorMessage(t, { code: "invalid_input", params: { fields: "sourceKey" } }) });
    setUpload({ name: file.name, progress: 0, durationSec });
    const res = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size }) });
    const body = await res.json();
    if (!res.ok) {
      setUpload(null);
      return setError({ message: errorMessage(t, body), code: body.code });
    }
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", body.url);
      xhr.setRequestHeader("content-type", file.type);
      xhr.upload.onprogress = (e) => e.lengthComputable && setUpload((u) => u && { ...u, progress: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    }).then(
      () => setUpload((u) => u && { ...u, key: body.key, progress: 100 }),
      () => {
        setUpload(null);
        setError({ message: t.errors.generic });
      },
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/projects/${projectId}/productions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: f.get("title"),
        premise,
        durationSec: duration,
        kind: clips ? "clips" : "generated",
        sources: news ? f.get("sources") : undefined,
        sourceKey: clips ? upload?.key : undefined,
        sourceDurationSec: clips ? upload?.durationSec : undefined,
        platforms: clips ? undefined : platforms,
        characterIds: clips ? undefined : characterIds,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setPending(false);
      return setError({ message: errorMessage(t, body), code: body.code });
    }
    router.push(`/dashboard/projects/${projectId}/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-6">
        {podcast && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t.create.mode}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([["generated", Clapperboard, t.create.modeGenerated, t.create.modeGeneratedBody], ["clips", Scissors, t.create.modeClips, t.create.modeClipsBody]] as const).map(([id, Icon, title, body]) => (
                <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={cn("flex flex-col items-start rounded-lg border p-4 text-left", kind === id ? "border-foreground" : "hover:bg-muted")}>
                  <Icon className="size-4 text-steel" />
                  <span className="mt-3 text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 text-xs text-muted-foreground">{body}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-2">
          <Label htmlFor="title">{t.create.titleLabel}</Label>
          <Input id="title" name="title" required minLength={2} maxLength={120} placeholder={ad ? t.newProject.adTitlePlaceholder : t.create.titlePlaceholder} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="premise">{copy.premise}</Label>
          <Textarea id="premise" required minLength={10} maxLength={2000} rows={5} value={premise} onChange={(e) => setPremise(e.target.value)} placeholder={copy.premisePlaceholder} />
          {!ad && (
            <div className="flex flex-wrap gap-2">
              {t.create.ideas.map((idea) => (
                <button key={idea} type="button" onClick={() => setPremise(idea)} className="rounded-sm border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                  {idea.slice(0, 48)}…
                </button>
              ))}
            </div>
          )}
        </div>
        {news && (
          <div className="grid gap-2">
            <Label htmlFor="sources">{t.create.sources}</Label>
            <p className="-mt-1 text-xs text-pewter">{t.create.sourcesHint}</p>
            <Textarea id="sources" name="sources" required minLength={20} maxLength={20000} rows={8} placeholder={t.create.sourcesPlaceholder} className="font-mono text-xs" />
          </div>
        )}
        {clips ? (
          <div className="grid gap-2">
            <Label htmlFor="recording">{t.create.recording}</Label>
            <p className="-mt-1 text-xs text-pewter">{t.create.recordingHint}</p>
            <label htmlFor="recording" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input px-4 py-5 text-sm hover:bg-muted">
              <Upload className="size-4 text-steel" />
              <span className="min-w-0 flex-1 truncate">
                {!upload ? t.create.chooseFile : uploading ? fmt(t.create.uploading, { p: upload.progress }) : fmt(t.create.uploaded, { name: upload.name, duration: `${Math.floor((upload.durationSec ?? 0) / 60)}:${String((upload.durationSec ?? 0) % 60).padStart(2, "0")}` })}
              </span>
            </label>
            <input id="recording" type="file" accept="audio/*,video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            {uploading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground transition-[width]" style={{ width: `${upload!.progress}%` }} /></div>}
          </div>
        ) : (
        <div className="grid gap-2">
          <Label htmlFor="duration">{fmt(t.create.length, { n: duration })}</Label>
          {ad ? (
            <div role="radiogroup" className="flex gap-2">
              {AD_DURATIONS.filter((d) => d <= maxDuration).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={duration === d} onClick={() => setDuration(d)} className={cn("h-10 rounded-lg border px-4 text-sm", duration === d ? "border-foreground font-semibold" : "text-muted-foreground")}>
                  {d}s
                </button>
              ))}
            </div>
          ) : (
            <input id="duration" type="range" min={15} max={maxDuration} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="accent-[var(--foreground)]" />
          )}
        </div>
        )}
        {!clips && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t.create.platforms}</legend>
            <p className="text-xs text-pewter">{t.create.platformsHint}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {PLATFORM_IDS.map((p) => {
                const rank = platforms.indexOf(p);
                return (
                  <button key={p} type="button" aria-pressed={rank >= 0} onClick={() => togglePlatform(p)} className={cn("inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm", rank >= 0 ? "border-foreground font-medium" : "text-muted-foreground hover:bg-muted")}>
                    {rank === 0 && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
                    {t.platforms[p]}
                    <span className="font-mono text-[10px] text-pewter">{PLATFORMS[p].format}</span>
                  </button>
                );
              })}
            </div>
            {platforms.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatsFor(platforms).map((f) => t.formats[f]).join(" · ")}
                {tooLong && <span className="font-medium text-foreground"> — {fmt(t.create.platformTooLong, { platform: t.platforms[tooLong], n: PLATFORMS[tooLong].maxSec })}</span>}
              </p>
            )}
          </fieldset>
        )}
        {!clips && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t.create.characters}</legend>
            <p className="text-xs text-pewter">{library.length ? t.create.charactersHint : t.create.noCharacters}</p>
            {library.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {library.map((ch) => (
                  <button key={ch.id} type="button" aria-pressed={characterIds.includes(ch.id)} onClick={() => toggleCharacter(ch.id)} className={cn("inline-flex h-11 items-center gap-2 rounded-lg border pr-3 pl-1 text-sm", characterIds.includes(ch.id) ? "border-foreground font-medium" : "text-muted-foreground hover:bg-muted")}>
                    <span className="size-9 overflow-hidden rounded-md bg-muted">{ch.masterUrl && <img src={ch.masterUrl} alt="" className="size-full object-cover" />}</span>
                    {ch.name}
                    {ch.status === "locked" && <Lock className="size-3 text-steel" />}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        )}
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">{inherited}</span> — {t.create.continuity}</p>
      </div>

      <div className="grid content-start gap-4 rounded-lg border p-6">
        <Row label={t.create.storyboardNow} value={fmt(t.create.credits, { n: est.storyboard })} strong />
        <div>
          <Row label={t.create.productionLater} value={fmt(t.create.approx, { n: est.production })} />
          <p className="mt-1 text-xs text-pewter">{t.create.productionHint}</p>
        </div>
        <div className="border-t pt-4">
          <Row label={t.create.balance} value={fmt(t.create.credits, { n: credits })} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}{" "}
            {["insufficient_credits", "duration_limit"].includes(error.code ?? "") && <Link href="/dashboard/billing" className="underline">{t.create.getCredits}</Link>}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending || short || (clips && !upload?.key) || (!clips && platforms.length === 0)}>
          {pending && <Loader2 className="animate-spin" />}
          {short ? t.create.notEnough : clips ? t.create.analyse : news ? t.create.checkAndWrite : t.create.submit}
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", strong && "text-lg font-semibold")}>{value}</span>
    </div>
  );
}
