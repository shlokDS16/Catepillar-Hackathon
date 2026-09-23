"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Mark, Pictogram, type PictogramName } from "@/components/ui/pictogram";
import { Plate, type PlateTone } from "@/components/ui/plate";
import { KitAlerts } from "./kit-alerts";

const TONES: PlateTone[] = ["surface", "sunk", "ink", "clear", "caution", "warning", "critical", "mandatory", "nosignal"];
const SAFETY: Array<{ tone: ChipTone; word: string; picto: PictogramName }> = [
  { tone: "clear", word: "Clear", picto: "seatbelt" },
  { tone: "caution", word: "Caution", picto: "heat" },
  { tone: "warning", word: "Warning", picto: "proximity" },
  { tone: "critical", word: "Critical", picto: "fault" },
  { tone: "nosignal", word: "No signal", picto: "sos" },
];
const PICTOS: PictogramName[] = ["seatbelt", "proximity", "vest", "fault", "heat", "sos"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="t-title border-b-2 border-ink pb-2">{title}</h2>
      {children}
    </section>
  );
}

/** A figure that ticks so tabular numerals can be checked for width stability. */
function Ticker() {
  const [n, setN] = useState(58);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= 99 ? 10 : v + 1)), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-baseline gap-4">
      <span className="t-figure">{n} %</span>
      <span className="t-figure">{n * 7} min</span>
      <span className="t-meta">tnum: the digits must not shift the units</span>
    </div>
  );
}

export function Kit() {
  const [mode, setMode] = useState<"simple" | "detailed">("simple");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [stampKey, setStampKey] = useState(0);

  useEffect(() => {
    const html = document.documentElement;
    if (mode === "detailed") html.dataset.mode = "detailed";
    else delete html.dataset.mode;
    html.lang = lang;
    return () => {
      delete html.dataset.mode;
      html.lang = "en";
    };
  }, [mode, lang]);

  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-gutter py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-meta">Spotter · design kit (development only)</p>
          <h1 className="t-title">Tokens and base components</h1>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex" role="group" aria-label="Mode">
            <Chip tone={mode === "simple" ? "ink" : "outline"} onClick={() => setMode("simple")}>Simple</Chip>
            <Chip tone={mode === "detailed" ? "ink" : "outline"} onClick={() => setMode("detailed")}>Detailed</Chip>
          </div>
          <div className="flex" role="group" aria-label="Language">
            <Chip tone={lang === "en" ? "ink" : "outline"} onClick={() => setLang("en")}>English</Chip>
            <Chip tone={lang === "hi" ? "ink" : "outline"} onClick={() => setLang("hi")}>हिन्दी</Chip>
          </div>
        </div>
      </header>

      <Section title="Colour: safety colour means live state">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {TONES.map((tone) => (
            <Plate key={tone} tone={tone} className="min-h-hit">
              <p className="t-label">{tone}</p>
              <p className="t-meta">Aa 0123</p>
            </Plate>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <p className="t-state">{lang === "hi" ? "काम जारी" : "Working"}</p>
        <Ticker />
        <p className="t-title">Excavation · Bay 3 (title 26 / 22)</p>
        <p className="t-body">Body 18 / 16. Stop the machine to use Spotter. मशीन रोकें, फिर स्पॉटर खोलें।</p>
        <p className="t-label">Label 18 / 16 · Start task · कार्य शुरू करें</p>
        <p className="t-meta text-ink-3">Meta 15 / 13 · as of 10:42 · assumed</p>
        <p className="t-mono">a71b 9c02 44de f100 8b3a 77c1 0e9d 5f21</p>
      </Section>

      <Section title="Plates">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Plate rule="heavy"><p className="t-label">Heavy rule (hero, alerts)</p></Plate>
          <Plate><p className="t-label">Normal rule (state plates, inputs)</p></Plate>
          <Plate rule="hair"><p className="t-label">Hairline (dividers only)</p></Plate>
          <Plate loading><p className="t-label">Loading: outline at final size</p></Plate>
          <Plate dashed><p className="t-label">Offline: cached</p><p className="t-meta">as of 10:42</p></Plate>
          <Plate key={stampKey} tone="warning" rule="heavy" stamp={stampKey > 0}>
            <p className="t-chip">Warning</p>
            <Button size="dense" onClick={() => setStampKey((k) => k + 1)}>Stamp once</Button>
          </Plate>
        </div>
        <div className="max-w-hero">
          <div className="bar" role="progressbar" aria-valuenow={72} aria-valuemin={0} aria-valuemax={100}>
            <div className="bar-fill" style={{ width: "72%" }} />
            <div className="bar-ticks" />
          </div>
        </div>
      </Section>

      <Section title="Buttons: every state from interaction-map §3">
        {(["primary", "secondary"] as const).map((variant) => (
          <div key={variant} className="flex flex-wrap items-start gap-6">
            <Button variant={variant}>Start task</Button>
            <Button variant={variant} data-pressed="true">Pressed</Button>
            <Button variant={variant} disabled note="Needs vest">Start task</Button>
            <Button variant={variant} status="loading">Start task</Button>
            <Button variant={variant} status="success">Started</Button>
            <Button variant={variant} status="error" note="Could not start.">Try again</Button>
            <Button variant={variant} disabled note="Needs signal">Complete</Button>
            <Button variant={variant} icon={<Pictogram name="vest" />}>Wear vest</Button>
          </div>
        ))}
        <div className="flex flex-wrap items-start gap-6">
          <Button variant="primary" size="sos" className="bg-state-critical border-ink">
            SOS
          </Button>
          <Button size="dense">Dense (FM desk)</Button>
          <Button href="/dev/kit">Link button</Button>
          <Button block>Block button</Button>
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-6">
          {SAFETY.map((s) => (
            <Chip key={s.tone} tone={s.tone} word icon={<Pictogram name={s.picto} />} count={s.tone === "warning" ? 3 : undefined} onClick={() => {}}>
              {s.word}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          <Chip tone="ink" word onClick={() => {}}>Live</Chip>
          <Chip word onClick={() => {}}>SIM 10:42 ×60</Chip>
          <Chip tone="nosignal" word dashed onClick={() => {}}>No signal · synced 10:42</Chip>
          <Chip tone="sunk" word>Fixture</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Chip tone="meta">assumed</Chip>
          <Chip tone="meta">simulated</Chip>
          <Chip tone="meta" dashed>missed</Chip>
          <Chip tone="ink">①</Chip>
          <Chip tone="ink">②</Chip>
          <Chip tone="mandatory" icon={<Pictogram name="vest" />}>Wear vest</Chip>
        </div>
      </Section>

      <Section title="Alert tiers (fixtures): vibration, audio, stamp, +n more">
        <KitAlerts />
      </Section>

      <Section title="Pictograms (ours, ISO-style; lucide for UI icons)">
        <div className="flex flex-wrap gap-6">
          {PICTOS.map((p) => (
            <div key={p} className="flex flex-col items-center gap-2">
              <Pictogram name={p} size="lg" />
              <Pictogram name={p} />
              <span className="t-meta">{p}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <Pictogram name="proximity" shape="octagon" size="lg" />
            <Pictogram name="fault" shape="none" />
            <span className="t-meta">shape override</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2"><Mark kind="check" /><Mark kind="cross" /><Mark kind="info" /></div>
            <span className="t-meta">marks</span>
          </div>
        </div>
      </Section>
    </main>
  );
}
