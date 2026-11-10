import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { listProjects } from "@/lib/projects";
import { requireWorkspace } from "@/lib/workspace";
import { can } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";

export async function generateMetadata() {
  return { title: (await getDictionary()).projects.title };
}

export default async function ProjectsPage() {
  const [ws, t] = await Promise.all([requireWorkspace("project:read"), getDictionary()]);
  const projects = await listProjects(ws.org.id);
  const canCreate = can(ws.role, "project:create");

  return (
    <>
      <PageHeader
        title={t.projects.title}
        description={canCreate ? t.projects.subtitle : t.projects.readOnly}
        actions={canCreate && <Button asChild><Link href="/dashboard/projects/new"><Plus /> {t.sidebar.newProject}</Link></Button>}
      />
      <div className="px-8 py-8">
        {projects.length === 0 ? (
          <div className="grid place-items-center rounded-lg bg-muted px-6 py-20 text-center">
            <FolderOpen className="size-6 text-steel" />
            <h2 className="mt-4 text-lg font-semibold">{t.projects.emptyTitle}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t.projects.emptyBody}</p>
            {canCreate && <Button asChild className="mt-6"><Link href="/dashboard/projects/new">{t.projects.emptyCta}</Link></Button>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const copy = t.studio[p.studio];
              return (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/40">
                  <div className="relative aspect-video bg-muted">
                    {p.cover && <img src={p.cover} alt="" className="absolute inset-0 size-full object-cover" />}
                  </div>
                  <div className="grid gap-2 p-5">
                    <p className="text-xs font-medium text-muted-foreground">{t.studios.items[p.studio].name} · {copy.unit}</p>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-semibold">{p.title}</h3>
                      {p.latestStatus && <StatusBadge status={p.latestStatus} />}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                    <p className="text-xs text-pewter">{p.count === 0 ? t.projects.none : p.count === 1 ? copy.one : fmt(copy.many, { n: p.count })}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
