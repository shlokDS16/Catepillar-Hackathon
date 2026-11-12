"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Flag, Pause, Play } from "lucide-react";
import type { MapEvent, MapModel } from "@/map/map-state";

type Props = {
  model: MapModel;
  /** The cursor, absolute ms inside the window. */
  t: number;
  atLive: boolean;
  playing: boolean;
  /** Reduced motion: no animated replay; the scrubber and the event flags still work. */
  reduced: boolean;
  onScrub: (t: number) => void;
  onLive: () => void;
  onPlay: () => void;
  onPause: () => void;
};

/** "−3:20": how far before the live edge the cursor is, in m:ss. */
export function behindLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `−${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The one time cursor, in a single 80 px row: Replay, the scrubber, and the Live stamp. The
 * scrubber is a native range input (arrows, Home, End and Page keys work and a screen reader
 * announces it); events are flags on the track and chips under it. The live edge is pinned by
 * default; replay is a button, plays once and never loops.
 */
export function MapTimeline({ model, t, atLive, playing, reduced, onScrub, onLive, onPlay, onPause }: Props) {
  const tm = useTranslations("map");
  const ta = useTranslations("alerts");
  const format = useFormatter();
  const span = model.endMs - model.startMs;
  const behind = model.endMs - t;
  const valueText = atLive ? tm("timeline.live") : tm("timeline.valueText", { m: Math.floor(behind / 60_000), s: Math.round((behind % 60_000) / 1000) });
  const clock = (ms: number) => format.dateTime(new Date(ms), "time");
  const eventName = (e: MapEvent) => ta(`kind.${e.kind}`) + (e.machineCode ? ` · ${e.machineCode}` : "");

  const latest = [...model.events].filter((e) => e.t_ms <= t).sort((a, b) => b.t_ms - a.t_ms)[0] ?? null;

  return (
    <section className="map-timeline" aria-label={tm("timeline.label")}>
      <div className="map-timeline-row">
        {reduced ? null : (
          <button type="button" className="map-ctl map-play" onClick={playing ? onPause : onPlay}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{playing ? tm("timeline.pause") : tm("timeline.replay")}</span>
          </button>
        )}

        <div className="map-scrub">
          <input
            type="range"
            className="map-range"
            min={0}
            max={Math.round(span / 1000)}
            step={1}
            value={Math.round((t - model.startMs) / 1000)}
            onChange={(e) => onScrub(model.startMs + Number(e.currentTarget.value) * 1000)}
            aria-label={tm("timeline.scrub")}
            aria-valuetext={valueText}
          />
          <div className="map-ticks" aria-hidden="true">
            {model.events.map((e) => (
              <span key={e.id} className="map-tick" data-tier={e.tier} style={{ insetInlineStart: `${((e.t_ms - model.startMs) / span) * 100}%` }}>
                <Flag />
              </span>
            ))}
          </div>
        </div>

        {atLive ? (
          <span className="map-live" data-live>
            <span className="map-live-dot" aria-hidden="true" />
            {tm("timeline.live")}
          </span>
        ) : (
          <button type="button" className="map-live" onClick={onLive}>
            <span className="tnum">{behindLabel(behind)}</span>
            <span>{tm("timeline.backToLive")}</span>
          </button>
        )}
      </div>

      {model.events.length > 0 ? (
        <ul className="map-flags" aria-label={tm("timeline.events")}>
          {[...model.events].sort((a, b) => a.t_ms - b.t_ms).map((e) => (
            <li key={e.id}>
              <button type="button" className="map-flag" data-current={latest?.id === e.id || undefined} onClick={() => onScrub(e.t_ms)}>
                <Flag aria-hidden="true" />
                <span className="tnum">{clock(e.t_ms)}</span>
                <span className="map-flag-name">{eventName(e)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sr-only">{tm("timeline.noEvents")}</p>
      )}

      {/* Spoken only when the newest event at the cursor changes, with its clock time: never a ticking value. */}
      <p className="sr-only" role="status" aria-live="polite">
        {latest ? tm("timeline.latest", { time: clock(latest.t_ms), what: eventName(latest) }) : ""}
      </p>
    </section>
  );
}
