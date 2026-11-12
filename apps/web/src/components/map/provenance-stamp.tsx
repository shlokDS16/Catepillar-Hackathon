"use client";

import { useTranslations } from "next-intl";
import { ageParts, type MachineAt, type MapProvenance } from "@/map/map-state";

type Translate = ReturnType<typeof useTranslations<"map">>;

/** "just now" / "12 s ago" / "3 min ago", translated. */
export function ageText(t: Translate, ageMs: number): string {
  const a = ageParts(ageMs);
  return a.kind === "now" ? t("age.now") : a.kind === "s" ? t("age.s", { n: a.n }) : t("age.min", { n: a.n });
}

type Props = { kind: MapProvenance; ageMs: number; stale: boolean; className?: string };

/**
 * Live / Replayed / Simulated plus how old the data is. Ink only: provenance is not a state, so it
 * never takes a safety colour. Replayed is dashed (a record, not a feed); a stale fix says "Stale".
 */
export function ProvenanceStamp({ kind, ageMs, stale, className }: Props) {
  const t = useTranslations("map");
  const age = ageText(t, ageMs);
  return (
    <span className={["map-prov", className].filter(Boolean).join(" ")} data-kind={kind} data-stale={stale || undefined}>
      <span className="map-prov-kind">{t(`prov.${kind}`)}</span>
      <span className="map-prov-age tnum">{stale ? `${t("stale")} · ${age}` : age}</span>
    </span>
  );
}

/** One spoken sentence for a machine: code, state, distance, provenance and age. Marker and row share it. */
export function machineSummary(t: Translate, m: MachineAt, ownCode: string | null): string {
  const parts: string[] = [m.tier === "own" ? t("you", { code: m.code === "—" ? (ownCode ?? m.code) : m.code }) : m.code];
  if (m.health !== "ok") parts.push(t(`health.${m.health}`));
  if (m.distanceM !== null) parts.push(t("away", { m: Math.round(m.distanceM) }));
  parts.push(t(`prov.${m.provenance}`));
  parts.push(m.stale ? `${t("stale")} ${ageText(t, m.ageMs)}` : ageText(t, m.ageMs));
  return parts.join(", ");
}
