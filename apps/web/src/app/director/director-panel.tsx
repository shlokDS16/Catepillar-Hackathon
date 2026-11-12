"use client";

import { useEffect, useState } from "react";
import { fixtureAdapter } from "@/components/chrome/providers";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import type { Beat } from "@/data/fixture-adapter";

const BEATS: Array<{ beat: Beat; label: string }> = [
  { beat: 1, label: "Beat 1 · vest on (PPE restored)" },
  { beat: 2, label: "Beat 2 · seatbelt off on a slope (warning + motion lock)" },
  { beat: 8, label: "Beat 2b · seatbelt fastened, machine stopped (clears the warning)" },
  { beat: 3, label: "Beat 3 · Guardian: EXC-014 hydraulic drift (on foot)" },
  { beat: 4, label: "Beat 4 · replay ready + lesson assigned" },
  { beat: 5, label: "Beat 5 · ledger checkpoint, then tamper (edit: chain breaks)" },
  { beat: 6, label: "Ledger · tamper with re-hash (chain intact, Telegram does not match)" },
  { beat: 7, label: "Ledger · reset to intact" },
];

/**
 * Director panel on fixtures: each button plays one demo beat on the shared FixtureAdapter, so the
 * operator tab open beside it reacts as if the events came from the server. Live commands
 * (DirectorRequest to the Edge Function, director secret in sessionStorage) land at F16 live.
 */
export function DirectorPanel() {
  const [log, setLog] = useState<string[]>([]);
  const [witnessLine, setWitnessLine] = useState("");
  useEffect(() => {
    void import("@/ledger/fixtures").then((m) => m.witnessLineFor()).then(setWitnessLine);
  }, []);
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
      <section aria-label="Reset demo" className="flex flex-col gap-2">
        <h2 className="t-label">Reset</h2>
        <Button block onClick={() => fixtureAdapter().resetDemo()}>
          Reset demo (clears the saved state here and in every open tab, then reloads them)
        </Button>
      </section>
      <section aria-label="Incident report failure (fixtures)" className="flex flex-col gap-2">
        <h2 className="t-label">Incident sheet</h2>
        <Button
          block
          onClick={() => {
            fixtureAdapter().failNextIncident();
            setLog((l) => [`${new Date().toLocaleTimeString("en-IN", { hour12: false })} · next incident report fails once`, ...l].slice(0, 30));
          }}
        >
          Next incident report fails once (shows the kept draft)
        </Button>
      </section>
      <section aria-label="Telegram checkpoint line (fixtures)" className="flex flex-col gap-2">
        <h2 className="t-label">Telegram checkpoint line for /fm/ledger (fixtures)</h2>
        <textarea readOnly rows={3} value={witnessLine} className="t-mono t-meta w-full border-2 border-ink bg-surface p-2" />
      </section>
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
