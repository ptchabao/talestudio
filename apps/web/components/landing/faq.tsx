import { getDictionary } from "@/i18n/server";
import { Plus } from "lucide-react";

export async function Faq() {
  const t = await getDictionary();
  return (
    <section id="faq" className="mx-auto grid max-w-[1200px] gap-12 px-6 py-20 lg:grid-cols-[1fr_2fr]">
      <h2 className="text-heading font-semibold">{t.faq.title}</h2>
      <div className="divide-y border-y">
        {t.faq.items.map(({ q, a }) => (
          <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
              {q}
              <Plus className="size-4 shrink-0 text-steel transition-transform group-open:rotate-45" />
            </summary>
            <p className="mt-3 max-w-[640px] text-base leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
