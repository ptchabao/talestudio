import { CharacterForm } from "@/components/dashboard/character-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getDictionary } from "@/i18n/server";
import { requireWorkspace } from "@/lib/workspace";

export async function generateMetadata() {
  return { title: (await getDictionary()).characters.new };
}

export default async function NewCharacterPage() {
  const [, t] = await Promise.all([requireWorkspace("character:edit"), getDictionary()]);
  return (
    <>
      <PageHeader back={{ href: "/dashboard/characters", label: t.characters.title }} title={t.characters.new} description={t.characters.fictionalOnly} />
      <div className="max-w-[860px] px-8 py-8">
        <CharacterForm />
      </div>
    </>
  );
}
