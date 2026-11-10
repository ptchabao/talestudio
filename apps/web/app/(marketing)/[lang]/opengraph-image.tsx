import { en } from "@/i18n/en";
import { fr } from "@/i18n/fr";
import { OG_SIZE, ogImage } from "@/lib/og-image";

export const alt = "TaleStudio — AI video production studio";
export const size = OG_SIZE;
export const contentType = "image/png";

/** One share card per language URL, so a /fr link shows French on WhatsApp, Facebook or X. */
export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return ogImage(lang === "fr" ? fr : en);
}
