"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { COMPLETE_LOCALES, LOCALES, NATIVE_NAMES, isLocale, type Locale } from "@/i18n/locales";
import { setLocaleCookie } from "@/i18n/set-locale";

/**
 * A01 Choose language. Three 96 px plates with native names; the choice goes to the cookie and
 * the same URL re-renders. The spoken name (which also unlocks audio) and the "tap to hear" hint
 * join with useAudio in F07.
 */
export function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useLocale();
  const t = useTranslations("start");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const partial = isLocale(current) && !COMPLETE_LOCALES.has(current) && t.has("partialCatalogue");

  function choose(locale: Locale) {
    if (locale === current) {
      onClose();
      return;
    }
    setLocaleCookie(locale);
    startTransition(() => {
      router.refresh();
      onClose();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("chooseLanguage")}>
      <ul className="grid list-none gap-4 p-0 sm:grid-cols-3" aria-busy={pending || undefined}>
        {LOCALES.map((locale) => (
          <li key={locale}>
            <button
              type="button"
              lang={locale}
              className="btn min-h-hit-lang w-full"
              data-variant={locale === current ? "primary" : "secondary"}
              aria-pressed={locale === current}
              onClick={() => choose(locale)}
            >
              <span className="btn-label t-title">{NATIVE_NAMES[locale]}</span>
            </button>
          </li>
        ))}
      </ul>
      {partial ? (
        <p className="mt-4 t-meta text-ink-2" role="status">
          {t("partialCatalogue")}
        </p>
      ) : null}
    </Sheet>
  );
}

/** The Language chip in the title row: opens the sheet. */
export function LanguageChip() {
  const [open, setOpen] = useState(false);
  const current = useLocale();
  const t = useTranslations("chrome");
  const name = isLocale(current) ? NATIVE_NAMES[current] : current;
  return (
    <>
      <Chip onClick={() => setOpen(true)} aria-label={t("languageNamed", { name })}>
        {name}
      </Chip>
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
