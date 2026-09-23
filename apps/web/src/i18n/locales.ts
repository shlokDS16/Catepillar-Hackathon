/** Locales (spec M10): English and Hindi in full; Tamil proves the script switch (P1 catalogue). */
export const LOCALES = ["en", "hi", "ta"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie read by i18n/request.ts. No URL routing: the same URL re-renders in the new language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** Native-script names for the language sheet (A01); never translated. */
export const NATIVE_NAMES: Record<Locale, string> = { en: "English", hi: "हिन्दी", ta: "தமிழ்" };

/** Locales whose catalogue is complete; the others fall back to English with a warning. */
export const COMPLETE_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["en", "hi"]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
