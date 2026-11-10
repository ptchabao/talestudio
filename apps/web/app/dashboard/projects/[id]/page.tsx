import { languageLabel } from "@/components/dashboard/languages";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { getProjectView } from "@/lib/projects";
import { requireWorkspace } from "@/lib/workspace";
import { can, TERMINAL_STATUSES, type AdBrief, type NewsBrief, type PodcastBrief } from "@talestudio/core";
import type { Dictionary } from "@/i18n/config";
import { Button } from "@talestudio/ui/button";
import { Progress } from "@talestudio/ui/progress";
import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: PageProps<"/dashboard/projects/[id]">) {
  const ws = await requireWorkspace();
  const p = await getProjectView(ws.org.id, (await params).id).catch(() => null);
  return { title: p?.title ?? (await getDictionary()).projects.title };
}

export default async function ProjectPage({ params }: PageProps<"/dashboard/projects/[id]">) {
  const { id } = await params;
  const [ws, t] = await Promise.all([requireWorkspace("project:read"), getDictionary()]);
  const p = await getProjectView(ws.org.id, id).catch(() => null);
  if (!p) notFound();
  const copy = t.studio[p.studio];
  const canCreate = can(ws.role, "production:create");
  const newHref = `/dashboard/projects/${p.id}/new`;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard", label: t.projects.back }}
        title={p.title}
        description={`${t.studios.items[p.studio].name} · ${fmt(t.create.inherited, { style: t.create.styles[p.style], language: languageLabel(p.language) })}`}
        actions={canCreate && <Button asChild><Link href={newHref}><Plus /> {copy.newProduction}</Link></Button>}
      />
      <div className="grid gap-8 px-8 py-8 xl:grid-cols-[1fr_340px]">
        <section className="grid content-start gap-4">
          <p className="max-w-[640px] text-base text-muted-foreground">{p.description}</p>
          <h2 className="mt-4 text-lg font-semibold">{copy.productions}</h2>
          {p.episodes.length === 0 ? (
            canCreate ? (
              <Link href={newHref} className="grid place-items-center rounded-lg bg-muted px-6 py-14 text-center hover:bg-muted/70">
                <p className="font-semibold">{copy.first}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.firstBody}</p>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">{t.projects.none}</p>
            )
          ) : (
            <ol className="divide-y rounded-lg border">
              {p.episodes.map((e) => (
                <li key={e.id}>
                  <Link href={`/dashboard/projects/${p.id}/${e.id}`} className="flex items-center gap-4 p-3 pr-5 hover:bg-muted/60">
                    <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-[8px] bg-muted">
                      {e.cover && <img src={e.cover} alt="" className="size-full object-cover" />}
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className="text-xs text-muted-foreground">{fmt(copy.productionN, { n: e.number })} · {e.durationSec}s</p>
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="line-clamp-1 text-sm text-muted-foreground">{e.premise}</p>
                      {!TERMINAL_STATUSES.includes(e.status) && <Progress value={e.progress * 100} className="mt-1" />}
                    </div>
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="grid content-start gap-4">
          {p.brief && (
            <div className="rounded-lg bg-muted p-6">
              <h2 className="font-semibold">{t.projects.brief}</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                {briefRows(p.studio, p.brief, t)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-pewter">{k}</dt>
                      <dd className="mt-0.5">{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
          <div className="rounded-lg border p-6">
            <h2 className="font-semibold">{t.projects.cast}</h2>
            <div className="mt-4 grid gap-4">
              {p.cast.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.projects.castEmpty}</p>
              ) : (
                p.cast.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="size-12 shrink-0 overflow-hidden rounded-[8px] bg-muted">{c.imageUrl && <img src={c.imageUrl} alt={c.name} className="size-full object-cover" />}</div>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{c.name}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{c.bio || c.appearance}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

/** Label/value rows for each studio's brief. */
function briefRows(studio: string, brief: unknown, t: Dictionary): [string, string][] {
  const n = t.newProject;
  if (studio === "advertising") {
    const b = brief as AdBrief;
    return [[n.brand, b.brand], [n.product, b.product], [n.audience, b.audience], [n.objective, n.objectives[b.objective]], [n.tone, b.tone], [n.callToAction, b.callToAction], [n.formats, b.formats.map((f) => t.formats[f]).join(", ")]];
  }
  if (studio === "podcast") {
    const b = brief as PodcastBrief;
    return [[n.podcastFormat, n.podcastFormats[b.format]], [n.hosts, b.hosts], [n.audience, b.audience], [n.tone, b.tone]];
  }
  if (studio === "journalism") {
    const b = brief as NewsBrief;
    return [[n.outlet, b.outlet], [n.newsFormat, n.newsFormats[b.format]], [n.editorialLine, b.editorialLine]];
  }
  return [];
}
