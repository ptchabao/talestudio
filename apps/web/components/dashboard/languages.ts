/** Dialogue languages offered at series creation (labels are endonyms, so they need no translation). */
export const DIALOGUE_LANGUAGES = [
  ["en", "English"],
  ["fr", "Français"],
  ["es", "Español"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["it", "Italiano"],
  ["ja", "日本語"],
] as const;

export const languageLabel = (code: string) => DIALOGUE_LANGUAGES.find(([c]) => c === code)?.[1] ?? code;
