import type { CSSProperties } from "react";
import { getLocale, getTranslations } from "next-intl/server";

type Style = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Stage 7 (landing v3 spec §5): the same shift in the real product. Three captured screens of the
 * deployed app on demo data, one role row each. Captures are plain `<img>`s (lazy, with explicit
 * size and alt text); nothing here is interactive beyond the role links, and nothing opens or
 * clicks the app. Desktop pins the section and lets the scroll bring one capture to the front;
 * phones read three blocks in flow, each with its role text above its capture.
 */

const ROLES = [
  { key: "op", href: "/op", file: "op", path: "/op", note: { left: 2.6, top: 4.2, width: 30.6, height: 11.6, at: "right" } },
  { key: "fm", href: "/fm", file: "fm", path: "/fm", note: { left: 2.6, top: 42, width: 30.4, height: 5.6, at: "below" } },
  { key: "au", href: "/fm/ledger", file: "ledger", path: "/fm/ledger", note: { left: 2.4, top: 55.6, width: 95.2, height: 14, at: "below" } },
] as const;

/** Locales whose captures were taken from a fully translated app screen (see the B report). */
const LOCALIZED_CAPTURES: ReadonlySet<string> = new Set();

export async function Proof() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const suffix = LOCALIZED_CAPTURES.has(locale) ? `-${locale}` : "";
  return (
    <section className="l-proof" id="proof" tabIndex={-1} data-stage="7" data-active="1" aria-labelledby="l-proof-h">
      <div className="l-proof-pin">
        <div className="l-proof-head">
          <h2 id="l-proof-h" className="l-h2 l-h2-paper">
            {t("s7.title")}
          </h2>
          <p className="l-lede">{t("s7.body")}</p>
        </div>
        <ul className="l-roles">
          {ROLES.map((r, i) => {
            const base = `/landing/proof-${r.file}`;
            return (
              <li key={r.key} data-role={i + 1}>
                <a className="l-role" href={r.href}>
                  <span className="l-who">{t(`s7.${r.key}.who`)}</span>
                  <span className="l-does">{t(`s7.${r.key}.does`)}</span>
                  <span className="l-go">{r.key === "op" ? t("cta") : t(`s7.${r.key}.go`)}</span>
                </a>
                <figure className="l-sheet" data-sheet={i + 1} style={{ "--i": i + 1 } as Style}>
                  <figcaption className="l-bar" data-chrome>
                    <span className="l-bar-path">{`${r.path} · ${t(`s7.${r.key}.who`)}`}</span>
                    <span className="l-bar-tag">{t("s7.bar")}</span>
                  </figcaption>
                  <div className="l-shotwrap">
                    <picture>
                      <source media="(max-width: 767px)" srcSet={`${base}-m${suffix}.avif`} type="image/avif" />
                      <source media="(max-width: 767px)" srcSet={`${base}-m${suffix}.webp`} type="image/webp" />
                      <source srcSet={`${base}${suffix}.avif`} type="image/avif" />
                      <source srcSet={`${base}${suffix}.webp`} type="image/webp" />
                      <img className="l-shot" src={`${base}${suffix}.webp`} alt={t(`s7.${r.key}.alt`)} width={1320} height={825} loading="lazy" decoding="async" />
                    </picture>
                    <span
                      className="l-note-box"
                      aria-hidden="true"
                      style={{ left: `${r.note.left}%`, top: `${r.note.top}%`, width: `${r.note.width}%`, height: `${r.note.height}%` }}
                    />
                    <span
                      className="l-note-tag"
                      aria-hidden="true"
                      data-at={r.note.at}
                      style={r.note.at === "right" ? { left: `${r.note.left + r.note.width}%`, top: `${r.note.top + r.note.height / 2}%` } : { left: `${r.note.left}%`, top: `${r.note.top + r.note.height}%` }}
                    >
                      {t(`s7.note.${r.key}`)}
                    </span>
                  </div>
                </figure>
              </li>
            );
          })}
        </ul>
        <p className="l-proof-cap">{t("s7.cap")}</p>
      </div>
    </section>
  );
}
