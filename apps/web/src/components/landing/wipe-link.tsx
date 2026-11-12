"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

/**
 * A link that leaves the landing with the dossier's circle wipe (§5): an ink circle grows from the
 * click point to the farthest corner (.5 s in-out), the route pushes at +500 ms. Under reduced
 * motion it is a 150 ms crossfade. Modified and middle clicks fall through to the browser.
 */
export function WipeLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const busy = useRef(false);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const fallback = useRef<number | undefined>(undefined);
  const reducedRef = useRef(false);

  // The landing unmounts when the next route has rendered: that is the moment to shrink the veil
  // away (dossier §1.5) and remove it, so the app is never left under ink.
  useEffect(
    () => () => {
      window.clearTimeout(fallback.current);
      const veil = veilRef.current;
      if (!veil) return;
      veilRef.current = null;
      if (reducedRef.current) veil.style.opacity = "0";
      else veil.style.transform = "scale(0)";
      window.setTimeout(() => veil.remove(), 600);
    },
    [],
  );

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;
    const veil = document.createElement("div");
    veil.setAttribute("aria-hidden", "true");
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    Object.assign(veil.style, {
      position: "fixed",
      zIndex: "60",
      pointerEvents: "none",
      background: "var(--ink)",
    });
    if (reduced) {
      Object.assign(veil.style, { inset: "0", opacity: "0", transition: "opacity 150ms linear" });
    } else {
      Object.assign(veil.style, {
        left: `${x - r}px`,
        top: `${y - r}px`,
        width: `${2 * r}px`,
        height: `${2 * r}px`,
        borderRadius: "50%",
        transform: "scale(0)",
        transition: "transform 500ms var(--ease-inout)",
      });
    }
    veilRef.current = veil;
    document.body.appendChild(veil);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (reduced) veil.style.opacity = "1";
        else veil.style.transform = "scale(1)";
      }),
    );
    window.setTimeout(() => router.push(href), reduced ? 150 : 500);
    // If the route never arrives (offline), do not leave the page blocked.
    fallback.current = window.setTimeout(() => {
      veil.remove();
      veilRef.current = null;
      busy.current = false;
    }, 6000);
  }

  return (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  );
}
