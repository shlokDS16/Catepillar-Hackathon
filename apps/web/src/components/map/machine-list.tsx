"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { ProvenanceStamp } from "@/components/map/provenance-stamp";
import type { MachineAt, MachineTier } from "@/map/map-state";

type Props = {
  machines: MachineAt[];
  ownCode: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The hazard's tier word per machine id (live anomaly), for the filled state chip. */
  tierWord?: Record<string, "caution" | "warning" | "critical">;
};

const GROUPS: MachineTier[] = ["own", "hazard", "other"];

/**
 * The machines as a list, grouped by what matters: my own machine, hazards near me, everyone else.
 * It is the dependable path to a machine (a canvas tap is not): every row is an 80 px button with
 * the same provenance stamp the marker carries.
 */
export function MachineList({ machines, ownCode, selectedId, onSelect, tierWord = {} }: Props) {
  const t = useTranslations("map");
  return (
    <div className="map-list">
      {GROUPS.map((group) => {
        const rows = machines.filter((m) => m.tier === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} aria-label={t(`group.${group}`)} className="map-list-group">
            <h3 className="t-label text-ink-2">{t(`group.${group}`)}</h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {rows.map((m) => {
                const word = m.danger ? tierWord[m.id] : undefined;
                return (
                  <li key={m.id}>
                    <button type="button" className="map-row" data-tier={m.tier} data-stale={m.stale || undefined} aria-pressed={selectedId === m.id} onClick={() => onSelect(m.id)}>
                      <span className="map-row-main">
                        <span className="t-label">{m.tier === "own" ? t("you", { code: m.code === "—" ? (ownCode ?? m.code) : m.code }) : m.code}</span>
                        <span className="t-meta text-ink-2">
                          {m.health !== "ok" ? <b>{t(`health.${m.health}`)}</b> : null}
                          {m.health !== "ok" && m.distanceM !== null ? " · " : null}
                          {m.distanceM !== null ? <span className="tnum">{t("away", { m: Math.round(m.distanceM) })}</span> : null}
                          {m.health === "ok" && m.distanceM === null ? (m.moving ? t("moving") : t("parked")) : null}
                        </span>
                        <ProvenanceStamp kind={m.provenance} ageMs={m.ageMs} stale={m.stale} />
                      </span>
                      {word ? (
                        <Chip tone={word} word>
                          {t(`tier.${word}`)}
                        </Chip>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
