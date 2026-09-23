import { getTranslations } from "next-intl/server";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { Plate } from "@/components/ui/plate";

/** Placeholder until the shells land (F03): the first-launch flow will own this route. */
export default async function Home() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-6">
      <div className="flex items-center justify-between gap-4">
        <p className="t-label text-ink-2">{t("chrome.appName")}</p>
        <LanguageChip />
      </div>
      <Plate rule="heavy" className="max-w-hero">
        <p className="t-state">{t("enums.work.ready")}</p>
        <p className="t-body">{t("chrome.tagline")}</p>
      </Plate>
    </main>
  );
}
