"use client";

import { useTranslations } from "next-intl";
import { HeroCard, type HeroCardProps } from "@/components/hero/hero-card";

/**
 * The motion-lock view (interaction-map §6): the hero card at full screen inside the 8 px
 * ink/paper hazard stripe, one line, and nothing else. Every touch is ignored except SOS, which
 * sits above this layer (z 40 over 25). The connectivity chip stays in the strip above.
 */
export function MotionLock(props: HeroCardProps) {
  const t = useTranslations("hero");
  return (
    <div className="lock" role="region" aria-label={t("stopMachine")}>
      <div className="lock-frame">
        <HeroCard {...props} lock />
        <p className="t-title lock-line">{t("stopMachine")}</p>
      </div>
    </div>
  );
}
