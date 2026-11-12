"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { restoreLive, signInLive, signOutLive, useLiveState, type SignInResult } from "@/data/live-session";

const REASONS: Record<Extract<SignInResult, { ok: false }>["reason"], string> = {
  credentials: "Email or password not accepted.",
  role: "This account is not an operator or fleet manager, so it cannot use the live switch.",
  rate: "Too many attempts. Wait a minute and try again.",
  network: "Could not reach the backend. Still on demo data.",
};

/**
 * D18 thin live path: sign in with a real account and the shell for that role reads the real
 * backend (operator snapshot, Replay, Ledger verdict); the rest stays on fixtures and SOS stays a
 * dry run. Sign out and everything is fixtures again. Nothing is stored except the session the
 * Supabase client keeps in this browser.
 */
export function LivePanel() {
  const live = useLiveState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void restoreLive();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const r = await signInLive(email.trim(), password);
    setBusy(false);
    if (r.ok) setPassword("");
    else setMessage(REASONS[r.reason]);
  };

  const field = "t-body w-full border-2 border-ink bg-surface p-2";
  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-meta text-ink-3">Director · hidden · English only</p>
          <h1 className="t-title">Live switch</h1>
        </div>
        <Plate tone="sunk" className="t-chip">
          {live.role ? `Live data · ${live.role === "operator" ? "operator" : "fleet manager"}` : "Demo data"}
        </Plate>
      </header>
      <p className="t-body text-ink-2">
        Off by default. Sign in with a demo account to read the real backend in that role&apos;s screens: operator snapshot, Replay, Ledger
        verification. Everything else stays on demo data, and SOS never leaves the dry run. If a live call fails, that screen shows demo data and says so.
      </p>
      <ul className="t-meta text-ink-2 list-disc pl-5">
        <li>Live: operator snapshot, Replay (get and submit), Ledger verification.</li>
        <li>Demo data even when Live is on: tasks, alerts, map, inbox, lessons (completing a lesson is not saved on the server), Ask, SOS (always a dry run).</li>
        <li>The seeded run is paused and not current, so the live Home has no machine or clock; the Loop card and Replay are the live parts.</li>
        <li>If a Replay submit reaches the server but its reply fails the contract check, the scores shown are demo scores and the stored attempt may differ.</li>
      </ul>

      {live.role ? (
        <section aria-label="Signed in" className="flex flex-col gap-3">
          <p className="t-body" role="status">
            Live is on for the {live.role === "operator" ? "operator" : "fleet manager"} screens ({live.source === "fallback" ? "last call fell back to demo data" : "reading the backend"}).
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button block href={live.role === "operator" ? "/op" : "/fm"}>
              Open {live.role === "operator" ? "operator" : "fleet manager"} screens
            </Button>
            <Button block variant="secondary" onClick={() => void signOutLive()}>
              Sign out, back to demo data
            </Button>
          </div>
        </section>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" aria-label="Live sign-in">
          <label className="flex flex-col gap-1">
            <span className="t-label">Email</span>
            <input className={field} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-label">Password</span>
            <input className={field} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button block type="submit" status={busy ? "loading" : "idle"} disabled={busy}>
            Sign in and switch to live data
          </Button>
          {message ? (
            <p className="t-meta" role="alert">
              {message}
            </p>
          ) : null}
        </form>
      )}
      <Button variant="secondary" href="/director">
        Back to the director
      </Button>
    </main>
  );
}
