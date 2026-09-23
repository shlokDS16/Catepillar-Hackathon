# ADR-001: Backend architecture: the database owns time and truth

- **Status:** Proposed, **revision 2** (2026-09-23, backend-lead) after gate G2 (backend-reviewer FAIL,
  program-architect READY-WITH-CHANGES). Every finding is dispositioned in the last section.
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
   exactly-once: the scenario clock and frame release (pg_cron `scenario-tick` every 1 s, its own transaction), the
   detectors (rules + EWMA in plpgsql, Guardian via PostGIS `ST_DWithin`), the alert state machine
   (dedupe with tier upgrades, grouped suppression, rate cap, motion lock, escalation compare-and-set),
   the incident ledger (byte-exact canonical serialisation, a queue drained by one writer job under
   `pg_advisory_xact_lock`, verify with a head anchor, Merkle checkpoints witnessed in Telegram), and
   the fan-out to clients (`realtime.send`, one private topic per audience).
   **Four independent pg_cron jobs, each its own transaction:** `scenario-tick`, `sos-escalator`,
   `ledger-writer`, `dispatch-requeue`. A failing tick cannot delay an SOS escalation, and no user RPC
   or tick waits on the ledger lock (revision 2, G2-1).
2. **Supabase Edge Functions** are thin adapters, each ≤ 1 responsibility: `dispatch` (Telegram and
   Twilio calls, fired by pg_net after commit), `telegram-webhook`, `twilio-voice` (keypress ack +
   call status), `ask` (RAG), `director` (demo control: FM JWT + `DEMO_DRIVER_SECRET`), `ledger-witness`
   (re-fetches the published root from Telegram). All run with `verify_jwt = false` and authenticate
   the caller in code (user JWT, secret header, HMAC signature or secret key). They call providers
   with plain `fetch`, not npm SDKs, to avoid Deno compatibility surprises.
3. **`packages/shared` (TypeScript)** holds the frozen zod contracts, the ETA model (pure function
   plus a fitted coefficients JSON) and the ledger canonicaliser mirror used by the evidence script.
4. **Python (uv), offline only** generates the synthetic world, the demo scenario frames, the injected
   labelled anomalies and the organiser-format CSVs.
5. **Next.js (`apps/web`)** is UI only: supabase-js with the publishable key and the user's session
   (RLS), RPCs for every write, `functions.invoke` for `ask`, Realtime private channels for live state.
6. **LLM chain:** Groq `openai/gpt-oss-120b` → **Google Gemini Flash (free tier, text only)** as the
   non-Groq fallback (Groq `gpt-oss-20b` does the query rewrite, so it is not the answer fallback);
   vision: Groq `qwen/qwen3.8-27b` (Preview) → deterministic icon grid (photos never go to Gemini).
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
  Docker; Docker 29.3.1 and Supabase CLI 2.102.0 are installed, but the local stack is not assumed).
- Supabase lock-in (acceptable for a hackathon; the SQL is portable Postgres except pg_cron, pg_net,
  Vault and `realtime.send`).
- Three 1-second pg_cron jobs write ~260,000 `cron.job_run_details` rows a day; the `housekeeping`
  job deletes rows older than 1 h every 10 min.
- Detectors cannot be imported by the TypeScript evidence script; evaluation runs the same **pure** SQL
  detector functions inside a throw-away `eval` schema, never through events, alerts, Realtime or the
  ledger (data-model §2.5.2).

AI fallbacks and budgets (principle: every AI feature has a deterministic fallback)
| Feature | Primary | Fallback | Deterministic floor | Budget |
|---|---|---|---|---|
| Ask Spotter answer | Groq gpt-oss-120b | Gemini Flash (text) | "Ask your supervisor" refusal + top 3 retrieved chunk titles | ≤ 3,500 prompt tokens, p95 ≤ 8 s |
| Photo understanding | Groq qwen3.8-27b → enum category only | none | Ask the operator to pick a category (icon grid) | 1 image, ≤ 4 MB |
| Protocol cards (Guardian) | none: fixed, reviewed cards | — | the card itself | 0 LLM calls |
| Alert audio | pre-generated Hindi clips | Twilio `<Say>` Hindi voice | text + vibration | 0 live TTS on the demo path |

Follow-ups
- ADR-002 (TTS provider for pre-generated Hindi clips) is open: Sarvam was dropped by Shlok (G1 #7);
  research 15 names Azure Speech F0 as the verified alternative [R].
- Revisit if the plan moves to Supabase Pro (per-minute Vercel cron, more DB space) or if P1 ML work
  starts (Option B's Python service becomes attractive then).

## G2 findings disposition

Sources: `docs/gates/G2-backend-review.md` (G2-1 … G2-21) and `docs/gates/G2-program.md` (PA-1 … PA-10).
Abbreviations: DM = data-model.md, EP = event-pipeline.md, AC = api-contracts.md, BT = backend-tasks.md,
BO = backend-options.md.

| Finding # | Action | Where fixed |
|---|---|---|
| G2-1 SOS timer shares the tick's transaction | **Fixed.** Four independent pg_cron jobs, each its own transaction. `sos-escalator` touches only alerts, dispatches and events. Each frame runs in its own exception block, with a 5 s statement timeout and at most 200 frames per tick. All ledger writes go through `ledger_queue` + `ledger-writer`, so `sos_raise` never waits on the ledger lock. B12's acceptance re-runs the reviewer's repro | DM §2.3, §4.2, §6 · EP §0, §3 · BT B9, B12 |
| G2-2 evaluation writes into the live pipeline | **Fixed.** Detectors are split into pure functions and a live-only effects layer. Evaluation runs in a throw-away `eval` schema created by `scripts/eval.ts`, and B17 asserts zero new rows in events, incidents, alerts, dispatches and realtime | DM §2.5, §2.5.2 · BT B17 |
| G2-3 SOS deduplicated by the index | **Fixed.** The dedupe index excludes `kind = 'sos'`, so every SOS is its own alert and message | DM §3.2 · EP §3 · BT B4 test |
| G2-4 Merkle witness never compared externally | **Fixed.** The Telegram line carries the full 64-hex root and head hash in a parseable form. `ledger_roots` stores the chat id, message id and sent text. `ledger-witness` re-fetches Telegram's copy with `forwardMessage` [V] and compares it with the recomputed root, and the head anchor in `ledger_verify` catches truncation. **Partly accepted as a limit:** whoever holds the bot token can edit the witness, and entries after the last checkpoint are covered only by the chain (checkpoints every 30 min in demo mode). RFC 3161 stays on the roadmap | DM §4.4-4.6 · EP §5 · AC §6 · BT B5, B13b |
| G2-5 catch-up suppresses normal alerts at 60× | **Fixed.** Catch-up applies only to frames covered by `catchup_until_seq` (a jump) or older than `speed × 5 s` of sim time (a real stall) | DM §2.3 · EP §0 · BT B9 |
| G2-6 `verify_jwt` + publishable key reaches `ask`/`director` | **Fixed.** Every function sets `verify_jwt = false` and authenticates in code: a user JWT is required (anon or key-only → 401), `director` and `ledger-witness` need the FM role, and there are per-user and org-wide rate limits. Note: the docs we read in revision 1 said the check rejects API keys. Either way a legacy `anon` JWT passes it, so the finding stands | AC §6 · EP §6, §10 · BT B0, B15, B19 |
| G2-7 Twilio signature vs `req.url` | **Fixed.** Signed URL = `PUBLIC_FUNCTIONS_URL + '/twilio-voice' + exact query sent`; algorithm per the Twilio docs [V] | AC §6 · EP §9 · BT B14 |
| G2-8 alert-budget holes | **Fixed.** Dedupe is by hazard key, with an in-place tier upgrade that dispatches again. Suppression happens only within the same hazard and only by an open alert. All windows are wall-clock. The rate cap applies only to info and caution. The flood summary has its own hazard key and subject id | DM §3.2-3.3 · EP §7 · BT B12 |
| G2-9 contracts and SQL drift | **Fixed.** `EVENT_REGISTRY`, `ALERT_POLICIES` and the enums in the contracts generate the SQL seed. All missing event types are added, plus `ledger_tamper` and `alert_flood` policies. ETA factors have one array shape everywhere and are passed by `task_start` | AC §0, §3, §4 · DM §2.1, §2.2 · BT B1, B4 |
| G2-10 dead dispatch retry, short pg_net timeout, call after ack | **Fixed.** The kick trigger fires on insert or on an update to `queued`. Attempts are a counter on one row, and the unique key includes the escalation level. pg_net timeout is 20 s. Rows with a `provider_ref` are never re-sent, and `dispatch` re-checks the alert status before an escalation call | DM §3.3 · EP §3, §8 · BT B4, B13 |
| G2-11 Telegram ack can be lost | **Fixed.** `private.telegram_callback` does dedupe, chat binding and ack in one transaction; the secret compare is constant-time | DM §3.3 · EP §3 · BT B13 |
| G2-12 TS canonicaliser cannot match SQL | **Fixed.** Canonical v1 is restricted and specified exactly. Scalars are strings only, and context has no JSON numbers. Timestamps stay text and are never parsed. ASCII keys are sorted explicitly, and control characters are rejected. Numbers use `numeric::text`, not `to_char`. Three golden vectors with hashes are included | DM §4.3 · AC §9 · BT B5 |
| G2-13 photo prompt injection becomes a cited rule | **Fixed.** Vision output is reduced to an enum category (never citable, and no text from the image is kept). `rule` must quote a cited doc chunk verbatim, and every step must cite a source. Photos never go to Gemini | EP §6 · AC §6 · BT B19 |
| G2-14 P0 features without a backend path | **Fixed.** Progress comes from load cycles (`planned_cycles`, `cycles_at_start`, `task.progress`). Added: the Replay builder, template and scoring, plus `ReplayScenario`; automatic Loop assignment; repeat-rate and idle % metric keys and the generator cohort; the `pair_machine` RPC; anomaly location | DM §2.1, §2.2, §2.5, §2.8 · AC §4, §5, §8 · BT B6, B7, B10b, B15, B17 |
| G2-15 500 MB budget ignores growth | **Fixed.** Rehearsal runs are purged (the ledger is kept). `machines` broadcasts are deltas. The eval sandbox is transient. Housekeeping clears the job logs, a size guard fires at 400 MB, and B0 checks the org-level sum. [U] whether paused projects count | DM §0, §6, §7 · BT B0, B9, B21 |
| G2-16 detector cost unmeasured | **Fixed.** Added `tick_log`. B11 acceptance: p95 ≤ 250 ms and max ≤ 800 ms at 60×, with a fallback (5-min frames for background machines) | DM §2.3 · BT B11, B21 |
| G2-17 motion lock undefined for unknown state | **Fixed.** Default is deny, with a 10 s staleness bound and a decision table | EP §2 · DM §2.1 (`state_stale_s`) |
| G2-18 hidden RAG budget consumers | **Fixed.** The answer fallback goes straight to Gemini (20b is reserved for the rewrite). The eval is cut to after review 1 and, when run, records the model per row. Photos never go to Gemini. Voyage limits without a payment method remain [U]: **accepted risk** (one embed + one rerank per ask) | EP §6 · ADR decision 6 · BT §5 |
| G2-19 Realtime auth per topic vs table RLS | **Fixed.** An `audiences` column drives both RLS and one topic per audience (`train:` added) | DM §3.1 · AC §7 · BT B4 |
| G2-20 tooling facts wrong | **Fixed.** CLI 2.102.0 is on PATH (no `npx`); B0 has the uv 0.12.18 PATH note | BO §1 · BT §0, B0 |
| G2-21 B0 criterion unmeasurable; `cron.log_statement` | **Fixed:** the image version comes from the Management API, plus a probe 1-second job. `cron.log_statement`: B0 checks whether it can be turned off; if not, **accepted** (it adds log lines, not database size) [U] | BT B0 · DM §6 |
| PA-1 Replay and Loop have no builder | **Fixed.** B10b and `ReplayScenario`; demo beat 4 replays the Guardian near-miss | BT B10b · AC §5 · DM §2.8 |
| PA-2 repeat-event rate and idle % missing | **Fixed.** Generator cohort (B7) and evaluation keys (B17) | BT B7, B17 · DM §2.5.1 |
| PA-3 Track F has no task list; scope > 13 h | **Cut list adopted in full** (BT §5); main lane re-baselined to 13.5 h. **Track F's task list: rejected for this document set.** It belongs to the ui-ux-lead's plan for `apps/web`, which this track does not edit; BT §3 gives Track F the integration points to plan against | BT §1, §3, §5 |
| PA-4 runbook conflict (parallel subagents) | **Adopted as a proposed amendment** that needs Shlok's OK: subagents work only in `scripts/` and `supabase/functions/ask/` | BT §0 |
| PA-5 root-file collisions | **Adopted:** H0 dependency commit, per-track logs, merge order, no Track F edits to `packages/shared`, `.env` copies, destructive DB operations only at IPs | BT §0, AC §0 |
| PA-6 web deploy has no owner | **Adopted:** Track B (backend-lead) owns all deploys. The web deploy runs from `main` if `vercel login` works by H10; otherwise the demo runs from localhost | BT §0 |
| PA-7 STRIDE missing; session expiry; SOS rate-limit wording | **Fixed:** STRIDE table in EP §10; backend-lead owns the slide content. Session expiry: default JWT expiry + refresh [A]; time-boxed sessions are a paid Auth setting [U]. SOS: "abuse control, never dropped". **The spec wording change is proposed to the orchestrator**, not edited here | EP §3, §10 · BT B21 |
| PA-8 gaps inside tasks | **Fixed:** `v_task_analytics` (B2 view, B16 data), LlamaParse in B18, `pair_machine`, and near-miss pseudonymisation enforced by RLS + `near_miss_list`. Machine↔machine proximity is **cut to P1** (cut #5) | DM §2.2, §2.10 · BT B2, B16, B18, §5 |
| PA-9 G3 cannot test live flows | **Adopted as a recommendation:** G3 tests screens on fixtures + seeded logins (the gate definition belongs to the orchestrator) | BT §3 |
| PA-10 provisioning section out of date | **Fixed** | BT §4 |
