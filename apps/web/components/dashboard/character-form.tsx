"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage } from "@/i18n/config";
import { CHARACTER_KINDS, STYLES, VOICE_KINDS, type CharacterInput } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Input, Label, Textarea } from "@talestudio/ui/input";
import { cn } from "@talestudio/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const select = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60";

/** Create (POST) or edit (PATCH) a character sheet. When the identity is locked only the backstory stays editable. */
export function CharacterForm({ id, initial, locked = false, readOnly = false, onSaved }: { id?: string; initial?: CharacterInput; locked?: boolean; readOnly?: boolean; onSaved?: () => void }) {
  const { t } = useI18n();
  const c = t.characters;
  const router = useRouter();
  const [kind, setKind] = useState<CharacterInput["kind"]>(initial?.kind ?? "story");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const frozen = locked || readOnly;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setNotice(null);
    const f = new FormData(e.currentTarget);
    const body = locked
      ? { backstory: f.get("backstory") }
      : { name: f.get("name"), kind, style: f.get("style"), appearance: f.get("appearance"), personality: f.get("personality"), backstory: f.get("backstory"), voiceKind: f.get("voiceKind"), voiceStyle: f.get("voiceStyle") };
    const res = await fetch(id ? `/api/characters/${id}` : "/api/characters", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) return setNotice({ ok: false, text: errorMessage(t, out) });
    if (!id) return router.push(`/dashboard/characters/${out.id}`);
    setNotice({ ok: true, text: c.saved });
    onSaved?.();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      {!id && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{c.kind}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHARACTER_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("flex flex-col items-start rounded-lg border p-4 text-left", kind === k ? "border-foreground" : "hover:bg-muted")}>
                <span className="text-sm font-semibold">{c.kinds[k]}</span>
                <span className="mt-1 text-xs text-muted-foreground">{c.kindHints[k]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="name">{c.name}</Label>
          <Input id="name" name="name" required minLength={1} maxLength={60} defaultValue={initial?.name} disabled={frozen} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="style">{c.style}</Label>
          <select id="style" name="style" defaultValue={initial?.style ?? "cinematic"} disabled={frozen} className={select}>
            {STYLES.map((s) => <option key={s} value={s}>{t.create.styles[s]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="appearance">{c.appearance}</Label>
        <p className="-mt-0.5 text-xs text-pewter">{c.appearanceHint}</p>
        <Textarea id="appearance" name="appearance" required minLength={10} maxLength={1200} rows={4} defaultValue={initial?.appearance} placeholder={c.appearancePlaceholder} disabled={frozen} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="personality">{c.personality}</Label>
        <Textarea id="personality" name="personality" maxLength={1200} rows={2} defaultValue={initial?.personality} placeholder={c.personalityPlaceholder} disabled={frozen} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="backstory">{c.backstory}</Label>
        <Textarea id="backstory" name="backstory" maxLength={3000} rows={3} defaultValue={initial?.backstory} placeholder={c.backstoryPlaceholder} disabled={readOnly} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="voiceKind">{c.voice}</Label>
          <select id="voiceKind" name="voiceKind" defaultValue={initial?.voiceKind ?? "narrator"} disabled={frozen} className={select}>
            {VOICE_KINDS.map((v) => <option key={v} value={v}>{c.voiceKinds[v]}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="voiceStyle">{c.voiceStyle}</Label>
          <Input id="voiceStyle" name="voiceStyle" maxLength={300} defaultValue={initial?.voiceStyle} placeholder={c.voiceStylePlaceholder} disabled={frozen} />
        </div>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{id ? c.save : c.create}</Button>
          {notice && <p role={notice.ok ? "status" : "alert"} className={cn("text-sm", notice.ok ? "text-muted-foreground" : "text-destructive")}>{notice.text}</p>}
        </div>
      )}
    </form>
  );
}
