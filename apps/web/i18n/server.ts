import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, DEFAULT_THEME, isLocale, isTheme, LOCALE_COOKIE, LOCALE_HEADER, LOCALES, THEME_COOKIE, type Locale, type Theme } from "./config";
import { en } from "./en";
import { fr } from "./fr";

const DICTIONARIES = { en, fr };

/** Language URL (/en, /fr) first, then the cookie, then the browser's Accept-Language, then English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const fromPath = (await headers()).get(LOCALE_HEADER);
  if (isLocale(fromPath)) return fromPath;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const lang = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
});

export const getTheme = cache(async (): Promise<Theme> => {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : DEFAULT_THEME;
});

export async function getDictionary() {
  return DICTIONARIES[await getLocale()];
}

export { LOCALES };
