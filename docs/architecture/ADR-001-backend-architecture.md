# ADR-001: Backend architecture: the database owns time and truth

- **Status:** Proposed, **revision 3** (2026-09-23, backend-lead): reconciliation after the G2 re-check
  (PASS-WITH-FIXES), the UI contract gaps and decisions D8/D9. Revision 2 followed gate G2 (backend-reviewer FAIL,
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
   **Two 1-second pg_cron jobs** (revision 3, N5): `sos-escalator` (own connection and transaction,
   no advisory lock) and `worker` (a procedure that commits between its steps: ledger drain, Loop
   queue, scenario tick, requeue/housekeeping). A failing or slow tick, Loop build or ledger drain cannot
   delay an SOS escalation, and no user RPC waits on the ledger lock (G2-1, N2, N3).
2. **Supabase Edge Functions** are thin adapters, each ≤ 1 responsibility: `dispatch` (Telegram and
   Twilio calls, fired by pg_net after commit), `telegram-webhook`, `twilio-voice` (keypress ack +
   call status), `ask` (RAG), `director` (demo control: FM JWT + `DEMO_DRIVER_SECRET`), `demo-login` (persona
   sign-in without shipping passwords). The automated `ledger-witness` was dropped in revision 3 (N1):
   the ledger's external witness is a **human comparison** of the Telegram checkpoint line with a root
   recomputed from the rows ("externally witnessed, human-verifiable"). All run with `verify_jwt = false` and authenticate
   the caller in code (user JWT, secret header, HMAC signature or secret key). They call providers
   with plain `fetch`, not npm SDKs, to avoid Deno compatibility surprises.
3. **`packages/shared` (TypeScript)** holds the frozen zod contracts, the ETA model (pure function
   plus a fitted coefficients JSON) and the ledger canonicaliser mirror used by the evidence script.
4. **Python (uv), offline only** generates the synthetic world, the demo scenario frames, the injected
   labelled anomalies and the organiser-format CSVs.
5. **Next.js (`apps/web`)** is UI only: supabase-js with the publishable key and the user's session
   (RLS), RPCs for every write, `functions.invoke` for `ask`, Realtime private channels for live state.
6. **LLM layer (D9):** **one Groq account** (no cross-account failover; the Groq AUP forbids
   orchestrating usage across organisations). Groq `openai/gpt-oss-120b` answers, `gpt-oss-20b` rewrites,
   `meta-llama/llama-prompt-guard-2-86m` screens questions and ingested chunks,
   `openai/gpt-oss-safeguard-20b` policy-checks safety-critical answers. A provider-agnostic
   `ChatProvider` takes an env-selected fallback: `LLM_FALLBACK=none` (deterministic refusal) or
   `gemini` (text only); Shlok chooses. Vision: Groq `qwen/qwen3.8-27b` (Preview) → icon grid.
7. **Deploy is P0, owned by Track B:** Supabase continuously; the web app on Vercel over HTTPS from H0
   (the Android demo phone needs a secure context for vibration and audio).
8. **Dataset (D8):** our own; the organiser's 9 + 7 fields are an exact subset exported as
   organiser-format CSVs; real Open-Meteo archive weather; handbook-style productivity baselines;
   hidden effects and held-out labels.
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
- Webhooks do not depend on Vercel (they are Edge Functions).

Negative / costs
- plpgsql for the EWMA and rules: less pleasant than TypeScript, and SQL tests run as assertion
  scripts against the project inside rolled-back transactions (local pgTAP needs `supabase start` and
  Docker; Docker 29.3.1 and Supabase CLI 2.102.0 are installed, but the local stack is not assumed).
- Supabase lock-in (acceptable for a hackathon; the SQL is portable Postgres except pg_cron, pg_net,
  Vault and `realtime.send`).
- Two 1-second pg_cron jobs open ~173,000 connections and write as many `cron.job_run_details` rows a
  day; housekeeping deletes rows older than 1 h; B11 measures the connection cost (N5).
- Detectors cannot be imported by the TypeScript evidence script; evaluation runs the same **pure** SQL
  detector functions inside a throw-away `eval` schema, never through events, alerts, Realtime or the
  ledger (data-model §2.5.2).

AI fallbacks and budgets (principle: every AI feature has a deterministic fallback)
| Feature | Primary | Fallback | Deterministic floor | Budget |
|---|---|---|---|---|
| Ask Spotter answer | Groq gpt-oss-120b (one account) | `LLM_FALLBACK`: none or Gemini text (D9) | "Ask your supervisor" refusal + top 3 retrieved chunk titles | ≤ 3,500 prompt tokens, p95 ≤ 8 s |
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

### Revision 3 additions (G2 re-check, UI gaps, D8, D9)

Source: the "Re-check" section of `docs/gates/G2-backend-review.md` (N1-N5 and residuals), the UI lead's
`docs/design/frontend-tasks.md` §5 (UI-1 … UI-16, dispositioned in AC §10), and decisions D8/D9.

| Finding # | Action | Where fixed |
|---|---|---|
| N1 witness trusts a DB-supplied message id | **Fixed by removing the automated check.** `ledger-witness` is dropped. The fleet manager reads the range and root from her own Telegram chat; the console recomputes the root from the ledger rows for that range (`ledger_recompute`) and shows both side by side. The claim is "externally witnessed, human-verifiable". **Second anchor rejected for P0:** OpenTimestamps attestation arrives hours later [U] and a public git commit is force-pushable with our own token; both go to the roadmap with RFC 3161 | DM §4.5-4.6 · EP §5 · AC §4, §6 · BT B5, B13, §5 cut 11 |
| G2-4 (re-check: PARTIAL) | **Fixed.** `ledger_verify` is labelled internal consistency only; `demo_tamper(rehash)` rewrites `root_hex` **and** `head_hash`, so the demo no longer stages an anchor failure; the only external evidence is the human compare | DM §4.4, §4.6 · EP §5 |
| N2 Loop builder inside the frame subtransaction | **Fixed.** The event trigger only inserts into `private.loop_queue`; the worker's step 2 builds lessons and replays in its own transaction; a failing build marks the queue row and never touches the event, alert or ledger. B10b re-runs the reviewer's repro | DM §2.8 · EP §0 · BT B10b, B12 |
| N3 lag, ordering, lock scope, double enqueue | **Fixed.** A single ledger write path (event trigger, key `ledger:{event key}`); RPCs no longer enqueue; `incident_log` emits `incident.reported`. Checkpoint, tamper and verify take lock 4210001. Lock duration and `seq` ≠ `occurred_at` ordering are stated. Lag bound 3 s with a `demo-check` alarm at 5 s | DM §4.2 · EP §0, §1, §8 · AC §3, §4 · BT B4, B5, B21 |
| N4 `set local statement_timeout` does not bound the running statement | **Accepted and redesigned.** Bounded work per step is the guarantee; a role-level `statement_timeout` via `cron.schedule_in_database(…, username)` is the backstop, if Supabase allows it [U, checked in B0]; B9 runs a sleep probe | DM §6 · BT B0, B9 |
| N5 connection churn; `manual_tick` lock | **Fixed.** Two jobs instead of four (≈ 2 connections/s); B11 measures job duration and queued runs; B0 reads `cron.use_background_workers` [U]; `manual_tick` takes try-lock 4210002 | DM §6 · EP §8 · BT B0, B11 |
| #15 residual (purge vs FKs) | **Fixed.** `incidents.source_event_id` has no FK; `purge_run` deletion order specified; the ledger is never purged | DM §4.1, §7 |
| #19 residual (events with null site) | **Fixed.** `events.site_id not null`; system events are emitted per site | DM §3.1 |
| #8 note (wall-clock windows merge sim-distinct breaches at 60×) | **Accepted by design** (reviewer agreed) | EP §7 |
| UI-1 … UI-16 | **15 closed, 1 partly (language RPC → P1)**; Replay adopts the UI's shape and its P0 event (seatbelt) | AC §10 |
| Deploy P0 (coordinator item 3) | **Adopted.** Vercel HTTPS deploy in B0b, Shlok fixes `vercel login` at H0; redeploy at every IP | BT §0, B0b |
| D8 dataset | **Adopted.** Exact organiser headers; real Open-Meteo archive weather (endpoint, parameters, 5-day delay, limits and CC BY 4.0 verified); handbook-style baselines; hidden effects; held-out labels; Estimated time = naive planner estimate | DM §1 · BT B6, B7 |
| D9 one Groq account | **Adopted.** No cross-account failover; `ChatProvider` + `LLM_FALLBACK=none\|gemini`; the second account's keys are never in the app's secrets | ADR decision 6 · EP §6 · AC §6 · BT B0, B19, §4 |
| Prompt guard + safeguard (coordinator item 6) | **Adopted.** Prompt guard on questions and at ingestion (quarantine); safeguard on safety-critical answers; both fail closed for safety answers | EP §6, §9, §10 · BT B18, B19 |

