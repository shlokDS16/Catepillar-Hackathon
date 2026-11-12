"use client";

import { useEffect } from "react";

/**
 * Scroll engine: native scroll, one rAF per scroll burst, no smoothing library (dossier §1.3).
 * It writes `--p` (0..1, progress through the pinned travel) on every `.stage`; CSS does the rest.
 * Stage bands are cached and re-measured on resize, never read per frame.
 */
export function LandingEngine() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const stages = Array.from(root.querySelectorAll<HTMLElement>(".stage"));
    let bands: Array<{ el: HTMLElement; top: number; travel: number; last: number }> = [];
    let raf = 0;

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
      for (const b of bands) {
        const p = Math.min(1, Math.max(0, (y - b.top) / b.travel));
        if (Math.abs(p - b.last) > 0.0005) {
          b.last = p;
          b.el.style.setProperty("--p", p.toFixed(4));
        }
      }
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    measure();
    frame();
    window.addEventListener("scroll", request, { passive: true });
    const onResize = () => {
      measure();
      request();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(root);

    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
