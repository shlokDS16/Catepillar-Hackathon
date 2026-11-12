"use client";

import { useEffect, useReducer, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { takeoverQueue } from "@/alerts/selectors";
import { useAppState } from "@/data/store";
import { useReducedMotion } from "@/replay/use-reenactment";
import { useDocumentHidden } from "@/replay/use-replay-timer";
import { Button } from "@/components/ui/button";
import { clockReduce, cueAt, startClock } from "@/lesson-diagrams/core";
import { diagramFor, type AnyDiagram } from "@/lesson-diagrams/registry";
import { BlindScene, CompareScene, RolloverScene } from "./scenes";

/** Draws one frame of a registered diagram; the labels come from the lesson.anim messages. */
function Frame({ entry, t }: { entry: AnyDiagram; t: number }) {
  const tr = useTranslations("lesson.anim");
  if (entry.kind === "rollover") return <RolloverScene f={entry.diagram.at(t)} labels={{ limit: tr("limit"), tilt: tr("tilt") }} />;
  if (entry.kind === "blindspot") return <BlindScene f={entry.diagram.at(t)} labels={{ ring: tr("swingRadius"), unseen: tr("notSeen") }} />;
  const f = entry.diagram.at(t);
  return (
    <div className="dg-pair">
      <Panel label={tr("beltOn")} mark="check">
        <CompareScene f={f} belted />
      </Panel>
      <Panel label={tr("beltOff")} mark="cross">
        <CompareScene f={f} belted={false} />
      </Panel>
    </div>
  );
}

function Panel({ label, mark, children }: { label: string; mark: "check" | "cross"; children: ReactNode }) {
  return (
    <figure className="dg-panel" data-mark={mark}>
      {children}
      <figcaption className="t-label dg-panel-label">{label}</figcaption>
    </figure>
  );
}

/**
 * A lesson animation: SVG driven by a requestAnimationFrame clock. Plays once on open, never
 * loops; Play/Pause/Replay and an 80 px scrubber (arrow keys step). Under reduced motion the
 * animation is replaced by three still frames with their captions. Captions follow the timeline.
 */
export function DiagramPlayer({ pictogram, title }: { pictogram: string; title: string }) {
  const entry = diagramFor(pictogram);
  const reduced = useReducedMotion();
  if (!entry) return null;
  return reduced ? <Stills entry={entry} title={title} /> : <Moving entry={entry} title={title} />;
}

function Moving({ entry, title }: { entry: AnyDiagram; title: string }) {
  const diagram = entry.diagram;
  const tr = useTranslations("lesson.anim");
  const [clock, dispatch] = useReducer((c: ReturnType<typeof startClock>, a: Parameters<typeof clockReduce>[1]) => clockReduce(c, a, diagram.duration), true, startClock);

  // A live Warning or Critical takes over the screen, and a hidden page stops the clock; it stays
  // paused until the operator presses Play (the same sources the Replay uses).
  const liveAlert = useAppState((st) => takeoverQueue(st.alerts).length > 0);
  const hidden = useDocumentHidden();
  if ((liveAlert || hidden) && clock.playing) dispatch({ type: "pause" });

  useEffect(() => {
    if (!clock.playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      dispatch({ type: "tick", dt: (now - last) / 1000 });
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [clock.playing]);

  const cue = cueAt(diagram.cues, clock.t);
  const caption = tr(cue.key);
  const pct = (clock.t / diagram.duration) * 100;
  return (
    <figure className="dg">
      <div className="dg-stage" role="img" aria-label={title}>
        <Frame entry={entry} t={clock.t} />
      </div>
      {/* one polite live region: the caption text changes only at a cue, never per frame */}
      <p className="dg-sr" aria-live="polite">
        {caption}
      </p>
      {/* every caption sits in one grid cell, so the box keeps the height of the longest and nothing jumps */}
      <figcaption className="t-body dg-caption" aria-hidden="true">
        {diagram.cues.map((c) => (
          <span key={c.key} data-on={c.key === cue.key}>
            {tr(c.key)}
          </span>
        ))}
      </figcaption>
      <div className="dg-controls">
        <Button variant="secondary" size="dense" onClick={() => dispatch({ type: "toggle" })} className="dg-play">
          {clock.playing ? tr("pause") : clock.ended ? tr("replay") : tr("play")}
        </Button>
        <input
          type="range"
          className="dg-scrub"
          min={0}
          max={Math.round(diagram.duration * 100)}
          step={1}
          value={Math.round(clock.t * 100)}
          style={{ "--p": `${pct}%` } as CSSProperties}
          aria-label={tr("scrubber")}
          aria-valuetext={tr("valueText", { t: Math.round(clock.t), total: Math.round(diagram.duration), caption })}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
            if (!dir) return;
            e.preventDefault(); // a native step of 0.01 s is too fine: move a quarter second
            dispatch({ type: "seek", t: clock.t + dir * 0.25 });
          }}
          onChange={(e) => dispatch({ type: "seek", t: Number(e.currentTarget.value) / 100 })}
        />
      </div>
    </figure>
  );
}

/** Reduced motion: three stepped frames, each with its caption. No clock, no motion. */
function Stills({ entry, title }: { entry: AnyDiagram; title: string }) {
  const diagram = entry.diagram;
  const tr = useTranslations("lesson.anim");
  return (
    <ol className="dg-stills" aria-label={title}>
      {diagram.stills.map((still, i) => (
        <li key={i} className="dg-still">
          <p className="t-caption dg-step">{tr("step", { n: i + 1, total: diagram.stills.length })}</p>
          <div className="dg-stage">
            <Frame entry={entry} t={still.t} />
          </div>
          <div className="t-body dg-still-caps">
            {still.keys.map((k) => (
              <p key={k}>{tr(k)}</p>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
