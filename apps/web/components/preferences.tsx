"use client";

import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, THEME_COOKIE, type Locale } from "@/i18n/config";
import { Button } from "@talestudio/ui/button";
import { cn } from "@talestudio/ui/lib/utils";
import { Languages, Moon, Sun } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
};

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    setCookie(THEME_COOKIE, next ? "dark" : "light");
    setDark(next);
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={t.prefs.theme} title={dark ? t.prefs.light : t.prefs.dark} className={className}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function LocaleSwitch({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();

  function choose(l: Locale) {
    if (l === locale) return;
    setCookie(LOCALE_COOKIE, l);
    // On a language URL (/en, /fr) the URL decides the language: go to the other one.
    start(() => (LOCALES.some((x) => path === `/${x}`) ? router.push(`/${l}`) : router.refresh()));
  }

  return (
    <div role="group" aria-label={t.prefs.language} className={cn("inline-flex h-8 items-center gap-0.5 rounded-md border p-0.5", pending && "opacity-60", className)}>
      <Languages className="mx-1 size-3.5 text-muted-foreground" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={l === locale}
          title={LOCALE_LABELS[l]}
          className={cn("h-full rounded-sm px-2 text-xs font-medium uppercase text-muted-foreground transition-colors hover:text-foreground", l === locale && "bg-accent text-foreground")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Preferences({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <LocaleSwitch />
      <ThemeToggle />
    </div>
  );
}
