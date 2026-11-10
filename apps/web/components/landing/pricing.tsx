import { Tariffs } from "@/components/tariffs";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { TOPUP, WELCOME_TOKENS } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";

export async function Pricing() {
  const t = await getDictionary();
  const points = [
    fmt(t.pricing.welcome, { n: WELCOME_TOKENS }),
    fmt(t.pricing.anyAmount, { min: TOPUP.minXof.toLocaleString("fr-FR") }),
    t.pricing.noSubscription,
    t.pricing.noExpiry,
    t.pricing.refunds,
    t.pricing.methods,
  ];
  return (
    <section id="pricing" className="bg-muted">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <h2 className="text-heading font-semibold">{t.pricing.title}</h2>
        <p className="mt-3 max-w-[640px] text-lg text-muted-foreground">{t.pricing.subtitle}</p>
        <div className="mt-12 grid gap-4 md:grid-cols-[1fr_1.3fr]">
          <div className="flex flex-col rounded-lg border bg-card p-8">
            <h3 className="text-xl font-semibold">{t.pricing.howTitle}</h3>
            <p className="mt-6 text-heading font-semibold">1 $ ≈ 100 TT</p>
            <p className="text-sm text-muted-foreground">{fmt(t.pricing.rate, { xof: TOPUP.xofPerToken })}</p>
            <ul className="mt-8 flex-1 space-y-3 text-sm">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0" />{p}</li>
              ))}
            </ul>
            <Button asChild className="mt-8 w-full"><Link href="/sign-up">{t.pricing.cta}</Link></Button>
          </div>
          <div className="rounded-lg border bg-card p-8">
            <h3 className="text-xl font-semibold">{t.tariffs.title}</h3>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">{t.tariffs.subtitle}</p>
            <Tariffs t={t} />
          </div>
        </div>
      </div>
    </section>
  );
}
