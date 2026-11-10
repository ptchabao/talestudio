import { getDictionary } from "@/i18n/server";
import { Button } from "@talestudio/ui/button";
import { Check } from "lucide-react";
import Image from "next/image";

const FRAMES = ["/landing/hero-hook.jpg", "/landing/hero-product.jpg", "/landing/hero-cta.jpg"];

/** Asymmetric split: copy + email capture on the left, a product frame on the right. */
export async function Hero() {
  const t = await getDictionary();
  return (
    <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 pt-20 pb-20 lg:grid-cols-[1fr_1.05fr] lg:pt-28">
      <div>
        <h1 className="text-5xl leading-[1.05] font-semibold tracking-[-0.03em] md:text-display">{t.hero.title}</h1>
        <p className="mt-6 max-w-[540px] text-xl leading-[1.4] text-muted-foreground">{t.hero.subtitle}</p>
        <form action="/sign-up" className="mt-8 flex max-w-[480px] gap-2">
          <input
            type="email"
            name="email"
            placeholder={t.hero.emailPlaceholder}
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-4 text-base outline-none placeholder:text-steel focus-visible:ring-[3px] focus-visible:ring-ring"
          />
          <Button size="lg" type="submit">{t.hero.cta}</Button>
        </form>
      </div>

      {/* Product frame: a campaign storyboard awaiting approval. */}
      <div className="rounded-lg border bg-muted p-3">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{t.hero.frameTitle}</p>
            <span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">15s</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {t.hero.frameRows.map((row, i) => (
              <div key={row} className="grid gap-2">
                <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted">
                  <Image src={FRAMES[i]!} alt={row} fill sizes="(min-width: 1024px) 180px, 30vw" className="object-cover" priority={i === 0} />
                  <span className="absolute bottom-2 left-2 rounded-sm bg-background/90 px-1.5 py-0.5 font-mono text-[10px]">#{i + 1}</span>
                </div>
                <p className="text-xs text-muted-foreground">{row}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <div className="text-xs text-muted-foreground">
              {t.hero.frameFormats} · <span className="text-foreground">9:16 · 1:1 · 16:9</span>
            </div>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background"><Check className="size-3.5" />{t.hero.frameApprove}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
