"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { factorRows, type FactorTag } from "@/task/task-state";
import type { Task } from "@/data/types";
import { SOURCE_MESSAGE_KEY } from "@/data/provenance";

/**
 * L4 "Why this estimate": one row per factor with its effect on the ETA ("Heat +22 %") and where the
 * input comes from. Core shows the two biggest; Detailed shows all. The chip text comes from the one
 * provenance registry: assumed and simulated get a chip, real open data names its source, organiser
 * fields (skill, machine age) carry nothing.
 */
export function FactorRows({ factors, detailed }: { factors: Task["eta_factors"]; detailed: boolean }) {
  const t = useTranslations("task.why");
  const tp = useTranslations("provenance");
  const rows = factorRows(factors, { all: detailed });

  return (
    <section className="flex flex-col gap-2" aria-label={t("title")}>
      <h2 className="t-title">{t("title")}</h2>
      {rows.length === 0 ? (
        <p className="t-body text-ink-2">{t("none")}</p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col">
          {rows.map((r) => (
            <li key={r.key} className="factor-row">
              <span className="t-label">{t.has(`group.${r.group}`) ? t(`group.${r.group}`) : r.group}</span>
              <span className="t-title tnum">{r.pct === 0 ? t("noChange") : t("pct", { sign: r.pct > 0 ? "+" : "−", pct: Math.abs(r.pct) })}</span>
              {r.value ? <span className="t-meta text-ink-2">{t.has(`value.${r.group}.${r.value}`) ? t(`value.${r.group}.${r.value}`) : r.value}</span> : null}
              <TagView tag={r.tag} label={(k) => tp(k)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TagView({ tag, label }: { tag: FactorTag; label: (k: "assumed" | "simulated" | "sourceWeather" | "sourceOpenMeteo") => string }) {
  if (tag.kind === "none") return null;
  if (tag.kind === "source") {
    const key = SOURCE_MESSAGE_KEY[tag.label] as "sourceWeather" | "sourceOpenMeteo" | undefined;
    return <span className="t-meta text-ink-3">{key ? label(key) : tag.label}</span>;
  }
  return <Chip tone="meta">{label(tag.kind)}</Chip>;
}
