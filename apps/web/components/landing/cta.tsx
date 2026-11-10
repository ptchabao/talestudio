import { getDictionary } from "@/i18n/server";
import { Button } from "@talestudio/ui/button";
import Link from "next/link";
import { Logo } from "../logo";
import { Preferences } from "../preferences";

export async function Cta() {
  const t = await getDictionary();
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-20">
      <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-10 md:flex-row md:items-center">
        <div>
          <h2 className="text-heading font-semibold">{t.cta.title}</h2>
          <p className="mt-2 text-lg text-muted-foreground">{t.cta.subtitle}</p>
        </div>
        <Button asChild size="lg"><Link href="/sign-up">{t.cta.button}</Link></Button>
      </div>
    </section>
  );
}

/** Abyss footer: the dark bookend of the page. */
export async function SiteFooter() {
  const t = await getDictionary();
  const studios = ["story", "advertising", "podcast", "journalism"] as const;
  return (
    <footer className="bg-abyss text-white">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-4 text-sm text-mist">{t.footer.tagline}</p>
        </div>
        <FooterCol title={t.footer.columns.product} links={[["#pricing", t.footer.links.pricing], ["#how", t.footer.links.how], ["#faq", t.footer.links.faq], ["/sign-in", t.footer.links.signIn]]} />
        <FooterCol title={t.footer.columns.studios} links={studios.map((s) => ["#studios", t.studios.items[s].name] as [string, string])} />
        <FooterCol title={t.footer.columns.company} links={[["#", t.footer.links.about], ["mailto:hello@talestudio.app", t.footer.links.contact]]} />
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 border-t border-white/10 px-6 py-6 text-sm text-mist sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} TaleStudio. {t.footer.rights}</p>
        <div className="flex items-center gap-4">
          {/* Plain links so search engines discover each language version. */}
          <nav aria-label={t.prefs.language} className="flex gap-3">
            <a href="/fr" hrefLang="fr" lang="fr" className="hover:text-white">Français</a>
            <a href="/en" hrefLang="en" lang="en" className="hover:text-white">English</a>
          </nav>
          <Preferences className="[&_button]:text-mist" />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-4 space-y-2 text-sm text-mist">
        {links.map(([href, label]) => (
          <li key={label}><a href={href} className="hover:text-white">{label}</a></li>
        ))}
      </ul>
    </div>
  );
}
