import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { DawnPoster } from "@/components/landing/dawn-poster";
import { LandingEngine } from "@/components/landing/landing-engine";
import { LandingFooter } from "@/components/landing/landing-footer";
import { TAMPER_AT, buildLedgerDemo, groups } from "@/components/landing/ledger-demo";
import { Proof } from "@/components/landing/proof";
import { Readout, settledValues, type RoLabels, type RoMsgs } from "@/components/landing/readout";
import { BANDS_VH, ENTRIES, LINES, S2 } from "@/components/landing/shift";
import { SETTLED_MINUTES, ShiftTape, TapeStrip, fill, fmtClock, tapeState, type TapeMsgs } from "@/components/landing/shift-tape";
import { WipeLink } from "@/components/landing/wipe-link";
import { Chip } from "@/components/ui/chip";
import { Pictogram, type SignShape } from "@/components/ui/pictogram";

type Style = CSSProperties & Record<`--${string}`, string | number>;

/**
 * A headline split into at most three lines, each inside an overflow mask so it can slide up on
 * its own (CSS only, driven by the stage's --p). Words stay in one text flow for screen readers.
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

/** A block that slides up inside its own mask at a stage boundary (same motion as a headline line). */
function Mask({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div className={`ln-b${className ? ` ${className}` : ""}`}>
      <div className="ln">
        <div className="ln-i" style={{ "--i": i } as Style}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The still for a stage: the WebGL-off, reduced-motion and phone picture, rendered from our own scene. */
function Poster({ n }: { n: 2 | 3 | 4 | 5 }) {
  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={`/landing/poster-${n}-m.avif`} type="image/avif" />
      <source media="(max-width: 767px)" srcSet={`/landing/poster-${n}-m.webp`} type="image/webp" />
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

/** Which stage's band a tape sentence belongs to, by minute (for the screen-reader sentence list). */
const bandOf = (minute: number) => (minute < 380 ? 1 : minute < 440 ? 2 : minute < 630 ? 3 : minute < 660 ? 4 : 5);

/**
 * Without script, or with reduced motion, the page is a stack of full-height stills: the pinned
 * view becomes static, each stage shows its poster, its words, its readout and a static tape strip.
 * The same rules live in landing.css behind prefers-reduced-motion; keep the two in step.
 */
const NOSCRIPT = `.landing .l-view{position:static!important;height:auto!important;margin:0!important;overflow:visible!important}.landing .l-band,.landing .l-hold,.landing .l-canvas,.landing .l-dim,.landing .l-tape,.landing .l-leaders,.landing .l-skip{display:none!important}.landing .l-st{position:relative!important;inset:auto!important;visibility:visible!important;min-height:100svh}.landing .l-tape-static{display:flex!important}.landing .l-ledger{margin-top:0!important;height:auto!important;--p:1}.landing .l-ledger-pin,.landing .l-proof-pin{position:relative!important;height:auto!important}.landing .l-proof{height:auto!important}.landing .ln-i{transform:none!important}.landing .rv{opacity:1!important;transform:none!important}.landing .callout::before{transform:none!important}.landing .lrow{opacity:1!important;transform:none!important}`;

export async function Landing() {
  const t = await getTranslations("landing");
  const te = await getTranslations("enums.safety");
  const { rows: ledger } = await buildLedgerDemo();
  const caption = t("caption");

  const tapeMsgs: TapeMsgs = {
    lines: t.raw("tape.lines") as Record<string, string>,
    entry: t.raw("tape.entry") as string,
    replay: t("tape.replay"),
    clock: t("tape.clock"),
  };
  const roMsgs: RoMsgs = {
    metres: t.raw("ro.metres") as string,
    held: t.raw("ro.held") as string,
    sent: t.raw("ro.sent") as string,
    online: t("ro.online"),
    written: t.raw("ro.written") as string,
    pending: t("ro.pending"),
    none: t("ro.none"),
    truck: t("ro.truck"),
    phases: t.raw("ro.phases") as RoMsgs["phases"],
    states: { clear: te("clear"), caution: te("caution"), warning: te("warning"), critical: te("critical") },
  };
  const roLabels: RoLabels = {
    sim: t("ro.sim"),
    simMark: t("tape.sim"),
    boom: t("ro.boom"),
    stick: t("ro.stick"),
    bucket: t("ro.bucket"),
    phase: t("ro.phase"),
    link: t("ro.link"),
    cycles: t("s3.cycles"),
    tonnes: t("s3.tonnes"),
    trail: t("ro.trail"),
    nearest: t("ro.nearest"),
    shownIn: t("ro.shownIn"),
    shownWhere: t("ro.shownWhere"),
    ledger: t("ro.ledger"),
  };
  const initial = tapeState(360, false, tapeMsgs);
  const tapeLabels = {
    label: t("tape.label"),
    clock: t("tape.clock"),
    sim: t("tape.sim"),
    goEntry: ENTRIES.map((e) => t("tape.goEntry", { time: fmtClock(e.at), event: t(`s6.types.${e.type}`) })),
    initial,
  };
  const strip = (n: 1 | 2 | 3 | 4 | 5) => <TapeStrip state={tapeState(SETTLED_MINUTES[n], false, tapeMsgs)} sim={t("tape.sim")} />;
  const bandHeights = (i: number) => ({ "--h": BANDS_VH.desk[i], "--hm": BANDS_VH.phone[i] }) as Style;
  /** One sentence per tape line of a band, as text, so a screen reader walks the shift without the tape. */
  const bandSentences = (n: number) =>
    LINES.filter(([m]) => bandOf(m) === n).map(([m, key, params]) => {
      const entry = ENTRIES.find((e) => e.at === m);
      return `${fmtClock(m)}. ${fill(tapeMsgs.lines[key] ?? key, params)}${entry ? ` ${fill(tapeMsgs.entry, { n: entry.n })}.` : ""}`;
    });
  const cta = (
    <WipeLink className="l-cta" href="/op" band={t("wipe.band")}>
      <span>{t("cta")}</span>
      <span className="l-arrow" aria-hidden="true">
        →
      </span>
    </WipeLink>
  );

  return (
    <div className="landing" data-landing data-st="1">
      <noscript>
        <style>{NOSCRIPT}</style>
      </noscript>
      <a className="l-skip" href="#proof" data-chrome>
        {t("skip")}
      </a>
      <header className="l-nav" data-chrome>
        <span className="l-brand">{t("brand")}</span>
        <LanguageChip />
      </header>
      <ShiftTape labels={tapeLabels} />

      <main className="l-body">
        <div className="l-scene">
          {/* One pinned view for stages 1-5: the canvas, one stage's words at a time, the tape stays fixed above. */}
          <div className="l-view">
            <canvas className="l-canvas" aria-hidden="true" />
            <div className="l-dim" aria-hidden="true" />

            {/* 1 · Dawn over the bench */}
            <div className="l-st" data-st="1">
              <DawnPoster className="l-poster" />
              <div className="l-scrim" aria-hidden="true" />
              <div className="l-copy">
                <p className="l-kicker">{t("kicker")}</p>
                <h1 className="l-h1">
                  <Lines text={t("headline")} />
                </h1>
                <p className="l-sub">{t("sub")}</p>
                <div className="l-actions">
                  {cta}
                  <a className="l-link" href="/fm">
                    {t("ctaFleet")}
                  </a>
                </div>
              </div>
              {strip(1)}
            </div>

            {/* 2 · The machine */}
            <div className="l-st" data-st="2">
              <Poster n={2} />
              <div className="l-scrim" aria-hidden="true" />
              <div className="l-copy">
                <h2 className="l-h2">
                  <Lines text={t("s2.title")} />
                </h2>
                <Mask i={3}>
                  <p className="l-sub">{t("s2.body")}</p>
                </Mask>
              </div>
              <Readout stage={2} labels={roLabels} msgs={roMsgs} values={settledValues(2, 0.9)} />
              <ul className="l-callouts">
                {(["c1", "c2", "c3"] as const).map((k, i) => (
                  <li key={k} className="callout rv" style={{ "--a": S2.callouts[i], "--b": S2.callouts[i] + 0.08 } as Style}>
                    <span className="callout-n">{`0${i + 1}`}</span>
                    <span className="callout-t">{t(`s2.${k}`)}</span>
                  </li>
                ))}
              </ul>
              <svg className="l-leaders" aria-hidden="true" focusable="false">
                {[0, 1, 2].map((i) => (
                  <g key={i} className="leader rv" data-leader={i} style={{ "--a": S2.callouts[i], "--b": S2.callouts[i] + 0.08 } as Style}>
                    <polyline />
                    <circle r="4" />
                  </g>
                ))}
              </svg>
              {strip(2)}
            </div>

            {/* 3 · The operator's trail */}
            <div className="l-st" data-st="3">
              <Poster n={3} />
              <div className="l-scrim" aria-hidden="true" />
              <div className="l-copy">
                <h2 className="l-h2">
                  <Lines text={t("s3.title")} />
                </h2>
                <Mask i={3}>
                  <p className="l-sub">{t("s3.body")}</p>
                </Mask>
              </div>
              <Readout stage={3} labels={roLabels} msgs={roMsgs} values={settledValues(3, 1)} />
              {strip(3)}
            </div>

            {/* 4 · Guardian rings */}
            <div className="l-st" data-st="4">
              <Poster n={4} />
              <div className="l-scrim" aria-hidden="true" />
              <div className="l-copy">
                <h2 className="l-h2">
                  <Lines text={t("s4.title")} />
                </h2>
                <Mask i={3}>
                  <p className="l-sub">{t("s4.body")}</p>
                </Mask>
                <Mask i={4}>
                  <ul className="l-legend">
                    {RING_STATES.map((s) => (
                      <li key={s.lv} className="lg" data-lv={s.lv}>
                        <Chip tone={s.tone} word icon={<Pictogram name="proximity" shape={s.shape} />}>
                          {te(s.tone)}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </Mask>
              </div>
              <Readout stage={4} labels={roLabels} msgs={roMsgs} values={settledValues(4, 0.62)} />
              <svg className="l-leaders" aria-hidden="true" focusable="false">
                <g className="leader" data-leader="truck">
                  <polyline />
                  <circle r="5" />
                </g>
              </svg>
              {strip(4)}
            </div>

            {/* 5 · Replay hand-off */}
            <div className="l-st" data-st="5">
              <Poster n={5} />
              <div className="l-scrim" aria-hidden="true" />
              <div className="l-card">
                <h2 className="l-h2">
                  <Lines text={t("s5.title")} />
                </h2>
                <Mask i={3}>
                  <p className="l-sub">{t("s5.body")}</p>
                </Mask>
                <div className="scrub">
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
              {strip(5)}
            </div>

            <p className="l-caption">{caption}</p>
          </div>

          {/* Bands: empty spacers that set the scroll length of each stage. They keep the anchors. */}
          {[1, 2, 3, 4, 5].map((n) => (
            <section key={n} className="l-band" id={`stage-${n}`} tabIndex={-1} data-stage={n} style={bandHeights(n - 1)}>
              <ol className="l-sr">
                {bandSentences(n).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          ))}
          <div className="l-hold" aria-hidden="true" />
        </div>

        {/* 6 · Tamper-evident ledger: a paper sheet that slides up over the held scene */}
        <section className="l-ledger" id="stage-6" tabIndex={-1} data-stage="6" aria-labelledby="l-ledger-h">
          <div className="l-ledger-pin">
            <div className="l-ledger-copy">
              <h2 id="l-ledger-h" className="l-h2 l-h2-paper">
                <Lines text={t("s6.title")} />
              </h2>
              <p className="l-lede">{t("s6.body")}</p>
              <div className="l-status">
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
            <ol className="l-ledger-rows">
              {ledger.map((r, i) => {
                const a = 0.04 + i * 0.045;
                const after = r.seq > TAMPER_AT;
                return (
                  <li
                    key={r.seq}
                    className={`lrow rv${r.tampered ? " lrow-tamper" : ""}${after ? " lrow-after" : ""}`}
                    style={{ "--a": a, "--b": a + 0.07, "--k": after ? 0.7 : 0.55, "--m": after ? 0.78 : 0.7 } as Style}
                  >
                    <span className="lrow-n">{`${t("s6.row")} ${r.seq}`}</span>
                    <time className="lrow-time">{fmtClock(r.at)}</time>
                    <span className="lrow-type">{t(`s6.types.${r.type}`)}</span>
                    <span className="lrow-sev">
                      {t("s6.sevLabel")}{" "}
                      {r.tampered ? (
                        <span className="sv">
                          <s className="sv-old">{r.honestSeverity}</s>
                          <b className="sv-new">{r.severity}</b>
                        </span>
                      ) : (
                        r.severity
                      )}
                    </span>
                    <span className="lrow-hash">{groups(r.stored)}</span>
                    <span className="lrow-prev">
                      {t("s6.prev")} {groups(r.prev)}
                    </span>
                    {r.tampered ? <span className="lrow-flag">{t("s6.tamper", { n: TAMPER_AT, from: r.honestSeverity, to: r.severity })}</span> : null}
                    {after ? <span className="lrow-flag lrow-flag-after">{t("s6.after", { n: TAMPER_AT })}</span> : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* 7 · The same shift, in the app */}
        <Proof />
      </main>

      <LandingFooter />
      <LandingEngine tape={tapeMsgs} ro={roMsgs} />
    </div>
  );
}
