"use client";

import { useEffect, useState } from "react";
import { useDataPort } from "@/data/store";

/**
 * The card count of a lesson, read from its content (never a hardcoded number). `null` while it
 * loads or when the lesson cannot be loaded; callers then show the plain label without a count.
 */
export function useLessonCards(code: string | null): number | null {
  const port = useDataPort();
  const [state, setState] = useState<{ code: string; cards: number } | null>(null);
  useEffect(() => {
    if (!code) return;
    let live = true;
    port
      .lessonGet(code)
      .then((lesson) => {
        if (live) setState({ code, cards: lesson.cards.length });
      })
      .catch(() => {
        if (live) setState(null);
      });
    return () => {
      live = false;
    };
  }, [port, code]);
  return state && state.code === code ? state.cards : null;
}
