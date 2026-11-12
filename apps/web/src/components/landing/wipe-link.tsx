"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { setLocaleCookie } from "@/i18n/set-locale";
import type { Locale } from "@/i18n/locales";

/**
 * A link that leaves the landing with the circle wipe, ending in the portal's Ink Frame
 * (docs/design/portal-redesign-study.md section 3 B). Sequence: an ink circle grows from the click
 * point to the farthest corner (500 ms), an ink status band (top) and dock (bottom) settle, the
 * paper middle opens between them (360 ms), then the route pushes. When the next route has
 * rendered the landing unmounts and the veil fades away. Under reduced motion there is no wipe:
 * the route changes at once. Modified and middle clicks fall through to the browser.
 */
const CIRCLE_MS = 500;
const OPEN_MS = 360;

export function WipeLink({
  href,
  className,
  children,
  band,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  /** The mono caption on the ink status band. */
  band?: string;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  // The landing unmounts when the next route has rendered: that is the moment to fade the veil
  // away and remove it, so the app is never left under ink.
  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      const host = hostRef.current;
      if (!host) return;
      hostRef.current = null;
      host.dataset.leave = "1";
      window.setTimeout(() => host.remove(), 500);
    },
    [],
  );

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push(href);
      window.setTimeout(() => {
        busy.current = false;
      }, 1000);
      return;
    }
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const host = document.createElement("div");
    host.className = "wipe";
    host.setAttribute("aria-hidden", "true");
    const circle = document.createElement("div");
    circle.className = "wipe-circle";
    Object.assign(circle.style, { left: `${x - r}px`, top: `${y - r}px`, width: `${2 * r}px`, height: `${2 * r}px` });
    const top = document.createElement("div");
    top.className = "wipe-band";
    top.textContent = band ?? "";
    const dock = document.createElement("div");
    dock.className = "wipe-dock";
    const rail = document.createElement("div");
    rail.className = "wipe-rail";
    const paper = document.createElement("div");
    paper.className = "wipe-paper";
    host.append(circle, top, dock, rail, paper);
    hostRef.current = host;
    document.body.appendChild(host);

    const after = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        host.dataset.step = "circle";
      }),
    );
    after(CIRCLE_MS, () => {
      host.dataset.step = "open";
    });
    after(CIRCLE_MS + OPEN_MS, () => router.push(href));
    // If the route never arrives (offline), do not leave the page blocked.
    after(6000, () => {
      host.remove();
      hostRef.current = null;
      busy.current = false;
    });
  }

  return (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  );
}

/** Footer language switch: sets the locale cookie and re-renders the same URL (as the language sheet does). */
export function LangSwitch({ to, lang, children }: { to: Locale; lang: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="l-lang-switch"
      lang={lang}
      onClick={() => {
        setLocaleCookie(to);
        router.refresh();
      }}
    >
      {children}
    </button>
  );
}
