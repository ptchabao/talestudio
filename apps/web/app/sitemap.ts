import { LANGUAGE_URLS, siteUrl } from "@/lib/seo";
import type { MetadataRoute } from "next";

/** The indexable pages, each listing its language alternates (hreflang) so search engines serve the right one. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const languages = Object.fromEntries(Object.entries(LANGUAGE_URLS).map(([lang, path]) => [lang, `${base}${path === "/" ? "" : path}`]));
  return (["/", "/fr", "/en"] as const).map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.9,
    alternates: { languages },
  }));
}
