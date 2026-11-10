import { PageHeader } from "@/components/dashboard/page-header";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { listCharacters } from "@/lib/characters";
import { requireWorkspace } from "@/lib/workspace";
import { can } from "@talestudio/core";
import { Badge } from "@talestudio/ui/badge";
import { Button } from "@talestudio/ui/button";
import { Lock, Plus, UserRound } from "lucide-react";
import Link from "next/link";

export async function generateMetadata() {
  return { title: (await getDictionary()).characters.title };
}

export default async function CharactersPage() {
  const [ws, t] = await Promise.all([requireWorkspace("project:read"), getDictionary()]);
  const characters = await listCharacters(ws.org.id);
  const c = t.characters;
  const canEdit = can(ws.role, "character:edit");
  return (
    <>
      <PageHeader title={c.title} description={c.subtitle} actions={canEdit && <Button asChild><Link href="/dashboard/characters/new"><Plus /> {c.new}</Link></Button>} />
      <div className="px-8 py-8">
        {characters.length === 0 ? (
          <div className="grid place-items-center rounded-lg bg-muted px-6 py-20 text-center">
            <UserRound className="size-6 text-steel" />
            <p className="mt-4 font-semibold">{c.empty}</p>
            <p className="mt-1 max-w-[420px] text-sm text-muted-foreground">{c.emptyBody}</p>
            {canEdit && <Button asChild className="mt-6"><Link href="/dashboard/characters/new"><Plus /> {c.new}</Link></Button>}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {characters.map((ch) => (
              <li key={ch.id}>
                <Link href={`/dashboard/characters/${ch.id}`} className="group block overflow-hidden rounded-lg border bg-card hover:border-foreground/40">
                  <div className="aspect-[3/4] bg-muted">
                    {ch.masterUrl ? <img src={ch.masterUrl} alt={ch.name} className="size-full object-cover" /> : <div className="grid size-full place-items-center"><UserRound className="size-8 text-steel" /></div>}
                  </div>
                  <div className="grid gap-1 p-4">
                    <p className="flex items-center gap-1.5 font-semibold">{ch.status === "locked" && <Lock className="size-3.5 text-steel" />}{ch.name}</p>
                    <p className="text-xs text-muted-foreground">{c.kinds[ch.kind]}{ch.version ? ` · v${ch.version}` : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant={ch.status === "locked" ? "default" : "secondary"}>{c.statuses[ch.status]}</Badge>
                      <Badge variant="outline">{fmt(c.refsCount, { n: ch.approved })}</Badge>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
