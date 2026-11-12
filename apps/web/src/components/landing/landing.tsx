import { getTranslations } from "next-intl/server";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { DawnPoster } from "@/components/landing/dawn-poster";
import { LandingEngine } from "@/components/landing/landing-engine";

/**
 * The landing page, server-rendered. Stage 1 (poster, headline, CTA) is the LCP and is fully
 * visible without script. Every scroll-driven element carries `.rv`; the client engine only sets
 * `--p` per stage, and CSS does the rest (dossier §1.2). Without script, or under reduced motion,
 * the page is a plain stack of full-height stages.
 */
export async function Landing() {
  const t = await getTranslations("landing");
  return (
    <div className="landing" data-landing>
      <noscript>
        <style>{`.landing .stage{height:auto!important;min-height:100svh}.landing .pin{position:relative!important}.landing .rv{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <header className="l-nav" data-surface="dark">
        <span className="l-brand">{t("brand")}</span>
        <LanguageChip />
      </header>

      <main className="l-scene">
        <section className="stage" data-stage="1" style={{ "--h": 400 } as React.CSSProperties}>
          <div className="pin">
            <DawnPoster className="l-poster" />
            <div className="l-shade" aria-hidden="true" />
            <div className="l-copy">
              <p className="l-kicker">{t("kicker")}</p>
              <h1 className="l-h1 rv rv-out">{t("headline")}</h1>
              <p className="l-sub rv rv-out">{t("sub")}</p>
              <div className="l-actions rv rv-out">
                <a className="l-cta" href="/op">
                  <span>{t("cta")}</span>
                  <span className="l-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
                <a className="l-link" href="/fm">
                  {t("ctaFleet")}
                </a>
              </div>
              <p className="l-b rv rv-in">{t("s1b")}</p>
            </div>
            <p className="l-caption">{t("caption")}</p>
            <p className="l-hint" aria-hidden="true">
              {t("scrollHint")}
            </p>
          </div>
        </section>
      </main>
      <LandingEngine />
    </div>
  );
}
