import { LandingPage } from "@/components/landing/landing-page";
import { LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { marketingMetadata } from "@/lib/seo";

/** /en and /fr only; any other single segment is a 404. The proxy sets the language for these URLs. */
export const dynamicParams = false;
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export async function generateMetadata() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return marketingMetadata(t, locale, `/${locale}`);
}

export default LandingPage;
