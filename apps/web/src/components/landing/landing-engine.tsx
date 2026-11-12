"use client";

import { useEffect } from "react";
import type { SceneController } from "@/components/landing/scene";

/**
 * Scroll engine: native scroll, one rAF per scroll burst, no smoothing library (dossier §1.3).
 * It writes `--p` (0..1, progress through the pinned travel) on every `.stage`, and feeds the
 * same numbers to the WebGL scene once it exists. Stage bands are cached and re-measured on
 * resize, never read per frame. three.js is a dynamic import started on idle or first scroll.
 *
 * `?still=<stage>:<p>` (for example `?still=3:0.8`) freezes the page at one scene state with the
 * DOM copy hidden; that is how the per-stage posters are rendered.
 */
export function LandingEngine() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const still = new URLSearchParams(window.location.search).get("still");
    if (reduced.matches && !still) {
      root.dataset.motion = "reduced";
      return;
    }

    const stages = Array.from(root.querySelectorAll<HTMLElement>(".stage"));
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.l-canvas");
    let bands: Array<{ el: HTMLElement; top: number; travel: number; last: number }> = [];
    const ps = [0, 0, 0, 0, 0];
    let raf = 0;
    let ctl: SceneController | null = null;
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
      // Stage 5 shrinks the shared canvas to a card: f = p^2 over .4-.8 (dossier §1.2).
      const w = Math.min(1, Math.max(0, (ps[4] - 0.4) / 0.4));
      root.style.setProperty("--f", (w * w).toFixed(4));
      ctl?.setProgress(ps);
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

    // Counters count up once over 1.2 s when first on screen; the SSR text already holds the final value.
    const counters = Array.from(root.querySelectorAll<HTMLElement>("[data-count]"));
    const cio = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        cio.unobserve(el);
        const target = Number(el.dataset.count);
        const t0 = performance.now();
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / 1200);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    });
    counters.forEach((c) => cio.observe(c));

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
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      if (raf) cancelAnimationFrame(raf);
      ctl?.dispose();
    };
  }, []);

  return null;
}
