import { Cta, SiteFooter } from "@/components/landing/cta";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { SiteHeader } from "@/components/landing/site-header";
import { StructuredData } from "@/components/landing/structured-data";
import { Studios } from "@/components/landing/studios";
import { getDictionary, getLocale } from "@/i18n/server";
import { getSession } from "@/lib/auth";

/** The landing page, shared by "/" (negotiated language) and "/en", "/fr" (one indexable URL per language). */
export async function LandingPage() {
  const [session, t, locale] = await Promise.all([getSession().catch(() => null), getDictionary(), getLocale()]);
  return (
    <>
      <StructuredData t={t} locale={locale} />
      <SiteHeader signedIn={Boolean(session)} />
      <main>
        <Hero />
        <Studios />
        <Features />
        <HowItWorks />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
