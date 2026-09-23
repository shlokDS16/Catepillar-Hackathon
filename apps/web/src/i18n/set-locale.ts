import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S, type Locale } from "./locales";

/** A01: the language lives in a cookie, so the same URL re-renders in under a second. */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`;
}
