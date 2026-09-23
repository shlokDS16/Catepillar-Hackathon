"use client";

import { useState } from "react";
import { fixtureAdapter } from "@/components/chrome/providers";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import type { Beat } from "@/data/fixture-adapter";

const BEATS: Array<{ beat: Beat; label: string }> = [
  { beat: 1, label: "Beat 1 · vest on (PPE restored)" },
  { beat: 2, label: "Beat 2 · seatbelt off on a slope (warning + motion lock)" },
  { beat: 3, label: "Beat 3 · Guardian: EXC-014 hydraulic drift (on foot)" },
  { beat: 4, label: "Beat 4 · replay ready + lesson assigned" },
  { beat: 5, label: "Beat 5 · ledger checkpoint, then tamper" },
];

/**
 * Director panel on fixtures: each button plays one demo beat on the shared FixtureAdapter, so the
 * operator tab open beside it reacts as if the events came from the server. Live commands
 * (DirectorRequest to the Edge Function, director secret in sessionStorage) land at F16 live.
 */
export function DirectorPanel() {
  const [log, setLog] = useState<string[]>([]);
  const play = (beat: Beat, label: string) => {
    fixtureAdapter().broadcastBeat(beat);
    setLog((l) => [`${new Date().toLocaleTimeString("en-IN", { hour12: false })} · ${label}`, ...l].slice(0, 30));
  };
  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-meta text-ink-3">Director · hidden · English only</p>
          <h1 className="t-title">Demo run (fixtures)</h1>
        </div>
        <Plate tone="sunk" className="t-chip">
          Dry run · fixtures
        </Plate>
      </header>
      <p className="t-body text-ink-2">Open /op in another tab first. Each button emits the events that beat would produce on the server.</p>
      <div className="flex flex-col gap-4">
        {BEATS.map(({ beat, label }) => (
          <Button key={beat} block onClick={() => play(beat, label)}>
            {label}
          </Button>
        ))}
      </div>
      <section aria-label="Response log" className="flex flex-col gap-2">
        <h2 className="t-label">Log</h2>
        {log.length === 0 ? <p className="t-meta text-ink-3">Nothing sent yet.</p> : null}
        <ul className="list-none p-0 m-0 flex flex-col gap-1">
          {log.map((line, i) => (
            <li key={i} className="t-meta t-mono">
              {line}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
