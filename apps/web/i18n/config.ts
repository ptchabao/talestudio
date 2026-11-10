import type { Dictionary } from "./en";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", fr: "Français" };

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "light";

export const LOCALE_COOKIE = "ts-locale";
/** Set by the proxy on /en and /fr so every server component renders that language, whatever the cookie says. */
export const LOCALE_HEADER = "x-ts-locale";
export const THEME_COOKIE = "ts-theme";

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);

/** "Hello {name}" + { name: "Ada" } → "Hello Ada". Kept as plain strings so dictionaries stay serialisable to client components. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type { Dictionary };
export type ErrorCode = keyof Dictionary["errors"];

/** Translate an API error body `{ code, params }` (see apps/web/lib/api.ts). Unknown codes fall back to a generic message. */
export function errorMessage(t: Dictionary, body: { code?: string; params?: Record<string, string | number> } | null | undefined): string {
  const code = body?.code;
  if (!code || !(code in t.errors)) return t.errors.generic;
  const params = { ...(body?.params ?? {}) };
  if (code === "invalid_input" && typeof params.fields === "string") {
    params.fields = params.fields
      .split(",")
      .filter(Boolean)
      .map((f) => t.fields[f as keyof Dictionary["fields"]] ?? f)
      .join(", ");
  }
  return fmt(t.errors[code as ErrorCode], params);
}

export function authErrorMessage(t: Dictionary, error: { code?: string } | null | undefined): string {
  const code = error?.code;
  return (code && t.authErrors[code as keyof Dictionary["authErrors"]]) || t.auth.genericError;
}
