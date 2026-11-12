import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { DawnPoster } from "@/components/landing/dawn-poster";
import { LandingEngine } from "@/components/landing/landing-engine";
import { Chip } from "@/components/ui/chip";
import { Pictogram, type SignShape } from "@/components/ui/pictogram";

type Style = CSSProperties & Record<`--${string}`, string | number>;

/** The caption every stage carries (dossier §2). */
function Caption({ text }: { text: string }) {
  return <p className="l-caption">{text}</p>;
}

const RING_STATES: Array<{ lv: number; tone: "clear" | "caution" | "warning" | "critical"; shape: SignShape }> = [
  { lv: 1, tone: "clear", shape: "circle" },
  { lv: 2, tone: "caution", shape: "triangle" },
  { lv: 3, tone: "warning", shape: "triangle" },
  { lv: 4, tone: "critical", shape: "octagon" },
];

/**
 * The landing page, server-rendered. Stage 1 (poster, headline, CTA) is the LCP and is fully
 * visible without script. Every scroll-driven element carries `.rv`; the client engine only sets
 * `--p` per stage, and CSS does the rest (dossier §1.2). Without script, or under reduced motion,
 * the page is a plain stack of full-height stages.
 */
export async function Landing() {
  const t = await getTranslations("landing");
  const te = await getTranslations("enums.safety");
  const caption = t("caption");
  return (
    <div className="landing" data-landing>
      <noscript>
        <style>{`.landing .stage{height:auto!important;min-height:100svh}.landing .pin{position:relative!important}.landing .rv{opacity:1!important;transform:none!important}.landing .callout::before{transform:none!important}`}</style>
      </noscript>
      <header className="l-nav">
        <span className="l-brand">{t("brand")}</span>
        <LanguageChip />
      </header>

      <main className="l-scene">
        <canvas className="l-canvas" aria-hidden="true" />

        {/* 1 · Dawn over the bench */}
        <section className="stage" data-stage="1" style={{ "--h": 400 } as Style}>
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
            <Caption text={caption} />
            <p className="l-hint" aria-hidden="true">
              {t("scrollHint")}
            </p>
          </div>
        </section>

        {/* 2 · The machine */}
        <section className="stage" data-stage="2" style={{ "--h": 200 } as Style}>
          <div className="pin">
            <div className="l-copy l-copy-left rv rv-io" style={{ "--a": 0.2, "--b": 0.32 } as Style}>
              <p className="l-kicker">02</p>
              <h2 className="l-h2">{t("s2.title")}</h2>
              <p className="l-sub">{t("s2.body")}</p>
            </div>
            <ul className="l-callouts">
              {(["c1", "c2", "c3"] as const).map((k, i) => (
                <li key={k} className="callout rv" style={{ "--a": 0.3 + i * 0.2, "--b": 0.4 + i * 0.2 } as Style}>
                  <span className="callout-n">{`0${i + 1}`}</span>
                  <span className="callout-t">{t(`s2.${k}`)}</span>
                </li>
              ))}
            </ul>
            <Caption text={caption} />
          </div>
        </section>

        {/* 3 · The operator's trail */}
        <section className="stage" data-stage="3" style={{ "--h": 250 } as Style}>
          <div className="pin">
            <div className="l-copy l-copy-left rv rv-io" style={{ "--a": 0.08, "--b": 0.2 } as Style}>
              <p className="l-kicker">03</p>
              <h2 className="l-h2">{t("s3.title")}</h2>
              <p className="l-sub">{t("s3.body")}</p>
              <dl className="l-stats">
                <div>
                  <dt>{t("s3.cycles")}</dt>
                  <dd className="l-num" data-count="14">
                    14
                  </dd>
                </div>
                <div>
                  <dt>{t("s3.tonnes")}</dt>
                  <dd className="l-num" data-count="620">
                    620
                  </dd>
                </div>
              </dl>
            </div>
            <Caption text={caption} />
          </div>
        </section>

        {/* 4 · Guardian rings */}
        <section className="stage" data-stage="4" style={{ "--h": 250 } as Style}>
          <div className="pin">
            <div className="l-copy l-copy-left rv rv-io" style={{ "--a": 0.05, "--b": 0.17 } as Style}>
              <p className="l-kicker">04</p>
              <h2 className="l-h2">{t("s4.title")}</h2>
              <p className="l-sub">{t("s4.body")}</p>
            </div>
            <ul className="l-legend rv rv-io" style={{ "--a": 0.12, "--b": 0.24 } as Style}>
              {RING_STATES.map((s) => (
                <li key={s.lv} className="lg" data-lv={s.lv}>
                  <Chip tone={s.tone} word icon={<Pictogram name="proximity" shape={s.shape} />}>
                    {te(s.tone)}
                  </Chip>
                </li>
              ))}
            </ul>
            <Caption text={caption} />
          </div>
        </section>

        {/* 5 · Replay hand-off */}
        <section className="stage" data-stage="5" style={{ "--h": 200 } as Style}>
          <div className="pin">
            <div className="l-card rv rv-io" style={{ "--a": 0.45, "--b": 0.6, "--c": 0.97, "--d": 1 } as Style}>
              <p className="l-kicker">05</p>
              <h2 className="l-h2">{t("s5.title")}</h2>
              <p className="l-sub">{t("s5.body")}</p>
              <div className="scrub rv" style={{ "--a": 0.05, "--b": 0.9 } as Style}>
                <div className="scrub-top">
                  <span>{t("s5.scrub")}</span>
                  <span>
                    {t("s5.from")} – {t("s5.to")}
                  </span>
                </div>
                <div className="scrub-track">
                  <span className="scrub-head" />
                </div>
              </div>
              <Chip tone="mandatory" word icon={<Pictogram name="vest" shape="circle" />}>
                {t("s5.card")}
              </Chip>
            </div>
            <Caption text={caption} />
          </div>
        </section>
      </main>
      <LandingEngine />
    </div>
  );
}
