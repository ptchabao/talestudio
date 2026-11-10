import { languageLabel } from "@/components/dashboard/languages";
import { NewProductionForm } from "@/components/dashboard/new-production-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { listCharacters } from "@/lib/characters";
import { requireWorkspace } from "@/lib/workspace";
import { defaultWorkflowFor, estimateContextFor, estimateWorkflow } from "@talestudio/blocks";
import { AD_DURATIONS, PLANS, type AdBrief, type Format, type Platform } from "@talestudio/core";
import { and, db, eq, schema, sql } from "@talestudio/db";
import { notFound } from "next/navigation";

export async function generateMetadata() {
  return { title: (await getDictionary()).sidebar.newProject };
}

export default async function NewProductionPage({ params }: PageProps<"/dashboard/projects/[id]/new">) {
  const { id } = await params;
  const [ws, t] = await Promise.all([requireWorkspace("production:create"), getDictionary()]);
  const project = /^[0-9a-f-]{36}$/i.test(id) ? await db.query.project.findFirst({ where: and(eq(schema.project.id, id), eq(schema.project.organizationId, ws.org.id)) }) : null;
  if (!project) notFound();
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`coalesce(max(${schema.episode.number}), 0)::int` }).from(schema.episode).where(eq(schema.episode.projectId, id));
  const plan = PLANS[ws.org.plan];
  const wf = defaultWorkflowFor(project.studio);
  const formats: Format[] = project.studio === "advertising" ? ((project.brief as AdBrief | null)?.formats ?? ["9:16"]) : ["16:9"];
  const durations = project.studio === "advertising" ? [...AD_DURATIONS] : Array.from({ length: plan.maxDurationSec / 15 }, (_, i) => (i + 1) * 15);
  const estimates = Object.fromEntries(
    durations.map((d) => {
      const e = estimateWorkflow(wf, estimateContextFor({ durationSec: d, formats }));
      return [d, { storyboard: e.credits.storyboard, production: e.credits.production }];
    }),
  );
  const copy = t.studio[project.studio];
  // Pre-select one platform per format the ad brief asked for; other studios default to YouTube (16:9).
  const byFormat: Record<Format, Platform> = { "9:16": "tiktok", "1:1": "instagram_feed", "16:9": "youtube" };
  const defaultPlatforms: Platform[] = project.studio === "advertising" ? formats.map((f) => byFormat[f]) : ["youtube"];

  return (
    <>
      <PageHeader back={{ href: `/dashboard/projects/${id}`, label: project.title }} title={fmt(t.create.title, { production: copy.production, n: n + 1 })} description={fmt(t.create.subtitle, { project: project.title })} />
      <div className="px-8 py-8">
        <NewProductionForm
          projectId={id}
          studio={project.studio}
          inherited={fmt(t.create.inherited, { style: t.create.styles[project.style], language: languageLabel(project.language) })}
          credits={ws.org.credits}
          maxDuration={plan.maxDurationSec}
          estimates={estimates}
          defaultPlatforms={defaultPlatforms}
          library={(await listCharacters(ws.org.id)).map(({ id: cid, name, status, masterUrl }) => ({ id: cid, name, status, masterUrl }))}
        />
      </div>
    </>
  );
}
