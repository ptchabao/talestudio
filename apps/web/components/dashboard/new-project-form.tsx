"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage } from "@/i18n/config";
import { AVAILABLE_STUDIOS, FORMATS, STUDIOS, STYLES, type Format, type Studio } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Input, Label, Select, Textarea } from "@talestudio/ui/input";
import { cn } from "@talestudio/ui/lib/utils";
import { BookOpen, Check, Loader2, Megaphone, Mic, Newspaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIALOGUE_LANGUAGES } from "./languages";

const ICONS = { story: BookOpen, advertising: Megaphone, podcast: Mic, journalism: Newspaper } as const;

export function NewProjectForm({ initialStudio = "story" }: { initialStudio?: Studio }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [studio, setStudio] = useState<Studio>(initialStudio);
  const [description, setDescription] = useState("");
  const [formats, setFormats] = useState<Format[]>(["9:16", "1:1", "16:9"]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ad = studio === "advertising";
  const podcast = studio === "podcast";
  const news = studio === "journalism";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const body = {
      studio,
      title: f.get("title"),
      description,
      style: f.get("style"),
      language: f.get("language"),
      brief: ad
        ? { brand: f.get("brand"), product: f.get("product"), audience: f.get("audience"), objective: f.get("objective"), tone: f.get("tone"), callToAction: f.get("callToAction"), formats }
        : podcast
          ? { format: f.get("podcastFormat"), hosts: f.get("hosts"), audience: f.get("audience") ?? "", tone: f.get("tone") ?? "" }
          : news
            ? { outlet: f.get("outlet"), format: f.get("newsFormat"), editorialLine: f.get("editorialLine") ?? "" }
            : undefined,
    };
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      setPending(false);
      return setError(errorMessage(t, data));
    }
    router.push(`/dashboard/projects/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-10">
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-semibold">{t.newProject.chooseStudio}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {STUDIOS.map((id) => {
            const Icon = ICONS[id];
            const available = AVAILABLE_STUDIOS.includes(id);
            return (
              <button
                key={id}
                type="button"
                disabled={!available}
                onClick={() => setStudio(id)}
                aria-pressed={studio === id}
                className={cn("relative flex flex-col items-start rounded-lg border p-5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", studio === id ? "border-foreground" : "hover:bg-muted")}
              >
                <Icon className="size-5 text-steel" />
                <span className="mt-6 font-semibold">{t.studios.items[id].name}</span>
                <span className="mt-1 text-sm text-muted-foreground">{t.studios.items[id].body}</span>
                {!available && <span className="absolute top-4 right-4 rounded-sm border px-2 py-0.5 text-xs text-muted-foreground">{t.studios.soon}</span>}
                {studio === id && <Check className="absolute top-4 right-4 size-4" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-6">
        <Field id="title" label={t.newProject.titleLabel}>
          <Input id="title" name="title" required minLength={2} maxLength={120} placeholder={ad ? t.newProject.adTitlePlaceholder : podcast ? t.newProject.showTitlePlaceholder : news ? t.newProject.newsTitlePlaceholder : t.newProject.storyTitlePlaceholder} />
        </Field>

        {ad && (
          <div className="grid gap-6 rounded-lg bg-muted p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="brand" label={t.newProject.brand}><Input id="brand" name="brand" required maxLength={120} placeholder="Bissap Fresh" /></Field>
              <Field id="objective" label={t.newProject.objective}>
                <Select id="objective" name="objective" defaultValue="awareness">
                  {(["awareness", "consideration", "conversion"] as const).map((o) => <option key={o} value={o}>{t.newProject.objectives[o]}</option>)}
                </Select>
              </Field>
            </div>
            <Field id="product" label={t.newProject.product}><Textarea id="product" name="product" required minLength={2} maxLength={500} rows={2} placeholder={t.newProject.productPlaceholder} /></Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="audience" label={t.newProject.audience}><Input id="audience" name="audience" required minLength={2} maxLength={300} placeholder={t.newProject.audiencePlaceholder} /></Field>
              <Field id="tone" label={t.newProject.tone}><Input id="tone" name="tone" maxLength={200} placeholder={t.newProject.tonePlaceholder} /></Field>
            </div>
            <Field id="callToAction" label={t.newProject.callToAction}><Input id="callToAction" name="callToAction" required minLength={2} maxLength={120} placeholder={t.newProject.callToActionPlaceholder} /></Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t.newProject.formats}</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => {
                  const on = formats.includes(f);
                  return (
                    <button key={f} type="button" aria-pressed={on} onClick={() => setFormats(on ? (formats.length > 1 ? formats.filter((x) => x !== f) : formats) : [...formats, f])} className={cn("inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm", on ? "border-foreground font-medium" : "text-muted-foreground")}>
                      {on && <Check className="size-3.5" />}
                      {t.formats[f]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}

        {podcast && (
          <div className="grid gap-6 rounded-lg bg-muted p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="podcastFormat" label={t.newProject.podcastFormat}>
                <Select id="podcastFormat" name="podcastFormat" defaultValue="interview">
                  {(["interview", "debate", "solo", "narrative"] as const).map((o) => <option key={o} value={o}>{t.newProject.podcastFormats[o]}</option>)}
                </Select>
              </Field>
              <Field id="tone" label={t.newProject.tone}><Input id="tone" name="tone" maxLength={200} placeholder={t.newProject.tonePlaceholder} /></Field>
            </div>
            <Field id="hosts" label={t.newProject.hosts}><Textarea id="hosts" name="hosts" required minLength={2} maxLength={500} rows={2} placeholder={t.newProject.hostsPlaceholder} /></Field>
            <Field id="audience" label={t.newProject.audience}><Input id="audience" name="audience" maxLength={300} placeholder={t.newProject.audiencePlaceholder} /></Field>
          </div>
        )}

        {news && (
          <div className="grid gap-6 rounded-lg bg-muted p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="outlet" label={t.newProject.outlet}><Input id="outlet" name="outlet" required maxLength={120} placeholder={t.newProject.outletPlaceholder} /></Field>
              <Field id="newsFormat" label={t.newProject.newsFormat}>
                <Select id="newsFormat" name="newsFormat" defaultValue="report">
                  {(["newscast", "report", "explainer"] as const).map((o) => <option key={o} value={o}>{t.newProject.newsFormats[o]}</option>)}
                </Select>
              </Field>
            </div>
            <Field id="editorialLine" label={t.newProject.editorialLine}><Input id="editorialLine" name="editorialLine" maxLength={500} placeholder={t.newProject.editorialLinePlaceholder} /></Field>
          </div>
        )}

        <Field
          id="description"
          label={ad ? t.newProject.context : podcast ? t.newProject.showAbout : news ? t.newProject.newsroomAbout : t.newProject.bible}
          hint={ad ? t.newProject.contextHint : podcast ? t.newProject.showAboutHint : news ? t.newProject.newsroomAboutHint : t.newProject.bibleHint}
        >
          <Textarea
            id="description"
            required
            minLength={10}
            maxLength={4000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={ad ? t.newProject.contextPlaceholder : podcast ? t.newProject.showAboutPlaceholder : news ? t.newProject.newsroomAboutPlaceholder : t.newProject.biblePlaceholder}
          />
          {studio === "story" && (
            <div className="flex flex-wrap gap-2">
              {t.newProject.ideas.map((idea) => (
                <button key={idea} type="button" onClick={() => setDescription(idea)} className="rounded-sm border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                  {idea.slice(0, 52)}…
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="style" label={t.create.style}>
            <Select id="style" name="style" defaultValue={studio === "story" ? "pixar-3d" : "cinematic"}>
              {STYLES.map((s) => <option key={s} value={s}>{t.create.styles[s]}</option>)}
            </Select>
          </Field>
          <Field id="language" label={t.create.language}>
            <Select id="language" name="language" defaultValue={locale}>
              {DIALOGUE_LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-pewter">{t.newProject.inheritNote}</p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {t.newProject.submit}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="-mt-1 text-xs text-pewter">{hint}</p>}
      {children}
    </div>
  );
}
