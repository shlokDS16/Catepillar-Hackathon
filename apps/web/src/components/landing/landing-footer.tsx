import { getLocale, getTranslations } from "next-intl/server";
import { LangSwitch } from "@/components/landing/wipe-link";

/**
 * Dusk (landing v3 spec §5): a plate of contour lines from our own terrain function, the word
 * SPOTTER cut out of them (a clip path, so the same lines run brighter inside the letters), the
 * shift's trail in first light, and the closing "14:00" of the shift clock. The contour map is
 * `/landing/contours.svg#map` (generated from `terrain.ts`), pulled in with <use> and styled only
 * through custom properties set in landing.css. The wordmark stays Latin in every locale: it is a
 * logotype, and the h2 and the alt text carry the localized brand.
 */
export async function LandingFooter() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const other = locale === "hi" ? "en" : "hi";
  const wordStyle = { fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: "400px", letterSpacing: "8px" } as const;
  return (
    <footer className="l-foot" aria-labelledby="l-foot-h">
      <h2 id="l-foot-h" className="l-sr">
        {t("brand")}
      </h2>
      <div className="l-plate">
        <svg className="l-plate-svg" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" role="img" aria-label={t("foot.map")}>
          <defs>
            <clipPath id="l-word">
              <text x="720" y="438" textAnchor="middle" style={wordStyle}>
                SPOTTER
              </text>
            </clipPath>
          </defs>
          <use href="/landing/contours.svg#map" className="l-map-dim" transform="translate(0 -20) scale(2.4)" />
          <g clipPath="url(#l-word)">
            <rect width="1440" height="560" className="l-word-fill" />
            <use href="/landing/contours.svg#map" className="l-map-lit" transform="translate(0 -20) scale(2.4)" />
          </g>
          <text className="l-word-edge" x="720" y="438" textAnchor="middle" style={wordStyle}>
            SPOTTER
          </text>
          <use href="/landing/contours.svg#map" className="l-map-trail" transform="translate(0 -20) scale(2.4)" />
        </svg>
        <p className="l-plate-legend">
          <span>
            <i className="ct" />
            {t("foot.contours")}
          </span>
          <span className="opt">
            <i className="rd" />
            {t("foot.road")}
          </span>
          <span>
            <i />
            {t("foot.trail")}
          </span>
        </p>
        <div className="l-plate-close">
          <p className="l-plate-time">14:00</p>
          <p className="l-plate-line">{t("tape.lines.closed")}</p>
        </div>
      </div>
      <div className="l-cols">
        <nav aria-label={t("foot.product")}>
          <h3>{t("foot.product")}</h3>
          <ul>
            <li>
              <a href="/op">{t("foot.links.op")}</a>
            </li>
            <li>
              <a href="/fm">{t("foot.links.fm")}</a>
            </li>
            <li>
              <a href="/fm/ledger">{t("foot.links.ledger")}</a>
            </li>
            <li>
              <LangSwitch to={other} lang={other}>
                {t("foot.otherLang")}
              </LangSwitch>
            </li>
          </ul>
        </nav>
        <div>
          <h3>{t("foot.simTitle")}</h3>
          <p>{t("foot.sim")}</p>
        </div>
        <div>
          <h3>{t("foot.madeTitle")}</h3>
          <p>{t("foot.made")}</p>
          <p className="l-foot-note">{t("s7.foot")}</p>
        </div>
      </div>
    </footer>
  );
}
