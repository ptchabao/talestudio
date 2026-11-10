"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage, fmt } from "@/i18n/config";
import type { CharacterView } from "@/lib/characters";
import { TOKEN_COSTS } from "@talestudio/core";
import { Badge } from "@talestudio/ui/badge";
import { Button } from "@talestudio/ui/button";
import { Input, Textarea } from "@talestudio/ui/input";
import { cn } from "@talestudio/ui/lib/utils";
import { Check, Copy, Download, Loader2, Lock, LockOpen, Plus, Trash2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CharacterForm } from "./character-form";

type Ref = CharacterView["references"][number];

export function CharacterProfile({ initial, canEdit }: { initial: CharacterView; canEdit: boolean }) {
  const { t, locale } = useI18n();
  const c = t.characters;
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [extraKind, setExtraKind] = useState<"outfit" | "expression">("outfit");
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const locked = v.status === "locked";

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/characters/${v.id}`, { cache: "no-store" });
    if (res.ok) setV(await res.json());
  }, [v.id]);

  // Generations run in the background: poll while one is in progress.
  useEffect(() => {
    if (!v.busy) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [v.busy, refresh]);

  async function call(url: string, method = "POST", body?: unknown) {
    setBusy(true);
    setNotice(null);
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setNotice(errorMessage(t, out));
      return null;
    }
    await refresh();
    router.refresh();
    return out;
  }

  const generate = (kind: "candidates" | "pack" | "extra", extraInput?: { kind: "outfit" | "expression"; description: string }) => call(`/api/characters/${v.id}/generate`, "POST", { kind, extra: extraInput });
  const ref = (r: Ref, body: { approved?: boolean; master?: true }) => call(`/api/characters/${v.id}/references/${r.id}`, "PATCH", body);
  const candidates = v.references.filter((r) => r.kind === "candidate");
  const pack = v.references.filter((r) => r.kind === "angle" || r.kind === "expression");
  const outfits = v.references.filter((r) => r.kind === "outfit");
  const lastJob = v.jobs[0];

  return (
    <div className="grid gap-8 px-8 py-8 xl:grid-cols-[320px_1fr]">
      <aside className="grid content-start gap-4">
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="aspect-[3/4] bg-muted">{v.masterUrl ? <img src={v.masterUrl} alt={v.name} className="size-full object-cover" /> : <div className="grid size-full place-items-center text-center text-sm text-muted-foreground"><span><UserRound className="mx-auto mb-2 size-8 text-steel" />{c.needMaster}</span></div>}</div>
          <div className="grid gap-2 p-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={locked ? "default" : "secondary"}>{locked && <Lock />}{c.statuses[v.status]}</Badge>
              <Badge variant="outline">{c.kinds[v.kind]}</Badge>
              {v.version > 0 && <Badge variant="outline">v{v.version}</Badge>}
            </div>
            {locked && <p className="text-xs text-muted-foreground">{c.lockedHint}</p>}
          </div>
        </div>
        {canEdit && (
          <div className="grid gap-2">
            {locked ? (
              <Button variant="outline" disabled={busy} onClick={() => call(`/api/characters/${v.id}/lock`, "DELETE")}><LockOpen /> {c.unlock}</Button>
            ) : (
              <Button disabled={busy || !v.masterUrl} onClick={() => call(`/api/characters/${v.id}/lock`)}><Lock /> {c.lock}</Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={busy} onClick={async () => { const out = await call(`/api/characters/${v.id}/duplicate`); if (out?.id) router.push(`/dashboard/characters/${out.id}`); }}><Copy /> {c.duplicate}</Button>
              <Button variant="outline" asChild><a href={`/api/characters/${v.id}/export`}><Download /> {c.export}</a></Button>
            </div>
            <Button variant="ghost" className="text-destructive" disabled={busy} onClick={async () => { if (confirm(c.confirmDelete) && (await call(`/api/characters/${v.id}`, "DELETE"))) router.push("/dashboard/characters"); }}><Trash2 /> {c.deleteCharacter}</Button>
          </div>
        )}
      </aside>

      <div className="grid min-w-0 content-start gap-8">
        {notice && <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">{notice}</p>}
        {v.busy && <p role="status" className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm"><Loader2 className="size-4 animate-spin" />{c.generating}</p>}
        {!v.busy && lastJob?.status === "failed" && <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">{fmt(c.jobFailed, { error: lastJob.error ?? "" })}</p>}

        <Section title={c.sections.faces} hint={c.facesHint} action={canEdit && !locked && <Button size="sm" disabled={busy || v.busy} onClick={() => generate("candidates")}>{fmt(c.generateFaces, { n: TOKEN_COSTS.characterCandidates })}</Button>}>
          {candidates.length > 0 && (
            <RefGrid refs={candidates} render={(r) => canEdit && !locked && <Button size="sm" variant="outline" disabled={busy} onClick={() => ref(r, { master: true })}><Check /> {c.chooseMaster}</Button>} />
          )}
        </Section>

        <Section title={c.sections.pack} hint={c.packHint} action={canEdit && <Button size="sm" disabled={busy || v.busy || !v.masterUrl} onClick={() => generate("pack")}>{fmt(c.generatePack, { n: TOKEN_COSTS.identityPack })}</Button>}>
          {pack.length > 0 && <RefGrid refs={pack} render={(r) => canEdit && <RefActions r={r} busy={busy} onToggle={() => ref(r, { approved: !r.approved })} onDelete={() => call(`/api/characters/${v.id}/references/${r.id}`, "DELETE")} />} />}
        </Section>

        <Section title={c.sections.library}>
          {canEdit && (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await generate("extra", { kind: extraKind, description: extra })) setExtra("");
              }}
            >
              <select value={extraKind} onChange={(e) => setExtraKind(e.target.value as "outfit" | "expression")} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                <option value="outfit">{c.extraKinds.outfit}</option>
                <option value="expression">{c.extraKinds.expression}</option>
              </select>
              <Input value={extra} onChange={(e) => setExtra(e.target.value)} minLength={3} maxLength={300} required placeholder={c.extraPlaceholder} className="flex-1" />
              <Button type="submit" disabled={busy || v.busy || !v.masterUrl}><Plus /> {fmt(c.addExtra, { n: TOKEN_COSTS.characterExtra })}</Button>
            </form>
          )}
          {outfits.length > 0 && <RefGrid refs={outfits} render={(r) => canEdit && <RefActions r={r} busy={busy} onToggle={() => ref(r, { approved: !r.approved })} onDelete={() => call(`/api/characters/${v.id}/references/${r.id}`, "DELETE")} />} />}
        </Section>

        <Section title={c.sections.identity}>
          <CharacterForm id={v.id} initial={v} locked={locked} readOnly={!canEdit} onSaved={refresh} />
        </Section>

        <Section title={c.sections.memory} hint={c.memoryHint}>
          {canEdit && (
            <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); if (await call(`/api/characters/${v.id}/notes`, "POST", { text: note })) setNote(""); }}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} minLength={3} maxLength={1000} required placeholder={c.notePlaceholder} />
              <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={busy}><Plus /> {c.addNote}</Button>
            </form>
          )}
          {v.events.length === 0 ? <p className="text-sm text-muted-foreground">{c.noMemory}</p> : (
            <ol className="grid gap-2 text-sm">
              {v.events.map((e) => (
                <li key={e.id} className="rounded-lg border px-4 py-3">
                  <p>{e.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleDateString(locale)}{e.auto ? ` · ${c.auto}` : ""}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title={c.sections.versions}>
          {v.versions.length === 0 ? <p className="text-sm text-muted-foreground">{c.noVersions}</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {v.versions.map((ver) => (
                <li key={ver.version} className="flex gap-3 rounded-lg border p-3">
                  <div className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded bg-muted">{ver.masterUrl && <img src={ver.masterUrl} alt={`v${ver.version}`} className="size-full object-cover" />}</div>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">v{ver.version} · {ver.snapshot.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(ver.createdAt).toLocaleDateString(locale)} · {fmt(c.refsCount, { n: ver.snapshot.references })}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{ver.snapshot.appearance}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={c.sections.productions}>
          {v.productions.length === 0 ? <p className="text-sm text-muted-foreground">{c.noProductions}</p> : (
            <ul className="divide-y rounded-lg border text-sm">
              {v.productions.map((p) => (
                <li key={p.id}><Link href={`/dashboard/projects/${p.projectId}/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted"><span className="truncate">{p.project} · #{p.number} {p.title}</span><span className="text-xs text-muted-foreground">{t.status[p.status as keyof typeof t.status] ?? p.status}</span></Link></li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {hint && <p className="mt-1 max-w-[640px] text-sm text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RefGrid({ refs, render }: { refs: Ref[]; render: (r: Ref) => React.ReactNode }) {
  const { t } = useI18n();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {refs.map((r) => (
        <li key={r.id} className={cn("overflow-hidden rounded-lg border bg-card", !r.approved && r.kind !== "candidate" && "opacity-60")}>
          <div className="aspect-[3/4] bg-muted"><img src={r.url} alt={r.label} className="size-full object-cover" /></div>
          <div className="grid gap-2 p-2">
            <p className="line-clamp-2 text-xs">{r.label}</p>
            {r.check && <p className={cn("text-[11px]", r.check.same ? "text-success" : "text-destructive")} title={r.check.issues}>{fmt(t.characters.similarity, { score: Math.round(r.check.score * 100) })}</p>}
            {render(r)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RefActions({ r, busy, onToggle, onDelete }: { r: Ref; busy: boolean; onToggle: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant={r.approved ? "outline" : "default"} className="flex-1" disabled={busy} onClick={onToggle}>{r.approved ? <><X /> {t.characters.unapprove}</> : <><Check /> {t.characters.approve}</>}</Button>
      <Button size="sm" variant="ghost" aria-label={t.characters.delete} disabled={busy} onClick={onDelete}><Trash2 /></Button>
    </div>
  );
}
