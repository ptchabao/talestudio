import type { Dictionary, Locale } from "@/i18n/config";
import { SITE_NAME, siteUrl } from "@/lib/seo";
import { TOPUP } from "@talestudio/core";

/**
 * schema.org JSON-LD for search engines: who publishes the site, what the product is, and the FAQ.
 * Content mirrors what the page shows (Google requires structured data to match visible content).
 */
export function StructuredData({ t, locale }: { t: Dictionary; locale: Locale }) {
  const url = siteUrl();
  const graph = [
    { "@type": "Organization", "@id": `${url}/#organization`, name: SITE_NAME, url, logo: `${url}/brand/talestudio-logo-black.png`, image: `${url}/apple-icon` },
    { "@type": "WebSite", "@id": `${url}/#website`, name: SITE_NAME, url, inLanguage: locale, publisher: { "@id": `${url}/#organization` } },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: `${url}/${locale}`,
      description: t.meta.description,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      inLanguage: ["en", "fr"],
      publisher: { "@id": `${url}/#organization` },
      offers: { "@type": "Offer", price: String(TOPUP.minXof), priceCurrency: TOPUP.currency, description: t.pricing.subtitle },
    },
    { "@type": "FAQPage", inLanguage: locale, mainEntity: t.faq.items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  // "<" is escaped so the JSON can never close the script tag.
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
