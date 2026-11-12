"use client";

import { useEffect } from "react";
import type { SceneController } from "@/components/landing/scene";

/** Screen-space anchors the scene exposes (cab, boom cylinder, bucket), in CSS px from the canvas. */
type Anchor = { x: number; y: number; visible: boolean };
/** `getAnchors` is optional until the scene implements it; the engine tolerates its absence. */
type Ctl = SceneController & { getAnchors?: () => Anchor[] };

/**
 * Scroll engine: native scroll, one rAF per scroll burst, no smoothing library (dossier §1.3).
 * It writes `--p` (0..1, progress through the pinned travel) on every `.stage`, and feeds the
 * same numbers to the WebGL scene once it exists. Stage bands are cached and re-measured on
 * resize, never read per frame. three.js is a dynamic import started on idle or first scroll.
 *
 * It also tracks the current stage for the progress rail, draws the stage 2 leader lines from the
 * scene's anchors to the callout labels, and rolls the stat digits once on first sight.
 *
 * `?still=<stage>:<p>` (for example `?still=3:0.8`) freezes the page at one scene state with the
 * DOM copy hidden; that is how the per-stage posters are rendered.
 */
export function LandingEngine() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // `?still=<stage>:<p>` renders the poster states; it exists only outside production builds.
    const still = process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search).get("still") : null;
    if (reduced.matches && !still) {
      root.dataset.motion = "reduced";
      return;
    }

    root.dataset.js = "1";
    const stages = Array.from(root.querySelectorAll<HTMLElement>(".stage"));
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.l-canvas");
    // Faded-out controls leave the tab order and the accessibility tree once they are invisible.
    const gated = Array.from(root.querySelectorAll<HTMLElement>("[data-inert-after]")).map((el) => ({
      el,
      stage: stages.indexOf(el.closest<HTMLElement>(".stage") as HTMLElement),
      after: Number(el.dataset.inertAfter),
    }));
    let bands: Array<{ el: HTMLElement; top: number; travel: number; last: number }> = [];
    const ps = [0, 0, 0, 0, 0];
    let raf = 0;
    let ctl: Ctl | null = null;
    let now = 0;
    const leaders = Array.from(root.querySelectorAll<SVGGElement>(".leader"));
    const labels = Array.from(root.querySelectorAll<HTMLElement>(".callout"));
    const pin2 = root.querySelector<HTMLElement>('.stage[data-stage="2"] .pin');
    let started = false;
    let disposed = false;
    let visible = false;

    const measure = () => {
      const y = window.scrollY;
      bands = stages.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, top: r.top + y, travel: Math.max(1, r.height - window.innerHeight), last: -1 };
      });
    };

    const frame = () => {
      raf = 0;
      const y = window.scrollY;
      bands.forEach((b, i) => {
        const p = Math.min(1, Math.max(0, (y - b.top) / b.travel));
        if (Math.abs(p - b.last) > 0.0005) {
          b.last = p;
          b.el.style.setProperty("--p", p.toFixed(4));
        }
        if (i < ps.length) ps[i] = p;
      });
      for (const g of gated) g.el.inert = g.stage >= 0 && (bands[g.stage]?.last ?? 0) >= g.after;
      // Stage 5 shrinks the shared canvas to a card: f = p^2 over .4-.8 (dossier §1.2).
      const w = Math.min(1, Math.max(0, (ps[4] - 0.4) / 0.4));
      root.style.setProperty("--f", (w * w).toFixed(4));
      // Current stage for the rail: the last band whose top has passed the viewport middle.
      let cur = 0;
      const mid = y + window.innerHeight * 0.5;
      bands.forEach((b, i) => {
        if (mid >= b.top) cur = i;
      });
      const lastBand = bands[bands.length - 1];
      if (lastBand && mid >= lastBand.top + lastBand.travel + window.innerHeight) cur = bands.length;
      if (cur !== now - 1) {
        now = cur + 1;
        root.dataset.now = String(now);
      }
      ctl?.setProgress(ps);
      if (now === 2) drawLeaders();
    };

    // Stage 2: a 1 px leader from each label to its anchor on the machine. Anchors and labels are
    // each sorted top to bottom and paired in order, so the lines never cross.
    const drawLeaders = () => {
      const a = (canvas && pin2 && ctl?.getAnchors?.()) || [];
      if (!a.length || !canvas || !pin2) {
        leaders.forEach((g) => g.style.setProperty("--vis", "0"));
        return;
      }
      const cr = canvas.getBoundingClientRect();
      const pr = pin2.getBoundingClientRect();
      const ax = a.map((p) => ({ x: p.x + cr.left - pr.left, y: p.y + cr.top - pr.top, v: p.visible })).sort((p, q) => p.y - q.y);
      const mobile = window.innerWidth < 768;
      const ls = labels
        .map((el) => el.getBoundingClientRect())
        .map((r) => (mobile ? { x: r.left - pr.left + 12, y: r.bottom - pr.top } : { x: r.left - pr.left - 8, y: r.top - pr.top + 14 }))
        .sort((p, q) => p.y - q.y);
      leaders.forEach((g, i) => {
        const p = ax[i];
        const l = ls[i];
        const line = g.firstElementChild as SVGLineElement;
        const dot = g.lastElementChild as SVGCircleElement;
        if (!p || !l) {
          g.style.setProperty("--vis", "0");
          return;
        }
        line.setAttribute("x1", l.x.toFixed(1));
        line.setAttribute("y1", l.y.toFixed(1));
        line.setAttribute("x2", p.x.toFixed(1));
        line.setAttribute("y2", p.y.toFixed(1));
        dot.setAttribute("cx", p.x.toFixed(1));
        dot.setAttribute("cy", p.y.toFixed(1));
        g.style.setProperty("--vis", p.v ? "1" : "0");
      });
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const syncRunning = () => ctl?.setRunning(visible && !document.hidden && !still);

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
        ctl = createScene(canvas, {
          snap: Boolean(still),
          reducedMotion: reduced.matches,
          onRing: (level) => {
            root.dataset.ring = String(level);
          },
          onReady: () => {
            root.dataset.gl = "on";
          },
        });
        ctl.setProgress(ps);
        if (still) {
          ctl.renderOnce();
        } else {
          syncRunning();
        }
      } catch {
        root.dataset.gl = "off";
      }
    };

    if (still) {
      root.dataset.still = "1";
      const [s, p] = still.split(":").map(Number);
      stages.forEach((el, i) => el.style.setProperty("--p", String(i < s - 1 ? 1 : i === s - 1 ? p : 0)));
      ps.forEach((_, i) => (ps[i] = i < s - 1 ? 1 : i === s - 1 ? p : 0));
      const w = Math.min(1, Math.max(0, (ps[4] - 0.4) / 0.4));
      root.style.setProperty("--f", (w * w).toFixed(4));
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

    const scene = root.querySelector<HTMLElement>(".l-scene");
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        syncRunning();
      },
      { rootMargin: "300px 0px" },
    );
    if (scene) io.observe(scene);

    // Counters roll once, digit by digit, when first on screen (1.1 s quint, 90 ms stagger). The SSR
    // text already holds the final value, and the rolled markup keeps it as the accessible name.
    const counters = Array.from(root.querySelectorAll<HTMLElement>("[data-count]"));
    const cio = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        cio.unobserve(el);
        const text = el.dataset.count ?? "";
        el.setAttribute("aria-label", text);
        el.textContent = "";
        const cols: Array<{ col: HTMLElement; d: number; k: number }> = [];
        [...text].forEach((ch, k) => {
          const wrap = document.createElement("span");
          wrap.className = "dg";
          wrap.setAttribute("aria-hidden", "true");
          if (/\d/.test(ch)) {
            const col = document.createElement("span");
            col.className = "dg-c";
            for (let d = 0; d < 10; d++) {
              const c = document.createElement("span");
              c.textContent = String(d);
              col.appendChild(c);
            }
            wrap.appendChild(col);
            cols.push({ col, d: Number(ch), k });
          } else wrap.textContent = ch;
          el.appendChild(wrap);
        });
        // Two paints: the column must be laid out at 0 before it is told to move.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            cols.forEach(({ col, d, k }) => {
              col.style.transitionDelay = `${k * 90}ms`;
              col.style.transform = `translateY(calc(${d} * var(--dg-h) * -1))`;
            });
          }),
        );
      }
    });
    counters.forEach((c) => cio.observe(c));

    // Rail ticks scroll to a point where the stage's copy has arrived (p about .3), not to p = 0.
    const rail = Array.from(root.querySelectorAll<HTMLAnchorElement>(".l-rail a"));
    const onRail = (e: MouseEvent) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const b = bands[Number(a.dataset.rail) - 1];
      if (!b) return;
      e.preventDefault();
      window.scrollTo({ top: b.top + b.travel * (b.el.dataset.stage === "7" ? 0 : 0.3), behavior: "smooth" });
    };
    rail.forEach((a) => a.addEventListener("click", onRail));
    const closeIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) (e.target as HTMLElement).dataset.seen = "1";
      },
      { threshold: 0.35 },
    );
    const closeStage = root.querySelector<HTMLElement>(".stage-close");
    if (closeStage) closeIo.observe(closeStage);

    const hasIdle = "requestIdleCallback" in window;
    const idleId = hasIdle ? window.requestIdleCallback(() => void start(), { timeout: 2500 }) : window.setTimeout(() => void start(), 1200);

    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      io.disconnect();
      cio.disconnect();
      closeIo.disconnect();
      rail.forEach((a) => a.removeEventListener("click", onRail));
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      if (raf) cancelAnimationFrame(raf);
      ctl?.dispose();
    };
  }, []);

  return null;
}
