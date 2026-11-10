import { getDictionary } from "@/i18n/server";

/** The block pipeline, drawn as a row of numbered blocks; step 4 (approval) is the gate. */
export async function HowItWorks() {
  const t = await getDictionary();
  return (
    <section id="how" className="border-y">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <h2 className="max-w-[720px] text-heading font-semibold">{t.how.title}</h2>
        <p className="mt-3 max-w-[640px] text-lg text-muted-foreground">{t.how.subtitle}</p>
        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {t.how.steps.map((s, i) => (
            <li key={s.title} className={`rounded-lg border p-5 ${i === 3 ? "border-foreground" : ""}`}>
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
