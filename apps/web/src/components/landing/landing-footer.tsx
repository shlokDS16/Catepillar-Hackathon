import { getLocale, getTranslations } from "next-intl/server";
import { LangSwitch } from "@/components/landing/wipe-link";

/**
 * Dusk (landing v3 spec §5). The plate is the word SPOTTER built as a hill out of the simulated quarry:
 * each letter a mesa with benches and contour lines, the excavator parked on the O, the shift's trail
 * traced across the letters (scene/wordmark.ts). The engine mounts it on a canvas when the footer nears
 * the viewport, drives it with the footer's scroll-in progress, and disposes it when it leaves.
 *
 * Stills stand in wherever the canvas does not run (spec §9): `wordmark-top` is the no-script picture
 * (the flat, straight-down view), `wordmark-3d` is the oblique one for phones, reduced motion and no
 * WebGL. The wordmark stays Latin in every locale (it is a logotype); the h2 and the alt text carry
 * the localized brand.
 */
function Still({ name, className }: { name: "wordmark-top" | "wordmark-3d"; className: string }) {
  return (
    <picture className={className}>
      <source media="(max-width: 767px)" srcSet={`/landing/${name}-m.webp`} type="image/webp" width={750} height={330} />
      <source media="(max-width: 767px)" srcSet={`/landing/${name}-m.avif`} type="image/avif" width={750} height={330} />
      <source srcSet={`/landing/${name}.webp`} type="image/webp" width={1440} height={600} />
      <source srcSet={`/landing/${name}.avif`} type="image/avif" width={1440} height={600} />
      <img src={`/landing/${name}.webp`} alt="" width={1440} height={600} loading="lazy" decoding="async" />
    </picture>
  );
}

export async function LandingFooter() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const other = locale === "hi" ? "en" : "hi";
  return (
    <footer className="l-foot" aria-labelledby="l-foot-h">
      <h2 id="l-foot-h" className="l-sr">
        {t("brand")}
      </h2>
      <div className="l-plate" role="img" aria-label={t("foot.map")}>
        <Still name="wordmark-top" className="l-wm-top" />
        <Still name="wordmark-3d" className="l-wm-3d" />
        <canvas className="l-wm-canvas" aria-hidden="true" />
        <p className="l-plate-legend" aria-hidden="true">
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
