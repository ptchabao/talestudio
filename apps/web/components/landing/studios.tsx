import { getDictionary } from "@/i18n/server";
import { AVAILABLE_STUDIOS, STUDIOS } from "@talestudio/core";
import { BookOpen, Megaphone, Mic, Newspaper } from "lucide-react";
import Image from "next/image";

const ICONS = { story: BookOpen, advertising: Megaphone, podcast: Mic, journalism: Newspaper } as const;

/** Fog band: the four studios, uniform cards, no colour. */
export async function Studios() {
  const t = await getDictionary();
  return (
    <section id="studios" className="bg-muted">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <h2 className="max-w-[640px] text-heading font-semibold">{t.studios.title}</h2>
        <p className="mt-3 max-w-[640px] text-lg text-muted-foreground">{t.studios.subtitle}</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STUDIOS.map((id) => {
            const Icon = ICONS[id];
            const soon = !AVAILABLE_STUDIOS.includes(id);
            return (
              <div key={id} className="flex flex-col overflow-hidden rounded-lg bg-card">
                <div className="relative aspect-[4/3] bg-muted">
                  <Image src={`/landing/studio-${id}.jpg`} alt={t.studios.items[id].name} fill sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-steel" />
                  {soon && <span className="rounded-sm border px-2 py-0.5 text-xs text-muted-foreground">{t.studios.soon}</span>}
                </div>
                <h3 className="mt-4 text-xl font-semibold">{t.studios.items[id].name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.studios.items[id].body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
