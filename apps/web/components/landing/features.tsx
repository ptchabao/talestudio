import { getDictionary } from "@/i18n/server";

export async function Features() {
  const t = await getDictionary();
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-20">
      <h2 className="max-w-[720px] text-heading font-semibold">{t.features.title}</h2>
      <p className="mt-3 max-w-[640px] text-lg text-muted-foreground">{t.features.subtitle}</p>
      <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {t.features.items.map(({ title, body }) => (
          <div key={title} className="border-t pt-6">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
