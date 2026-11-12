import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { DawnPoster } from "@/components/landing/dawn-poster";
import { LandingEngine } from "@/components/landing/landing-engine";
import { Chip } from "@/components/ui/chip";
import { Pictogram, type SignShape } from "@/components/ui/pictogram";
import { TAMPER_AT, buildLedgerDemo, groups } from "@/components/landing/ledger-demo";
import { WipeLink } from "@/components/landing/wipe-link";

type Style = CSSProperties & Record<`--${string}`, string | number>;

/**
 * A headline split into at most three lines, each inside an overflow mask so it can slide up on
 * its own (CSS only, driven by the block's --t). Words stay in one text flow for screen readers.
 */
function Lines({ text }: { text: string }) {
  const words = text.split(" ");
  const n = words.length <= 2 ? words.length : words.length <= 4 ? 2 : 3;
  const per = Math.ceil(words.length / n);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className="ln-w">
          <span className="ln">
            <span className="ln-i" style={{ "--i": i } as Style}>
              {l}
            </span>
          </span>
          {i < lines.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

/** "0N / 07" whose digit rolls from the previous stage's number as the block fades in. */
function Kicker({ n }: { n: number }) {
  return (
    <p className="l-kicker" aria-label={`0${n} / 07`}>
      <span aria-hidden="true">
        0
        <span className="roll">
          <span className="roll-col" style={{ "--n": n } as Style}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        </span>{" "}
        / 07
      </span>
    </p>
  );
}

/** The caption every stage carries (dossier §2). */
function Caption({ text }: { text: string }) {
  return <p className="l-caption">{text}</p>;
}

/** The still for a stage, shown when WebGL is off or motion is reduced (rendered from our own scene). */
function Poster({ n }: { n: 2 | 3 | 4 | 5 }) {
  return (
    <picture>
      <source srcSet={`/landing/poster-${n}.avif`} type="image/avif" />
      <source srcSet={`/landing/poster-${n}.webp`} type="image/webp" />
      <img className="l-poster-img" src={`/landing/poster-${n}.webp`} alt="" width={1440} height={900} loading="lazy" decoding="async" />
    </picture>
  );
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
  const { rows: ledger } = await buildLedgerDemo();
  return (
    <div className="landing" data-landing>
      <noscript>
        <style>{`.landing .stage{height:auto!important;min-height:100svh}.landing .pin{position:relative!important}.landing .rv{opacity:1!important;transform:none!important}.landing .ln-i{transform:none!important;animation:none!important}.landing .roll-col{transform:translateY(calc(var(--n)*-1*var(--lh)))!important}.landing .l-paper{transform:none!important}.landing .callout::before{transform:none!important}`}</style>
      </noscript>
      <header className="l-nav">
        <span className="l-brand">{t("brand")}</span>
        <LanguageChip />
      </header>

      <nav className="l-rail" aria-label={t("rail.label")}>
        <ol>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <li key={n}>
              <a href={`#stage-${n}`} data-rail={n} aria-label={t("rail.go", { n })}>
                <span aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main className="l-body">
      <div className="l-scene">
        <canvas className="l-canvas" aria-hidden="true" />
        <div className="l-grade" aria-hidden="true" />

        {/* 1 · Dawn over the bench */}
        <section className="stage" id="stage-1" data-stage="1" style={{ "--h": 400 } as Style}>
          <div className="pin">
            <DawnPoster className="l-poster" />
            <div className="l-shade" aria-hidden="true" />
            <div className="l-copy">
              <p className="l-kicker">{t("kicker")}</p>
              <h1 className="l-h1 rv rv-out">
                <Lines text={t("headline")} />
              </h1>
              <p className="l-sub rv rv-out">{t("sub")}</p>
              <div className="l-actions rv rv-out" data-inert-after="0.44">
                <WipeLink className="l-cta" href="/op" band={t("wipe.band")}>
                  <span>{t("cta")}</span>
                  <span className="l-arrow" aria-hidden="true">
                    →
                  </span>
                </WipeLink>
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
        <section className="stage" id="stage-2" data-stage="2" style={{ "--h": 200 } as Style}>
          <div className="pin">
            <Poster n={2} />
            <div className="l-copy l-copy-left rv rv-io" style={{ "--a": 0.2, "--b": 0.32 } as Style}>
              <Kicker n={2} />
              <h2 className="l-h2">
                <Lines text={t("s2.title")} />
              </h2>
              <p className="l-sub">{t("s2.body")}</p>
            </div>
            <svg className="l-leaders" aria-hidden="true" focusable="false">
              {[0, 1, 2].map((i) => (
                <g key={i} className="leader rv" data-leader={i} style={{ "--a": 0.3 + i * 0.2, "--b": 0.4 + i * 0.2 } as Style}>
                  <line />
                  <circle r="4" />
                </g>
              ))}
            </svg>
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
        <section className="stage" id="stage-3" data-stage="3" style={{ "--h": 250 } as Style}>
          <div className="pin">
            <Poster n={3} />
            <div className="l-copy l-copy-left rv rv-io" style={{ "--a": 0.08, "--b": 0.2 } as Style}>
              <Kicker n={3} />
              <h2 className="l-h2">
                <Lines text={t("s3.title")} />
              </h2>
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
        <section className="stage" id="stage-4" data-stage="4" style={{ "--h": 250 } as Style}>
          <div className="pin">
            <Poster n={4} />
            <div className="l-copy l-copy-left rv rv-io" style={{ "--a": 0.05, "--b": 0.17 } as Style}>
              <Kicker n={4} />
              <h2 className="l-h2">
                <Lines text={t("s4.title")} />
              </h2>
              <p className="l-sub">{t("s4.body")}</p>
              <ul className="l-legend">
              {RING_STATES.map((s) => (
                <li key={s.lv} className="lg" data-lv={s.lv}>
                  <Chip tone={s.tone} word icon={<Pictogram name="proximity" shape={s.shape} />}>
                    {te(s.tone)}
                  </Chip>
                </li>
              ))}
            </ul>
            </div>
            <Caption text={caption} />
          </div>
        </section>

        {/* 5 · Replay hand-off */}
        <section className="stage" id="stage-5" data-stage="5" style={{ "--h": 200 } as Style}>
          <div className="pin">
            <Poster n={5} />
            <div className="l-ink rv" style={{ "--a": 0.85, "--b": 1 } as Style} aria-hidden="true" />
            <div className="l-card rv rv-io" style={{ "--a": 0.08, "--b": 0.18, "--c": 0.85, "--d": 0.95 } as Style}>
              <Kicker n={5} />
              <h2 className="l-h2">
                <Lines text={t("s5.title")} />
              </h2>
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
      </div>

        {/* 6 · Tamper-evident ledger (DOM, light stage) */}
        <section className="stage stage-light" id="stage-6" data-stage="6" style={{ "--h": 180 } as Style}>
          <div className="pin">
            <div className="l-paper rv" style={{ "--a": 0, "--b": 0.14 } as Style}>
            <div className="l-ledger-wrap">
              <div className="l-copy-light rv rv-io" style={{ "--a": 0.1, "--b": 0.22, "--c": 0.94, "--d": 1 } as Style}>
                <Kicker n={6} />
                <h2 className="l-h2">
                <Lines text={t("s6.title")} />
              </h2>
                <p className="l-sub">{t("s6.body")}</p>
                <div className="l-status rv" style={{ "--a": 0.64, "--b": 0.76 } as Style}>
                  <span className="st-ok">
                    <Chip tone="clear" word icon={<Pictogram name="proximity" shape="circle" />}>
                      {t("s6.chainOk")}
                    </Chip>
                  </span>
                  <span className="st-bad">
                    <Chip tone="critical" word icon={<Pictogram name="proximity" shape="octagon" />}>
                      {t("s6.chainBroken", { n: TAMPER_AT })}
                    </Chip>
                  </span>
                </div>
              </div>
              <ol className="l-ledger">
                {ledger.map((r, i) => (
                  <li
                    key={r.seq}
                    className={`lrow rv${r.tampered ? " lrow-tamper" : ""}${r.seq > 4 ? " lrow-after" : ""}`}
                    style={{ "--a": 0.14 + i * 0.07, "--b": 0.24 + i * 0.07, "--k": 0.64 + Math.max(0, r.seq - 4) * 0.04, "--m": 0.76 + Math.max(0, r.seq - 4) * 0.04 } as Style}
                  >
                    <span className="lrow-n">{`${t("s6.row")} ${r.seq}`}</span>
                    <span className="lrow-type">{t(`s6.types.${r.type}`)}</span>
                    <span className="lrow-sev">{t("s6.sev", { n: r.severity })}</span>
                    <span className="lrow-hash">{groups(r.stored)}</span>
                    <span className="lrow-prev">
                      {t("s6.prev")} {groups(r.prev)}
                    </span>
                    {r.tampered ? <span className="lrow-flag">{t("s6.tamper", { n: TAMPER_AT })}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
            <Caption text={caption} />
            </div>
          </div>
        </section>

        {/* 7 · Close; the footer curtain follows */}
        <section className="stage stage-close" id="stage-7" data-stage="7">
          <div className="pin close-pin">
            <h2 className="l-h1 close-h">
              <Lines text={t("s7.title")} />
            </h2>
            <p className="l-sub">{t("s7.body")}</p>
            <WipeLink className="l-cta" href="/op" band={t("wipe.band")}>
              <span>{t("cta")}</span>
              <span className="l-arrow" aria-hidden="true">
                →
              </span>
            </WipeLink>
            <Caption text={caption} />
          </div>
        </section>
      </main>

      <footer className="l-foot">
        <p className="l-foot-brand">{t("brand")}</p>
        <nav className="l-foot-nav" aria-label={t("brand")}>
          <a href="/op">{t("cta")}</a>
          <a href="/fm">{t("ctaFleet")}</a>
        </nav>
        <p className="l-foot-note">{t("s7.foot")}</p>
      </footer>
      <LandingEngine />
    </div>
  );
}
