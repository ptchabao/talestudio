import { CharacterProfile } from "@/components/dashboard/character-profile";
import { PageHeader } from "@/components/dashboard/page-header";
import { getDictionary } from "@/i18n/server";
import { getCharacterView } from "@/lib/characters";
import { requireWorkspace } from "@/lib/workspace";
import { can } from "@talestudio/core";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: PageProps<"/dashboard/characters/[id]">) {
  const [ws, { id }] = await Promise.all([requireWorkspace("project:read"), params]);
  const view = await getCharacterView(ws.org.id, id);
  return { title: view?.name ?? (await getDictionary()).characters.title };
}

export default async function CharacterPage({ params }: PageProps<"/dashboard/characters/[id]">) {
  const [ws, t, { id }] = await Promise.all([requireWorkspace("project:read"), getDictionary(), params]);
  const view = await getCharacterView(ws.org.id, id);
  if (!view) notFound();
  return (
    <>
      <PageHeader back={{ href: "/dashboard/characters", label: t.characters.title }} title={view.name} description={`${t.characters.kinds[view.kind]} · ${t.characters.fictionalOnly}`} />
      <CharacterProfile initial={view} canEdit={can(ws.role, "character:edit")} />
    </>
  );
}
