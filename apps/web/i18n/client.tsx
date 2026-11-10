"use client";

import { createContext, useContext } from "react";
import type { Dictionary, Locale } from "./config";

const I18nContext = createContext<{ t: Dictionary; locale: Locale } | null>(null);

export function I18nProvider({ t, locale, children }: { t: Dictionary; locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ t, locale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
