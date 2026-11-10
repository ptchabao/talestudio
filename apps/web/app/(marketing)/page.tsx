import { LandingPage } from "@/components/landing/landing-page";
import { getDictionary, getLocale } from "@/i18n/server";
import { marketingMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return marketingMetadata(t, locale, "/");
}

export default LandingPage;
