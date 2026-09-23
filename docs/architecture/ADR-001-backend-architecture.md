# ADR-001: Backend architecture: the database owns time and truth

- **Status:** Proposed (2026-09-23, backend-lead). Needs backend-reviewer + Shlok approval (gate G2).
- **Deciders:** Shlok (approver), backend-lead (author), backend-reviewer.
- **Related:** `backend-options.md` (full comparison), `data-model.md`, `event-pipeline.md`,
  `api-contracts.md`, `backend-tasks.md`, spec v3 `docs/specs/idea.md`.

## Context

Spotter's review-1 demo (≈ 19 h away) must run six live flows: seatbelt breach, the Guardian anomaly
near an operator (with the motion-lock rule), SOS with a 60 s escalation, a PPE override, a ledger
tamper + verify, and an Ask Spotter question with a photo. Every screen subscribes to one `events`
table. Two real integrations (a Telegram message and a Twilio call) prove it is not a mock-up.

Forces:
- **Time and ordering.** The SOS escalation must fire exactly once after 60 s even if every browser is
  closed; the ledger link must be set server-side under a lock; the scenario must replay identically.
  On free tiers the only sub-minute scheduler we control is pg_cron (Supabase supports `'N seconds'`
  schedules [V]); Vercel Hobby cron runs once per day [V].
- **Team shape.** Two tracks in separate worktrees with disjoint folders. Track B owns `supabase/`,
  `scripts/`, `packages/shared`; Track F owns `apps/web`. Backend code placed in `apps/web` would
  collide.
- **Public webhooks.** Telegram and Twilio need HTTPS callbacks before the first live test.
  `vercel login` is currently broken; Supabase Edge Functions give public URLs through the Supabase CLI.
- **Honesty rules.** The anomaly generator and detector must be built separately, labels held out.
- **Limits.** Supabase Free: 500 MB database, 2 s CPU per Edge Function request, 2 M Realtime
  messages/month [V]. Groq free: 8,000 TPM per model per organisation [R].

## Decision

Adopt **Option C, "the database owns time and truth"**:

1. **Postgres (Supabase, Mumbai)** holds all state and every rule that must be ordered or
   exactly-once: the scenario clock and frame release (`heartbeat()` on pg_cron every 1 s), the
   detectors (rules + EWMA in plpgsql, Guardian via PostGIS `ST_DWithin`), the alert state machine
   (dedupe, suppression, rate cap, motion lock, escalation compare-and-set), the incident ledger
   (canonical serialisation, `ledger_append` under `pg_advisory_xact_lock`, verify, daily Merkle root),
   and the fan-out to clients (`realtime.send` to private topics from triggers).
2. **Supabase Edge Functions** are thin adapters, each ≤ 1 responsibility: `dispatch` (Telegram and
   Twilio calls, fired by pg_net after commit), `telegram-webhook`, `twilio-voice` (keypress ack +
   call status), `ask` (RAG), `director` (demo control behind `DEMO_DRIVER_SECRET`). They call providers
   with plain `fetch`, not npm SDKs, to avoid Deno compatibility surprises.
3. **`packages/shared` (TypeScript)** holds the frozen zod contracts, the ETA model (pure function
   plus a fitted coefficients JSON) and the ledger canonicaliser mirror used by the evidence script.
4. **Python (uv), offline only** generates the synthetic world, the demo scenario frames, the injected
   labelled anomalies and the organiser-format CSVs.
5. **Next.js (`apps/web`)** is UI only: supabase-js with the publishable key and the user's session
   (RLS), RPCs for every write, `functions.invoke` for `ask`, Realtime private channels for live state.
6. **LLM chain:** Groq `openai/gpt-oss-120b` → Groq `openai/gpt-oss-20b` → **Google Gemini Flash
   (free tier)** as the non-Groq fallback; vision: Groq `qwen/qwen3.8-27b` (Preview) → Gemini Flash.
   Every AI path has a deterministic fallback (section "Consequences").

## Options that lost, and why

- **A: Next.js-centric (route handlers on Vercel).** Fastest to type, but it places the backend in
  Track F's folder, makes the scenario clock depend on an open browser tab, and blocks the first live
  call on a Vercel deployment we cannot log in to today. It scored 24/36 against C's 32/36
  (`backend-options.md` §3).
- **B: Python intelligence service.** Best for P1 ML work, but a third deploy target, a second contract
  language, a Render free-tier cold start of 30-60 s on stage [R], and ≈ 3-4 h of plumbing that the
  review-1 demo never shows. 24/36.

Points of agreement kept from all options: ledger in SQL, timers on pg_cron, generator in Python, RAG
capped by Groq TPM.

## Consequences

Positive
- One backend deploy target; tracks never edit the same folder.
- The demo survives closed tabs, cold functions and duplicate webhook deliveries (constraints and
  compare-and-set, not code discipline).
- "Generator ≠ detector" is structural (Python vs SQL), which strengthens the evidence card.
- Webhooks are testable from hour ~10 without Vercel.

Negative / costs
- plpgsql for the EWMA and rules: less pleasant than TypeScript, and SQL tests run as assertion
  scripts against the project inside rolled-back transactions (local pgTAP needs `supabase start` and
  Docker; Docker is installed, the Supabase CLI is not).
- Supabase lock-in (acceptable for a hackathon; the SQL is portable Postgres except pg_cron, pg_net,
  Vault and `realtime.send`).
- A 1-second pg_cron job writes ~86,400 `cron.job_run_details` rows a day; a nightly cleanup job is
  mandatory.
- Detectors cannot be imported by the TypeScript evidence script; evaluation runs the same SQL over a
  held-out history loaded into the database (data-model §7).

AI fallbacks and budgets (principle: every AI feature has a deterministic fallback)
| Feature | Primary | Fallback | Deterministic floor | Budget |
|---|---|---|---|---|
| Ask Spotter answer | Groq gpt-oss-120b | gpt-oss-20b → Gemini Flash | "Ask your supervisor" refusal + top 3 retrieved chunk titles | ≤ 3,500 prompt tokens, p95 ≤ 8 s |
| Photo understanding | Groq qwen3.8-27b | Gemini Flash | Ask the operator to pick a category (icon grid) | 1 image, ≤ 4 MB |
| Protocol cards (Guardian) | none: fixed, reviewed cards | — | the card itself | 0 LLM calls |
| Alert audio | pre-generated Hindi clips | Twilio `<Say>` Hindi voice | text + vibration | 0 live TTS on the demo path |

Follow-ups
- ADR-002 (TTS provider for pre-generated Hindi clips) is open: Sarvam was dropped by Shlok (G1 #7);
  research 15 names Azure Speech F0 as the verified alternative [R].
- Revisit if the plan moves to Supabase Pro (per-minute Vercel cron, more DB space) or if P1 ML work
  starts (Option B's Python service becomes attractive then).
