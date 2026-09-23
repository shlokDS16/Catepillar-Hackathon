"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pictogram } from "@/components/ui/pictogram";
import { SOS_TICK_PATTERN, holdProgress, holdReducer, type HoldState } from "@/sos/hold";

type SosButtonProps = {
  /** An SOS is open: the plate reads "SOS ACTIVE" and a tap opens the sheet instead of arming. */
  active: boolean;
  onArmed: (requestId: string) => void;
  onOpen: () => void;
};

const HOLD_TICK_MS = 50;

/**
 * A10: hold 1.5 s to send (ticks at 0.5 and 1.0 s); release earlier sends nothing. Pointer and
 * keyboard (hold Space or Enter) share one reducer, which lives in a ref and is driven by the
 * handlers and one interval. The fill is the one allowed continuous motion; under reduced motion
 * it steps in quarters.
 */
export function SosButton({ active, onArmed, onOpen }: SosButtonProps) {
  const t = useTranslations("chrome");
  const [progress, setProgress] = useState(0);
  const hold = useRef<HoldState>({ phase: "idle" });
  const timer = useRef<number | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);

  const apply = (event: Parameters<typeof holdReducer>[1]) => {
    const { state, tick } = holdReducer(hold.current, event);
    hold.current = state;
    if (tick && typeof navigator.vibrate === "function") navigator.vibrate(SOS_TICK_PATTERN);
    return state;
  };

  const press = () => {
    if (active || hold.current.phase !== "idle") return;
    apply({ type: "press", at: performance.now(), requestId: crypto.randomUUID() });
    const stepped = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = window.setInterval(() => {
      const now = performance.now();
      const next = apply({ type: "tick", at: now });
      setProgress(holdProgress(next, now, stepped));
      if (next.phase === "armed") {
        stopTimer();
        hold.current = { phase: "idle" };
        setProgress(0);
        onArmed(next.requestId);
      }
    }, HOLD_TICK_MS);
  };

  const release = () => {
    const before = hold.current.phase;
    apply({ type: "release", at: performance.now() });
    if (before === "holding") {
      stopTimer();
      setProgress(0);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    press();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      if (active) onOpen();
      else press();
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") release();
  };

  return (
    <div className="sos-slot">
      <button
        type="button"
        className="btn sos"
        data-variant="primary"
        data-size="sos"
        data-active={active || undefined}
        aria-label={active ? t("sosActive") : t("sosHold")}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={active ? onOpen : undefined}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="sos-fill" style={{ transform: `scaleY(${progress})` }} aria-hidden="true" />
        <span className="btn-row">
          <Pictogram name="sos" shape="none" />
          <span className="btn-label t-chip">{active ? t("sosActive") : t("sos")}</span>
        </span>
        <span className="btn-note">{active ? t("sosOpen") : t("help")}</span>
      </button>
    </div>
  );
}
