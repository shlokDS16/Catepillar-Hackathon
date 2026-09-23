import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { COMPLETE_LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locales";

type Messages = Record<string, unknown>;

async function loadMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}

/** Fills the gaps of a partial catalogue (Tamil in P0) with English, namespace by namespace. */
function withFallback(partial: Messages, base: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(partial)) {
    const baseValue = base[key];
    out[key] =
      value && typeof value === "object" && baseValue && typeof baseValue === "object"
        ? withFallback(value as Messages, baseValue as Messages)
        : value;
  }
  return out;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookie = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;

  let messages = await loadMessages(locale);
  if (!COMPLETE_LOCALES.has(locale)) {
    messages = withFallback(messages, await loadMessages(DEFAULT_LOCALE));
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] "${locale}" catalogue is partial; English fills the gaps (P1 item).`);
    }
  }

  return {
    locale,
    messages,
    timeZone: "Asia/Kolkata",
    // 24 h clock and Latin digits everywhere (visual-language §2.2).
    formats: {
      dateTime: { time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } },
      number: { inr: { style: "currency", currency: "INR", maximumFractionDigits: 0 } },
    },
  };
});
