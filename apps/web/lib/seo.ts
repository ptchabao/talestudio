import type { Dictionary, Locale } from "@/i18n/config";
import { LOCALES } from "@/i18n/config";
import type { Metadata } from "next";

export const SITE_NAME = "TaleStudio";

/** Absolute site origin, without trailing slash (canonical URLs, sitemap, structured data). */
export const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const OG_LOCALE: Record<Locale, string> = { en: "en_US", fr: "fr_FR" };

/** hreflang cluster: one URL per language, "/" negotiates the language for people and is the x-default. */
export const LANGUAGE_URLS = { en: "/en", fr: "/fr", "x-default": "/" } as const;

export type MarketingPath = "/" | `/${Locale}`;

/** Metadata of an indexable landing page: canonical, hreflang alternates, Open Graph and Twitter card. */
export function marketingMetadata(t: Dictionary, locale: Locale, path: MarketingPath): Metadata {
  return {
    title: { absolute: t.meta.title },
    description: t.meta.description,
    keywords: t.meta.keywords,
    alternates: { canonical: path, languages: LANGUAGE_URLS },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: path,
      title: t.meta.title,
      description: t.meta.description,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description },
  };
}

/** For app pages (dashboard, auth, invitations): never in search results. */
export const PRIVATE: Metadata = { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } };
