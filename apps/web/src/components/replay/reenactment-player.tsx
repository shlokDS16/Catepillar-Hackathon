"use client";

import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { PlanFlag, SitePlanFrame } from "@/components/replay/evidence-site-plan";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { windArrowDeg, type MapSnapshotCard } from "@/replay/evidence";
import {
  buildReenactModel,
  clockLabel,
  scrubKey,
  stateAt,
  timeFromPointer,
  type ReenactModel,
} from "@/replay/reenact";
import { useReenactment } from "@/replay/use-reenactment";
import type { ReplayScenario } from "@cat/shared";

type Props = {
  scenario: ReplayScenario;
  /** A live alert (or the screen's pause): playback stops until the operator resumes. */
  paused: boolean;
};

/** The site plan this scenario's evidence carries: zones and the map centre. */
function planBase(scenario: ReplayScenario, model: ReenactModel) {
  const card = scenario.investigate.cards.find((c): c is MapSnapshotCard => c.type === "map_snapshot");
  const first = model.trail[0] ?? model.track[0];
  return {
    center: card?.center ?? (first ? { lat: first.lat, lon: first.lon } : { lat: 0, lon: 0 }),
    zones: card?.zones ?? [],
  };
}

/**
 * The re-enactment (T8): the same SitePlan frame the evidence card uses, with the trail drawing
 * itself, the machine marker turning with its heading, the wind arrow and the operator dot. Every
 * pixel and every readout is read from stateAt(model, t); this component owns no playback logic.
 */
export function ReenactmentPlayer({ scenario, paused }: Props) {
  const t = useTranslations("replay.debrief.player");
  const tp = useTranslations("provenance");
  const model = useMemo(() => buildReenactModel(scenario), [scenario]);
  const { center, zones } = useMemo(() => planBase(scenario, model), [scenario, model]);
  const points = useMemo(
    () => [...model.trail, ...model.track].map((p) => ({ lat: p.lat, lon: p.lon })),
    [model],
  );
  const flagAt = useMemo(() => {
    const at = stateAt(model, model.eventMs);
    return at.machine ?? at.operator;
  }, [model]);

  const player = useReenactment(model.durationMs, paused);
  const s = stateAt(model, player.t);
  const total = clockLabel(model.durationMs);
  const now = clockLabel(s.t);
  const responseS = scenario.reenactment.real_response_ms === null ? null : Math.round(scenario.reenactment.real_response_ms / 1000);

  const toggle = () => (player.playing ? player.pause() : player.play());

  return (
    <div className="deb-player">
      <p className="t-meta deb-cap">{t("caption")}</p>

      <div className="site-plan">
        <SitePlanFrame center={center} points={points} zones={zones} label={t("mapLabel")}>
          {({ toXY, path, u, box }) => {
            const machine = s.machine ? toXY(s.machine) : null;
            const operator = s.operator ? toXY(s.operator) : null;
            const wx = box.x + box.w - 3.2 * u;
            const wy = box.y + 3.2 * u;
            return (
              <>
                {s.trail.length > 1 ? <path d={path(s.trail)} className="plan-trail" /> : null}
                {s.machineTrail.length > 1 ? <path d={path(s.machineTrail)} className="plan-track" /> : null}
                {flagAt ? <PlanFlag at={toXY(flagAt)} u={u} passed={s.flagPassed} /> : null}
                {operator ? <circle cx={operator.x} cy={operator.y} r={u * 0.38} className="plan-me" /> : null}
                {machine && s.machine && model.track.length < 2 ? (
                  // One fix only: no direction was recorded, so no arrow, just the evidence card's square.
                  <rect x={machine.x - u / 2} y={machine.y - u / 2} width={u} height={u} className="plan-machine" />
                ) : null}
                {machine && s.machine && model.track.length >= 2 ? (
                  <g transform={`translate(${machine.x.toFixed(2)} ${machine.y.toFixed(2)}) rotate(${s.machine.heading_deg.toFixed(1)})`}>
                    <path
                      d={`M0 ${-u * 0.95} L${u * 0.62} ${u * 0.7} L0 ${u * 0.3} L${-u * 0.62} ${u * 0.7} Z`}
                      className="plan-machine"
                    />
                  </g>
                ) : null}
                {s.wind ? (
                  <g transform={`translate(${wx.toFixed(2)} ${wy.toFixed(2)})`} className="plan-wind">
                    <circle r={u * 1.5} className="plan-wind-ring" />
                    <g transform={`rotate(${windArrowDeg(s.wind.from_deg).toFixed(1)})`}>
                      <path d={`M0 ${u * 1.05} V${-u * 0.95} M${-u * 0.5} ${-u * 0.35} L0 ${-u * 1.05} L${u * 0.5} ${-u * 0.35}`} className="plan-wind-arrow" />
                    </g>
                  </g>
                ) : null}
              </>
            );
          }}
        </SitePlanFrame>
      </div>

      <dl className="deb-readouts" aria-label={t("readoutsLabel")}>
        <div>
          <dt className="t-caption">{t("time")}</dt>
          <dd className="t-label tnum">{t("timeValue", { now, total })}</dd>
        </div>
        <div>
          <dt className="t-caption">{t("speed")} <span className="deb-assumed">{tp("assumed")}</span></dt>
          <dd className="t-label tnum">{s.speed_kmh === null ? t("none") : t("speedValue", { v: s.speed_kmh.toFixed(1) })}</dd>
        </div>
        <div>
          <dt className="t-caption">{t("pitch")} <span className="deb-assumed">{tp("assumed")}</span></dt>
          <dd className="t-label tnum">{s.pitch_deg === null ? t("none") : t("pitchValue", { v: s.pitch_deg.toFixed(1) })}</dd>
        </div>
        <div>
          <dt className="t-caption">{t("seatbelt")}</dt>
          <dd className="t-label deb-belt" data-belt={s.seatbelt}>
            <Pictogram name="seatbelt" shape="none" />
            <span>{s.seatbelt === "unknown" ? t("none") : t(s.seatbelt === "on" ? "beltOn" : "beltOff")}</span>
          </dd>
        </div>
        <div>
          <dt className="t-caption">{t("wind")}</dt>
          <dd className="t-label tnum">
            {s.wind ? t("windValue", { kmh: Math.round(s.wind.kmh), deg: Math.round(s.wind.from_deg) }) : t("none")}
          </dd>
        </div>
      </dl>

      <Scrubber
        model={model}
        t={s.t}
        flagPassed={s.flagPassed}
        responsePassed={s.responsePassed}
        onSeek={player.seek}
        onToggle={toggle}
      />

      <ul className="deb-legend t-meta">
        <li>
          <FlagGlyph passed={s.flagPassed} />
          {t("legendEvent", { time: clockLabel(model.eventMs) })}
        </li>
        {responseS !== null ? (
          <li>
            <ClockGlyph passed={s.responsePassed} />
            {model.responseClamped ? t("legendResponseEnd", { s: responseS }) : t("legendResponse", { s: responseS })}
          </li>
        ) : null}
      </ul>

      <div className="deb-controls">
        <Button variant="primary" onClick={toggle}>
          {player.playing ? t("pause") : player.ended ? t("playAgain") : t("play")}
        </Button>
        <Button onClick={player.restart}>
          {t("restart")}
        </Button>
        <span className="deb-speed t-caption" aria-label={t("speedLabel")}>
          {t("tenX")}
        </span>
      </div>
      <p className="replay-announce" role="status">
        {player.ended ? t("ended") : ""}
      </p>
    </div>
  );
}

function FlagGlyph({ passed }: { passed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="deb-glyph" data-passed={passed} aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="21" />
      <path d="M6 4 L20 9 L6 14 Z" />
    </svg>
  );
}

function ClockGlyph({ passed }: { passed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="deb-glyph" data-passed={passed} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6 V12 L16 14" />
    </svg>
  );
}

/**
 * The scrubber: an 80 px hit target (the whole row, not just the rail) with the flag and the
 * stopwatch drawn on the timeline. Pointer drag and keys both seek, and a seek pauses playback.
 * Arrow keys step 1 s of sim time; Home and End jump; Space toggles play.
 */
function Scrubber({
  model,
  t,
  flagPassed,
  responsePassed,
  onSeek,
  onToggle,
}: {
  model: ReenactModel;
  t: number;
  flagPassed: boolean;
  responsePassed: boolean;
  onSeek: (ms: number) => void;
  onToggle: () => void;
}) {
  const tr = useTranslations("replay.debrief.player");
  const rail = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = rail.current?.getBoundingClientRect();
    if (r) onSeek(timeFromPointer(e.clientX, r.left, r.width, model.durationMs));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekFromPointer(e);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onToggle();
      return;
    }
    const next = scrubKey(e.key, t, model.durationMs);
    if (next === null) return;
    e.preventDefault();
    onSeek(next);
  };

  const pct = (ms: number) => `${((ms / model.durationMs) * 100).toFixed(3)}%`;
  return (
    <div
      className="deb-scrub"
      role="slider"
      tabIndex={0}
      aria-label={tr("scrubber")}
      aria-valuemin={0}
      aria-valuemax={model.durationMs}
      aria-valuenow={Math.round(t)}
      aria-valuetext={tr("timeValue", { now: clockLabel(t), total: clockLabel(model.durationMs) })}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="deb-rail" ref={rail}>
        <div className="deb-rail-fill" style={{ width: pct(t) }} />
        <span className="deb-mark" data-kind="flag" data-passed={flagPassed} style={{ left: pct(model.eventMs) }}>
          <FlagGlyph passed={flagPassed} />
        </span>
        {model.responseMs !== null ? (
          <span className="deb-mark" data-kind="clock" data-passed={responsePassed} style={{ left: pct(model.responseMs) }}>
            <ClockGlyph passed={responsePassed} />
          </span>
        ) : null}
        <span className="deb-thumb" style={{ left: pct(t) }} />
      </div>
    </div>
  );
}
