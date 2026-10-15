import { getTranslations } from "next-intl/server";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";

/**
 * The entry point. The first-launch flow (pairing, consent) will own this route later; until then
 * it must still carry a visitor into the product, because the bare URL is what a reviewer is
 * handed. Two labelled doors, with the language switch available before either.
 */
export default async function Home() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-6">
      <div className="flex items-center justify-between gap-4">
        <p className="t-label text-ink-2">{t("chrome.appName")}</p>
        <LanguageChip />
      </div>
      <Plate rule="heavy" className="max-w-hero flex flex-col gap-4">
        <p className="t-state">{t("enums.work.ready")}</p>
        <p className="t-body">{t("chrome.tagline")}</p>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary" href="/op">
            {t("start.openOperator")}
          </Button>
          <Button href="/fm">{t("start.openFleet")}</Button>
        </div>
      </Plate>
    </main>
  );
}
