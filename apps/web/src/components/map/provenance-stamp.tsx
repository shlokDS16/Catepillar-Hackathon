"use client";

import { useTranslations } from "next-intl";
import { ageParts, type MachineAt, type MapProvenance, type MapState } from "@/map/map-state";

type Translate = ReturnType<typeof useTranslations<"map">>;

/** "just now" / "12 s ago" / "3 min ago", translated. */
export function ageText(t: Translate, ageMs: number): string {
  const a = ageParts(ageMs);
  return a.kind === "now" ? t("age.now") : a.kind === "s" ? t("age.s", { n: a.n }) : t("age.min", { n: a.n });
}

/** The words of a stamp: Live, Simulated, or "Replayed · Simulated" (a record of made-up positions is still made up). */
export function provenanceWords(t: Translate, kind: MapProvenance, assumed: boolean): string {
  return kind === "replayed" && assumed ? `${t("prov.replayed")} · ${t("prov.simulated")}` : t(`prov.${kind}`);
}

/** "You · EXC-007" for my machine, the code for anyone else. The one place this is decided. */
export function machineName(t: Translate, m: Pick<MachineAt, "tier" | "code">): string {
  if (m.tier !== "own") return m.code;
  return m.code ? t("you", { code: m.code }) : t("youOnly");
}

/** What is worth saying on the map beside a machine's code: stale, or what is wrong and how far. Nothing else. */
export function exceptionLines(t: Translate, m: MachineAt): string[] {
  const out: string[] = [];
  if (m.stale) out.push(`${t("stale")} · ${ageText(t, m.ageMs)}`);
  if (m.tier !== "own" && m.health !== "ok") out.push(m.distanceM !== null ? `${t(`health.${m.health}`)} · ${t("awayShort", { m: Math.round(m.distanceM) })}` : t(`health.${m.health}`));
  else if (m.tier === "hazard" && m.distanceM !== null) out.push(t("away", { m: Math.round(m.distanceM) }));
  return out;
}

type Props = { kind: MapProvenance; ageMs: number; stale: boolean; assumed: boolean; className?: string };

/**
 * Live / Replayed / Simulated plus how old the data is, for the machine list. Ink only: provenance
 * is not a state, so it never takes a safety colour. Replayed is dashed (a record, not a feed).
 */
export function ProvenanceStamp({ kind, ageMs, stale, assumed, className }: Props) {
  const t = useTranslations("map");
  const age = ageText(t, ageMs);
  return (
    <span className={["map-prov", className].filter(Boolean).join(" ")} data-kind={kind} data-stale={stale || undefined}>
      <span className="map-prov-kind">{provenanceWords(t, kind, assumed)}</span>
      <span className="map-prov-age tnum">{stale ? `${t("stale")} · ${age}` : age}</span>
    </span>
  );
}

/**
 * The map's one provenance stamp, top-left of the frame, in the mono voice of the Debrief theatre:
 * what kind of data this is and how fresh the newest machine report is.
 */
export function FrameStamp({ state }: { state: MapState }) {
  const t = useTranslations("map");
  const kind: MapProvenance = state.atLive ? (state.me?.provenance ?? state.machines[0]?.provenance ?? "simulated") : "replayed";
  const assumed = state.me?.assumed ?? state.machines[0]?.assumed ?? true;
  const ages = [state.me?.ageMs, ...state.machines.map((m) => m.ageMs)].filter((n): n is number => typeof n === "number");
  const newest = ages.length > 0 ? Math.min(...ages) : null;
  return (
    <p className="map-frame-stamp" data-kind={kind}>
      <span>{provenanceWords(t, kind, assumed)}</span>
      {newest !== null ? <span className="tnum">{ageText(t, newest)}</span> : null}
    </p>
  );
}

/** One spoken sentence for a machine: name, state, distance, provenance and age. Marker and row share it. */
export function machineSummary(t: Translate, m: MachineAt): string {
  const parts: string[] = [machineName(t, m)];
  if (m.health !== "ok") parts.push(t(`health.${m.health}`));
  if (m.distanceM !== null) parts.push(t("away", { m: Math.round(m.distanceM) }));
  parts.push(provenanceWords(t, m.provenance, m.assumed));
  parts.push(m.stale ? `${t("stale")} ${ageText(t, m.ageMs)}` : ageText(t, m.ageMs));
  return parts.join(", ");
}
