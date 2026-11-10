import { NewProjectForm } from "@/components/dashboard/new-project-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getDictionary } from "@/i18n/server";
import { requireWorkspace } from "@/lib/workspace";
import { AVAILABLE_STUDIOS, type Studio } from "@talestudio/core";

export async function generateMetadata() {
  return { title: (await getDictionary()).newProject.title };
}

export default async function NewProjectPage({ searchParams }: PageProps<"/dashboard/projects/new">) {
  await requireWorkspace("project:create");
  const t = await getDictionary();
  const { studio } = await searchParams;
  const initial = AVAILABLE_STUDIOS.includes(studio as Studio) ? (studio as Studio) : "story";
  return (
    <>
      <PageHeader title={t.newProject.title} description={t.newProject.subtitle} back={{ href: "/dashboard", label: t.projects.back }} />
      <div className="px-8 py-8"><NewProjectForm initialStudio={initial} /></div>
    </>
  );
}
