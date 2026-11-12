"use client";

import { useEffect } from "react";
import type { SceneController, SceneOptions } from "@/components/landing/scene";
import { findReadouts, driveReadout, liveValues, type LiveReadout, type RoMsgs } from "@/components/landing/readout";
import { S5 } from "@/components/landing/shift";
import { driveTape, findTape, tapeFromScroll, type TapeMsgs } from "@/components/landing/shift-tape";

/** Screen-space anchors the scene exposes, in CSS px from the canvas. `id` is absent on older scenes. */
type Anchor = { x: number; y: number; visible: boolean; id?: "cylinder" | "cab" | "beacon" | "truck" };
/** The scene may lack `getAnchors`, `getReadout`, `onFrame` and `onLost`; the engine tolerates their absence. */
type Ctl = SceneController & { getAnchors?: () => Anchor[]; getReadout?: () => LiveReadout };
type Opts = SceneOptions & { onFrame?: () => void; onLost?: () => void };
/** Callout i (c1 boom and stick, c2 seatbelt and rules, c3 patchy connection) to its anchor. */
const LEADER_ID = ["cylinder", "cab", "beacon"] as const;
/** Without ids the scene returns cab, cylinder, bucket: map the same callouts onto that order. */
const LEADER_FALLBACK = [1, 0, 2];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Scroll engine (landing v3 spec §3, §8.2 B1-B3): native scroll, one rAF per scroll burst, no
 * smoothing library. The five scene stages share one pinned view; the stage "bands" are empty
 * spacers whose rectangles are measured once (and on resize). Per frame it
 *  - writes `--p` (0..1) on each band, each stage block and the ledger and proof sections,
 *  - switches which stage block is current (`data-st` on the root),
 *  - drives the shift tape and the readout plates (textContent on cached nodes, never React state),
 *  - feeds the same five numbers to the WebGL scene once it exists (three.js is a dynamic import
 *    started on idle or first scroll), and draws the leader lines from the scene's anchors.
 * With reduced motion, or without script, none of this runs and the page is a stack of stills.
 *
 * `?still=<stage>:<p>` (outside production builds) freezes one scene state for the posters, with the
 * page UI hidden; add `&ui=1` to keep the tape and readouts visible (the §12 sync check).
 */
export function LandingEngine({ tape: tapeMsgs, ro: roMsgs }: { tape: TapeMsgs; ro: RoMsgs }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const params = process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search) : null;
    const still = params?.get("still") ?? null;
    if (reduced.matches && !still) {
      root.dataset.motion = "reduced";
      return;
    }

    root.dataset.js = "1";
    const phone = window.matchMedia("(max-width: 767px)");
    const view = root.querySelector<HTMLElement>(".l-view");
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.l-canvas");
    const bandEls = Array.from(root.querySelectorAll<HTMLElement>(".l-band"));
    const stEls = Array.from(root.querySelectorAll<HTMLElement>(".l-st"));
    const ledgerEl = root.querySelector<HTMLElement>(".l-ledger");
    const proofEl = root.querySelector<HTMLElement>(".l-proof");
    const footEl = root.querySelector<HTMLElement>(".l-foot");
    const scrubSt = stEls[4] ?? null;
    const tape = findTape(root);
    const readouts = findReadouts(root);
    const leaders = Array.from(root.querySelectorAll<SVGGElement>('.l-st[data-st="2"] .leader'));
    const labels = Array.from(root.querySelectorAll<HTMLElement>(".callout"));
    const truckLeader = root.querySelector<SVGGElement>('.leader[data-leader="truck"]');

    type Band = { top: number; h: number };
    let B: Band[] = [];
    let L = { top: 0, h: 1, travel: 1 };
    let P = { top: 0, h: 1, travel: 1 };
    let footTop = Infinity;
    const ps = [0, 0, 0, 0, 0];
    let lastKey = "";
    let raf = 0;
    let ctl: Ctl | null = null;
    let curSt = 0;
    let started = false;
    let disposed = false;
    let visible = false;
    let lost = false;
    let active = 0;

    const measure = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      B = bandEls.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + y, h: Math.max(1, r.height) };
      });
      if (ledgerEl) {
        const r = ledgerEl.getBoundingClientRect();
        L = { top: r.top + y, h: r.height, travel: Math.max(1, r.height - vh) };
      }
      if (proofEl) {
        const r = proofEl.getBoundingClientRect();
        P = { top: r.top + y, h: r.height, travel: Math.max(1, r.height - vh) };
      }
      if (footEl) footTop = footEl.getBoundingClientRect().top + y;
    };

    const setP = (el: HTMLElement | null, p: number) => {
      if (!el) return;
      const v = p.toFixed(4);
      if (el.style.getPropertyValue("--p") !== v) el.style.setProperty("--p", v);
    };

    /** Readout plate for the current stage, from the scene's figures when it has them. */
    const refreshReadouts = () => {
      if (curSt < 2 || curSt > 4) return;
      const live = ctl?.getReadout?.();
      for (const r of readouts) {
        if (r.stage !== curSt) continue;
        const v = liveValues(r.stage, ps[r.stage - 1], live);
        driveReadout(r, v, roMsgs);
        if (r.stage === 4 && !live) root.dataset.ring = String(v.ring);
      }
    };

    // A 1 px leader from each label (stage 2) or from the readout plate (stage 4) to its anchor on the
    // machine or the truck, with one elbow. Redrawn from the scene's own frame callback so it tracks it.
    const drawLeaders = () => {
      const anchors: Anchor[] = (ctl?.getAnchors?.() as Anchor[] | undefined) ?? [];
      const hideAll = () => {
        leaders.forEach((g) => g.style.setProperty("--vis", "0"));
        truckLeader?.style.setProperty("--vis", "0");
      };
      if (!canvas || !anchors.length || window.innerWidth < 1100 || (curSt !== 2 && curSt !== 4)) return hideAll();
      const st = stEls[curSt - 1];
      if (!st) return hideAll();
      const cr = canvas.getBoundingClientRect();
      const pr = st.getBoundingClientRect();
      if (curSt === 2) {
        const hasIds = anchors.some((p) => p.id);
        const rects = labels.map((el) => el.getBoundingClientRect());
        leaders.forEach((g, i) => {
          const p = hasIds ? anchors.find((q) => q.id === LEADER_ID[i]) : anchors[LEADER_FALLBACK[i]];
          const r = rects[i];
          if (!p || !r) return g.style.setProperty("--vis", "0");
          const ax = p.x + cr.left - pr.left;
          const ay = p.y + cr.top - pr.top;
          const lx = r.left - pr.left - 8;
          const ly = r.top - pr.top + 14;
          const ex = lx - 28 - i * 10;
          (g.firstElementChild as SVGPolylineElement).setAttribute("points", `${lx.toFixed(1)},${ly.toFixed(1)} ${ex.toFixed(1)},${ly.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`);
          const dot = g.lastElementChild as SVGCircleElement;
          dot.setAttribute("cx", ax.toFixed(1));
          dot.setAttribute("cy", ay.toFixed(1));
          g.style.setProperty("--vis", p.visible ? "1" : "0");
        });
        return;
      }
      const g = truckLeader;
      const plate = st.querySelector<HTMLElement>(".l-readout");
      const p = anchors.find((q) => q.id === "truck");
      if (!g || !plate || !p) return g?.style.setProperty("--vis", "0");
      const rr = plate.getBoundingClientRect();
      const ax = p.x + cr.left - pr.left;
      const ay = p.y + cr.top - pr.top;
      const lx = rr.left - pr.left;
      const ly = rr.top - pr.top + 56;
      (g.firstElementChild as SVGPolylineElement).setAttribute("points", `${lx.toFixed(1)},${ly.toFixed(1)} ${(lx - 40).toFixed(1)},${ly.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`);
      const dot = g.lastElementChild as SVGCircleElement;
      dot.setAttribute("cx", ax.toFixed(1));
      dot.setAttribute("cy", ay.toFixed(1));
      g.style.setProperty("--vis", p.visible ? "1" : "0");
    };

    const apply = () => {
      const st = Math.max(1, Math.min(5, curSt));
      if (root.dataset.st !== String(st)) root.dataset.st = String(st);
      if (tape) driveTape(tape, tapeFromScroll(ps, tapeMsgs), !reduced.matches);
      view?.style.setProperty("--dim", (S5.dimMax * clamp01((ps[4] - S5.dim[0]) / (S5.dim[1] - S5.dim[0]))).toFixed(3));
      scrubSt?.style.setProperty("--sh", (1 - 0.5 * clamp01(ps[4] / S5.rewind[1])).toFixed(3));
      refreshReadouts();
      const key = ps.map((v) => v.toFixed(4)).join();
      if (key !== lastKey) {
        lastKey = key;
        ctl?.setProgress(ps);
      }
      if (curSt === 2 || curSt === 4) drawLeaders();
    };

    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      const vh = window.innerHeight;
      let cur = 1;
      B.forEach((b, i) => {
        const p = clamp01((y - b.top) / b.h);
        ps[i] = p;
        setP(bandEls[i], p);
        setP(stEls[i], p);
        if (y >= b.top - 1) cur = i + 1;
      });
      curSt = cur;
      if (!phone.matches) {
        setP(ledgerEl, clamp01((y - L.top) / L.travel));
        const p7 = clamp01((y - P.top) / P.travel);
        setP(proofEl, p7);
        const a = p7 < 0.34 ? 1 : p7 < 0.67 ? 2 : 3;
        if (proofEl && a !== active) {
          active = a;
          proofEl.dataset.active = String(a);
        }
      }
      // Tape: paper variant once the ledger sheet has risen to it; hidden through the proof and the footer.
      const tapeFloor = phone.matches ? 140 : 112;
      const onPaper = y + vh - tapeFloor > L.top;
      const hidden = y + vh * 0.75 > P.top;
      const navPaper = y + 60 > L.top && y + 60 < footTop;
      toggle(root, "tapePaper", onPaper);
      toggle(root, "tapeHide", hidden);
      toggle(root, "paper", navPaper);
      if (tape) tape.el.inert = hidden;
      apply();
    };

    const toggle = (el: HTMLElement, key: string, on: boolean) => {
      if (on) {
        if (el.dataset[key] !== "1") el.dataset[key] = "1";
      } else if (key in el.dataset) delete el.dataset[key];
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const syncRunning = () => ctl?.setRunning(!lost && visible && !document.hidden && !still);

    const webglAvailable = () => {
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") ?? c.getContext("webgl");
        if (!gl) return false;
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return true;
      } catch {
        return false;
      }
    };

    const start = async () => {
      if (started || disposed || !canvas) return;
      started = true;
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      if (conn?.saveData || !webglAvailable()) {
        root.dataset.gl = "off";
        return;
      }
      try {
        const { createScene } = await import("@/components/landing/scene");
        if (disposed) return;
        const opts: Opts = {
          snap: Boolean(still),
          reducedMotion: reduced.matches,
          onRing: (level) => {
            root.dataset.ring = String(level);
          },
          onReady: () => {
            root.dataset.gl = "on";
          },
          onFrame: () => {
            refreshReadouts();
            if (curSt === 2 || curSt === 4) drawLeaders();
          },
          // A lost context leaves a black canvas: bring the posters back, and the readouts to settled values.
          onLost: () => {
            lost = true;
            root.dataset.gl = "off";
            ctl?.setRunning(false);
            ctl = null;
          },
        };
        ctl = createScene(canvas, opts);
        lastKey = "";
        ctl.setProgress(ps);
        if (still) ctl.renderOnce();
        else syncRunning();
      } catch {
        root.dataset.gl = "off";
      }
    };

    if (still) {
      root.dataset.still = "1";
      if (params?.get("ui") === "1") root.dataset.stillUi = "1";
      const [s, p] = still.split(":").map(Number);
      ps.forEach((_, i) => (ps[i] = i < s - 1 ? 1 : i === s - 1 ? p : 0));
      curSt = s;
      measure();
      apply();
      stEls.forEach((el, i) => setP(el, ps[i]));
      void start();
      return () => {
        disposed = true;
        ctl?.dispose();
      };
    }

    measure();
    frame();
    const onScroll = () => {
      request();
      void start();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const onResize = () => {
      measure();
      ctl?.resize();
      request();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(root);
    const onVis = () => syncRunning();
    document.addEventListener("visibilitychange", onVis);

    const sceneEl = root.querySelector<HTMLElement>(".l-scene");
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        syncRunning();
      },
      { rootMargin: "300px 0px" },
    );
    if (sceneEl) io.observe(sceneEl);

    // Tape ticks scroll to the point of the stage where their entry happens (spec §3.3).
    const ticks = Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-tick]"));
    const ENTRY_AT: Array<[number, number]> = [
      [2, 0.2],
      [3, 0.25],
      [3, 0.5],
      [4, 0.45],
      [5, 0.711],
      [5, 0.9],
    ];
    const onTick = (e: MouseEvent) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const [stage, p] = ENTRY_AT[Number(a.dataset.tick) - 1] ?? [];
      const b = B[stage - 1];
      if (!b) return;
      e.preventDefault();
      window.scrollTo({ top: b.top + b.h * p, behavior: "smooth" });
      bandEls[stage - 1]?.focus({ preventScroll: true });
    };
    ticks.forEach((a) => a.addEventListener("click", onTick));

    const hasIdle = "requestIdleCallback" in window;
    const idleId = hasIdle ? window.requestIdleCallback(() => void start(), { timeout: 2500 }) : window.setTimeout(() => void start(), 1200);

    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      io.disconnect();
      ticks.forEach((a) => a.removeEventListener("click", onTick));
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      if (raf) cancelAnimationFrame(raf);
      ctl?.dispose();
    };
  }, [tapeMsgs, roMsgs]);

  return null;
}
