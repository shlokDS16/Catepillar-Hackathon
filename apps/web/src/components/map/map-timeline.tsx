"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Pause, Play, Radio } from "lucide-react";
import { stepEvent, WINDOW_MS, type MapEvent, type MapModel } from "@/map/map-state";

type Props = {
  model: MapModel;
  /** The cursor, absolute ms inside the window. */
  t: number;
  atLive: boolean;
  playing: boolean;
  /** Reduced motion: no animated replay, the scrubber and event steps still work. */
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
 * The one time cursor: a native range input (so arrows, Home, End and Page keys work and a screen
 * reader announces it), event ticks on the track, earlier/later-event steps and Live. The live edge
 * is pinned by default; replay is a button, plays once and never loops.
 */
export function MapTimeline({ model, t, atLive, playing, reduced, onScrub, onLive, onPlay, onPause }: Props) {
  const tm = useTranslations("map");
  const ta = useTranslations("alerts");
  const span = model.endMs - model.startMs;
  const behind = model.endMs - t;
  const earlier = stepEvent(model.events, t, -1);
  const later = stepEvent(model.events, t, 1);
  const valueText = atLive ? tm("timeline.live") : tm("timeline.valueText", { m: Math.floor(behind / 60_000), s: Math.round((behind % 60_000) / 1000) });

  const jump = (e: MapEvent | null) => {
    if (e) onScrub(e.t_ms);
  };

  return (
    <section className="map-timeline" aria-label={tm("timeline.label")}>
      <div className="map-timeline-head">
        <h2 className="t-label">{tm("timeline.title", { min: WINDOW_MS / 60_000 })}</h2>
        <span className="map-cursor-stamp tnum" data-live={atLive || undefined} aria-hidden="true">
          {atLive ? tm("timeline.live") : behindLabel(behind)}
        </span>
      </div>

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
            <span key={e.id} className="map-tick" data-tier={e.tier} style={{ insetInlineStart: `${((e.t_ms - model.startMs) / span) * 100}%` }} />
          ))}
        </div>
      </div>

      <div className="map-timeline-controls">
        <button type="button" className="map-ctl" onClick={() => jump(earlier)} disabled={!earlier}>
          <ChevronLeft aria-hidden="true" />
          <span>{tm("timeline.earlier")}</span>
        </button>
        {reduced ? null : playing ? (
          <button type="button" className="map-ctl" onClick={onPause}>
            <Pause aria-hidden="true" />
            <span>{tm("timeline.pause")}</span>
          </button>
        ) : (
          <button type="button" className="map-ctl" onClick={onPlay}>
            <Play aria-hidden="true" />
            <span>{tm("timeline.replay")}</span>
          </button>
        )}
        <button type="button" className="map-ctl" onClick={onLive} disabled={atLive} data-primary={!atLive || undefined}>
          <Radio aria-hidden="true" />
          <span>{tm("timeline.liveButton")}</span>
        </button>
        <button type="button" className="map-ctl" onClick={() => jump(later)} disabled={!later}>
          <ChevronRight aria-hidden="true" />
          <span>{tm("timeline.later")}</span>
        </button>
      </div>

      <p className="map-event-line t-meta text-ink-2" aria-live="polite">
        {model.events.length === 0
          ? tm("timeline.noEvents")
          : (() => {
              const latest = [...model.events].filter((e) => e.t_ms <= t).sort((a, b) => b.t_ms - a.t_ms)[0];
              return latest
                ? tm("timeline.latest", { time: behindLabel(model.endMs - latest.t_ms), what: ta(`kind.${latest.kind}`) + (latest.machineCode ? ` · ${latest.machineCode}` : "") })
                : tm("timeline.noneYet");
            })()}
      </p>
    </section>
  );
}
