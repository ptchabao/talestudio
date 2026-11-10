import { PageHeader } from "@/components/dashboard/page-header";
import { ProductionLive } from "@/components/dashboard/production-live";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { getProductionView } from "@/lib/productions";
import { requireWorkspace } from "@/lib/workspace";
import { can, PLANS } from "@talestudio/core";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: PageProps<"/dashboard/projects/[id]/[episodeId]">) {
  const ws = await requireWorkspace();
  const v = await getProductionView(ws.org.id, (await params).episodeId);
  return { title: v?.title ?? "TaleStudio" };
}

export default async function ProductionPage({ params }: PageProps<"/dashboard/projects/[id]/[episodeId]">) {
  const { id, episodeId } = await params;
  const [ws, t] = await Promise.all([requireWorkspace("project:read"), getDictionary()]);
  const view = await getProductionView(ws.org.id, episodeId);
  if (!view || view.project.id !== id) notFound();
  const copy = t.studio[view.project.studio];
  return (
    <>
      <PageHeader
        back={{ href: `/dashboard/projects/${id}`, label: view.project.title }}
        title={`${fmt(copy.productionN, { n: view.number })} · ${view.title}`}
        description={
          view.kind === "clips"
            ? `${t.create.modeClips} · ${Math.floor((view.sourceDurationSec ?? 0) / 60)}:${String((view.sourceDurationSec ?? 0) % 60).padStart(2, "0")} · ${t.formats["9:16"]}`
            : `${view.durationSec}s · ${t.create.styles[view.style]} · ${view.formats.map((f) => t.formats[f]).join(", ")}`
        }
      />
      <ProductionLive
        initial={view}
        canProduceVideo={PLANS[ws.org.plan].canGenerateVideo}
        can={{ edit: can(ws.role, "production:edit"), approve: can(ws.role, "production:approve"), cancel: can(ws.role, "production:cancel") }}
      />
    </>
  );
}
