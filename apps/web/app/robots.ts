import { siteUrl } from "@/lib/seo";
import type { MetadataRoute } from "next";

/** Crawl the public site; keep the app, the API and invitation links out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/", "/invite/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
