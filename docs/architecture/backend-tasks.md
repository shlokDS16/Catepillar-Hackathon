# Track B task list (to review 1): revision 2 after gate G2

Status: Proposed with ADR-001, **revision 3** (G2 re-check N1-N5, UI gaps, deploy P0, D8 dataset,
D9 updated: provider chain Groq A → Gemini → Groq B; D10 four-phase simulations). Re-baselined after G2 (`G2-n` backend review, `PA-n` program review).
Owner: backend-lead; implementation subagents on model `fable`; the lead reviews every diff before
backend-reviewer. Budget: **≈ 13 feature hours on the main lane** (PA-3), plus a subagent lane.

## 0. Working agreement (adopted from PA-4, PA-5, PA-6)

**Lanes (runbook amendment, needs Shlok's OK; PA-4).** One task at a time on the **main lane**
(`supabase/migrations`, `supabase/functions/*` except `ask`, `supabase/tests`, `packages/shared`).
Subagents may run in parallel **only** in the **subagent lane**: `scripts/`, `supabase/functions/ask/` and
`supabase/functions/demo-login/`
(disjoint folders). The lead reviews every subagent diff before merge. Without this amendment Track B
is ≈ 20.5 h serial and misses the dry run.

**Freeze and merge order (PA-5), verbatim intent:**
1. H0 on `main`: one commit installs every known dependency for both tracks (root and workspace
   `package.json`, `pnpm-lock.yaml`), before the worktrees are created.
2. Each track logs in `docs/sessions/track-b.md` / `track-f.md`; only the orchestrator edits
   `CHECKLIST.md` and `STATE.md`.
3. Track B merges to `main` at each integration point (§3); Track F runs `git merge main` right after.
4. Track F never edits `packages/shared`; contract requests go in its log (api-contracts §0).
5. `.env` is copied into both worktrees; `apps/web` keeps its own `.env.local` (Track F).
6. Destructive database operations (reseed, `purge_rehearsals`, schema resets) happen only at integration
   points, announced in both logs, because both tracks share one Supabase project.

**Deploy is P0, owned by Track B (backend-lead).** The operator demo runs on an Android phone in Chrome;
vibration and audio need a **secure context (HTTPS)**, and a phone cannot reach the laptop's localhost,
so a localhost demo is not an option. Plan:
- **H0 (Shlok):** fix `vercel login` on the laptop (it is broken today, PW.6). This is the only step that
  needs him.
- **B0b (Track B, 15 min, right after B0):** `vercel link` the `apps/web` project (Hobby), set the
  `NEXT_PUBLIC_*` env vars in Vercel, deploy the current `main` (the app shell), open the HTTPS URL on the
  demo phone and confirm vibration + audio unlock work. Preview URLs may sit behind Vercel's deployment
  protection [U: default for Hobby previews]; if so, deploy to the project's production `*.vercel.app`
  URL or turn protection off for the demo.
- Track B redeploys from `main` at every integration point (IP1-IP6) and before each dry run.
- Supabase deploys (migrations, Edge Functions, secrets) are continuous, also Track B.
- Twilio/Telegram webhooks are Edge Functions and do not depend on Vercel.

**Tooling (G2-20, G2-21, PA-10).**
- Supabase CLI **2.102.0 is on PATH**: use `supabase …`, not `npx supabase@latest`.
- **uv 0.12.18** is installed at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\astral-sh.uv_…\uv.exe` but is
  **not on PATH**. B0 adds that folder to PATH for the session (PowerShell `$env:Path += ";<folder>"`,
  bash `export PATH="$PATH:<folder>"`) and every new worktree session checks `uv --version` = 0.12.18.
  Ignore the stale uv 0.5.0 inside the Strawberry sandbox.
- psql is not installed; SQL tests use `scripts/sqltest.ts` (Node `postgres` driver) through the session
  pooler, each file wrapped in `begin; … rollback;`.
- TS tests: vitest for `packages/shared` and pure helpers in `supabase/functions/_shared/` (no Deno-only
  APIs, so Node can test them).

## 1. Main lane (serial, ≈ 13.5 h)

| # | Task | Acceptance criteria | Tests |
|---|---|---|---|
| **B0** (1 h) | Link the project; `config.toml` with `verify_jwt = false` for **every** function (auth in code, G2-6); Edge Function secrets from `.env` + `PUBLIC_FUNCTIONS_URL` + `LLM_CHAIN` + `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY_BACKUP` (D9); secret key, supervisor chat id and site emergency tel into Vault; Realtime "Allow public access" off; uv PATH; sqltest skeleton; **provider smoke test** (Telegram sendMessage, one Twilio call to a verified phone, Groq A and B chat, prompt guard, safeguard, Gemini text, Pinecone, Voyage); check org usage (paused projects vs 500 MB, G2-15); read `cron.use_background_workers` (N5); check whether `cron.schedule_in_database(…, username)` and role-level `statement_timeout` are allowed (N4); `cron.log_statement` (G2-21) | image version ≥ 15.1.1.61 from the Management API (`database.version`), **and** a probe `'1 seconds'` job runs then is unscheduled; smoke test green; findings in the track log | sqltest smoke; smoke script output |
| **B0b** (15 m) | **Web deploy (P0)**: Vercel link + first deploy of `apps/web` from `main`; HTTPS URL tested on the Android demo phone (vibration, audio unlock) | the phone loads the HTTPS URL and vibrates on the test button | manual check in the track log |
| **B1** (1 h) | Contracts v1.0.0 exactly as api-contracts rev 3 (registry, `ReplayScenario` in the UI's shape, snapshot fields, `ProtocolCard`, `DemoLogin`, evidence keys, model ids); `scripts/gen-sql-seed.ts` (enums, `event_types`, `alert_policies`); fixtures; freeze | typecheck green; tag `contracts-v1.0.0`; merged → **IP0** | vitest: fixtures valid/invalid; registry → SQL seed snapshot; `z.toJSONSchema(AskAnswer)` snapshot |
| **B2** (1.25 h) | Migration 001: extensions, generated enums, reference tables, profiles, `operator_pairings`, RLS helpers; stream tables (scenario, telemetry, state, GPS, weather, faults), tasks (+ progress columns), `ppe_overrides`, `task_history`, `v_task_analytics`; `supabase gen types` | Security Advisor: no RLS-disabled `public` table; frames invisible to every client role | sqltest per role (OP own, FM all, anon none); unique (run_id, frame_seq) |
| **B4** (1 h) | Migration 002: generated seed; `events` (`site_id not null`, `audiences`), `emit_event` (the **only** ledger write path: enqueue for `ledger = true` types; insert into `loop_queue` for lesson/replay types; nothing else in the trigger; N2, N3), fan-out one topic per audience; `realtime.messages` policies; `alerts` (SOS-excluded dedupe index); `dispatches` (unique by level, kick on insert or update to `queued`, 20 s pg_net timeout); `my_snapshot` with the UI fields (server_now, seatbelt, nearest, motion lock, forecast, emergency tel) | DB lists equal the registry; Ravi joins `op:{ravi}`, is refused `sup:`; one SOS → one queue row | sqltest: idempotency, append-only, registry parity, two SOS rows coexist, no double enqueue |
| **B5** (1 h) | Migration 003: ledger: `ledger_queue`, drain step, canonical v1, `ledger_write_one` validator, `ledger_verify` (internal), `ledger_recompute(first,last)`, Merkle over **raw 32-byte** hashes, `ledger_roots`, `ledger_checkpoint`, `demo_tamper` (rehash also rewrites `root_hex` **and** `head_hash`); **every mutator and the verify snapshot take lock 4210001** (N3) | golden vectors 1-3 byte for byte in SQL and TS; edit → hash_mismatch; rehash → internal ✓ and recomputed root ≠ the sent line; a checkpoint racing the writer is never self-inconsistent | sqltest (incl. concurrent checkpoint + drain) + vitest vectors |
| **B9** (1 h) | Scenario engine inside the **`worker` procedure** (steps with `COMMIT` between them: ledger drain, Loop queue, tick, every-5th-second requeue/housekeeping; each step in its own exception block); tick: try-lock 4210002 (also used by `manual_tick`), ≤ 200 frames, per-frame exception → `tick_errors`, catch-up scaled by speed, progress from load cycles, `motion_locked`/`nearest` on `operator_state`, `clock` (with `server_now`) + delta `machines`, `tick_log`, `purge_run` | 60× plays 8 h in 8 min with zero `catch_up` suppressions; a poison frame is logged and skipped; **timeout probe** (a step sleeping 10 s is cancelled by the role backstop, or the gap is logged; N4) | sqltest: due frames, double tick no-op, catch-up at 1×/10×/60×, poison frame, probe |
| **B10** (45 m) | Pure rule detectors (P0 six rules) + `apply_findings` (anomalies with location, events, alerts; ledger only via the event trigger) | demo seatbelt frame → exactly one event, alert, queue entry, loop_queue row | sqltest: positive + negative per rule; `sd = 0` and nulls never raise |
| **B10b** (1 h) | Loop builder **as worker step 2** (N2): drain `loop_queue` ≤ 20; lesson assignment; `build_replay` for `safety.seatbelt_breach` from the event record + scenario frames into the **four-phase** `ReplayScenario` (D10: brief; seven evidence card types with `relevant` kept server-side; sequenced decide steps with countdowns and protocol order; re-enactment track of trail, machine and wind); `replay_get`; `replay_submit` → safety/procedure/efficiency scores, process trace vs ideal, rule quoted from the fixed protocol card | seatbelt event → one assignment + one replay that parses with `ReplayScenario`; no answer key in the client JSON; **a raising `build_replay` leaves the event, alert and ledger entry intact** (N2 repro) | sqltest + vitest (parse stored JSON; scoring fixtures) |
| **B11** (45 m) | Per-machine EWMA + Guardian (radius, bearing, wind, tier upgrade under 15 m); **cost measurement**: `tick_log` and `cron.job_run_details` over 10 min at 60× (N5) | EXC-014 drift → anomaly → hazard ≈ scenario distance ± 2 m; tick p95 ≤ 250 ms, max ≤ 800 ms; no job run > 1 s p95; no queued runs; if exceeded: background machines drop to 5-min frames | sqltest; measurement report in the track log → merge **IP2** |
| **B12** (1 h) | Alert engine: upgrade in place, grouped suppression, cap on info/caution, flood summary; `alert_ack`; **`sos-escalator` job** (`escalate_step`, own connection, no advisory lock, skip locked); `can_call_operator` shared with `motion_locked` | SOS escalates once at 60-61 s **while a poison frame fails the tick and a `build_replay` raises**; warning→critical re-raises and dispatches | sqltest: budget rules incl. G2-8 repros; ack/escalation race; motion-lock matrix |
| **B15** (1 h) | RPCs: `pair_machine`, `task_start` (also resume; PPE gate; override expiry), `task_pause/complete`, `ppe_override`, `sos_raise` (nullable location, `server_now`), `sos_cancel`, `incident_log` (emits `incident.reported`), `alert_ack`, `lesson_complete`, `replay_get`, `replay_submit`, `consent_set`, `near_miss_list`, `ledger_recompute`; `director` (FM JWT + secret, rate limit) | every RPC idempotent; wrong role → `forbidden`; `sos_raise` < 300 ms while the worker drains; demo-login never returns a password | sqltest per RPC; vitest director parsing + constant-time compare → merge **IP3** |
| **B13** (1 h) | `dispatch` (CAS, attempts, provider_ref, re-check alert status before escalation calls, dry-run) + Telegram adapter (message, location, edit, **checkpoint line with full root, head and range**) + `telegram-webhook` → `private.telegram_callback` + `scripts/telegram-setup.ts` | live: button acks within 2 s; forced failure after dedupe is retried; checkpoint line parses with `WITNESS_LINE` | vitest payload builders, callback parsing, witness line; live check |
| **B14** (1 h) | Twilio adapter (inline TwiML ≤ 4,000 chars [V], Hindi `<Say>`, `<Gather>` action = `PUBLIC_FUNCTIONS_URL/twilio-voice?d=…`) + `twilio-voice` (signature over the public URL, G2-7; Digits → ack; status → events; no-answer retry) | a real call reaches the verified phone; pressing 1 acknowledges; XML content type confirmed | vitest: signature against our own HMAC-SHA1 of Twilio's documented example string [V algorithm; the docs' sample digest looks truncated, so we compute it independently]; one live call |
| **B21** (30 m) | `scripts/demo-check.ts`: pre-flight (both jobs alive, `tick_log` p95, **oldest unwritten ledger_queue row < 5 s**, webhook info, Twilio verified numbers/credit, providers, DB size, the Vercel URL answers over HTTPS) + six flows in dry-run; defenso `guard_code`; Supabase advisors; STRIDE slide content to the pitch owner | all six flows green; advisors clean or waived in writing | the script → merge **IP4** |

Main lane total: **13.5 h** (revision 3: −0.5 h `ledger-witness` dropped, +0.25 h B0b deploy, +0.25 h
B10b for the D10 four-phase replay; `demo-login` moved to the subagent lane as B22), about 0.5 h over the 13 h target, so the "next cuts" list in §5 applies
from H10 if the lane is behind.

## 2. Subagent lane (parallel, `scripts/` + `supabase/functions/ask/`, ≈ 7 h of subagent time)

| # | Task | Acceptance | Tests |
|---|---|---|---|
| **B6** (1 h) | Generator v1 (Python, uv, `default_rng(seed)`; D8): sites at fixed real coordinates, zones, 20 Cat models with **handbook-style production parameters** (bucket, fill factor by material, job efficiency 0.83, cycle time; sources in config), 30 operators; demo scenario frames (PPE vest missing at 00:00, EXC-007 seatbelt off on a 17° slope at 00:40, EXC-014 drift near on-foot Ravi at 01:30, 12 m at 01:34); `planned_cycles`; **organiser-format CSVs with the exact 9 and 7 headers** + README with our unit definitions | deterministic hash; headers byte-equal to the problem statement's names | pytest |
| **B7** (1.25 h) | Generator v2 (D8): **real Open-Meteo archive weather** for the 3 sites over 90 days, one call with comma-separated coordinates, window ending ≥ 6 days ago (ERA5 5-day delay), `timezone=Asia/Kolkata`, raw JSON cached and committed, CC BY 4.0 attribution [V docs + terms]; weather → WBGT approx, scenario-day forecast; actual times from handbook baseline × condition effects; **Estimated time = naive planner estimate**; hidden effects; held-out labels; task_history splits; Loop cohort; idle % inputs | ≤ 3 archive calls; the 90 days have no gaps; anomaly rate 2-5 %; ≥ 20 per type in days 21-30 | pytest (incl. offline rebuild from the cached JSON) |
| **B8** (1 h) | `scripts/seed.ts`: reference, history, scenario `review1`, labels, auth users (Ravi, Anita, trainer), protocol cards, **card-based lessons validated by `LessonContent`** and the seatbelt **replay template** (evidence spec, ideal order, decide steps, protocol order; D10) from `scripts/content/*.json`; size gate < 300 MB | re-runnable; demo logins work → enables **IP1** | sqltest counts + RLS smoke |
| **B16** (1 h) | ETA: `scripts/eta-fit.ts` → `packages/shared/src/eta/model.v1.json` (the lane hands the model file and `model.ts` to the main lane for commit); evidence `eta.*`; p50/p90 + factors seeded for scenario tasks | MAE vs organiser estimate reported honestly; P90 coverage 0.85-0.95 | vitest |
| **B17** (45 m) | `scripts/eval.ts`: creates the **`eval` sandbox schema**, loads days 21-30 day by day, runs the pure `private.detect_*` functions, scores against `injected_labels`, writes `detector.*`, **`fleet.idle_pct`**, **`loop.repeat_rate.*`**, then drops the sandbox (G2-2) | zero rows added to `events`, `incidents`, `alerts`, `dispatches`, `realtime.messages` (asserted before/after) | the before/after count assertion |
| **B18** (1 h) | RAG ingest: heading chunker; LlamaParse for PDFs with tables, plain-text fallback; **prompt guard over every chunk, flagged chunks quarantined**; Voyage multimodal dense (1024) + Pinecone sparse; `kb_chunks` mirror | index count = mirror count − quarantined; 3 known-answer queries top-3 | vitest chunker; a planted injection chunk is quarantined |
| **B19** (1 h) | `ask` (event-pipeline §6): user-JWT auth + rate limits; **prompt guard** on the question; vision → enum only; verbatim-rule gate; **safeguard** on safety-critical answers; provider-agnostic `ChatProvider` with `LLM_CHAIN` (default Groq A → Gemini → Groq B, only on 429/5xx; `provider_served` logged; D9); live tools next task + alerts | forged publishable-key call → 401; injection fixtures refused or grounded, with the stopping layer logged; forced 429 on A → Gemini serves; all three failing → deterministic refusal; p95 ≤ 8 s [A] | vitest gate, provider switch, injection fixtures → merge **IP6** |
| **B22** (15 m) | `demo-login` Edge Function (secret-gated, magic-link `token_hash`; UI-9), in its own folder `supabase/functions/demo-login/` | never returns a password; wrong secret → 401 | vitest |

## 3. Critical path and integration points (re-baselined)

```
H0     Shlok: vercel login · B0 (+ smoke test) → B0b (HTTPS deploy on the phone)
H1.25  B1 → IP0 (contracts + fixtures)
H2     B2 → B4 → B5                 lane: B6 → B7 → B8 (lands by ≈ H5)
H5.5   IP1 (schema, RLS, seeded logins, my_snapshot, Realtime topics)
H5.5   B9 → B10 → B11 → IP2 (≈ H8: live clock, machines, anomalies, Guardian)
H8     B10b → B12 → B15 → IP3 (≈ H11: alerts, acks, tasks/PPE/SOS RPCs, ledger verify, Loop, Replay)
H11    B13 → B14 → B21 → IP4 (≈ H14: real Telegram + Twilio + checkpoint line; witness = human compare)
       lane: B16 → IP5 (≈ H10: ETA + analytics view) · B17 (≈ H11: evidence) · B18 → B19 → IP6 (≈ H12)
H14    redeploy web → H15 joint dry run #1 (dry-run on) → fixes → H17-18 dry run #2 (live calls)
```
Integration overhead (merge, review, announce) ≈ 15 min per IP is included in these hours.
Track F's G3 at T+9 should test **screens on fixtures + seeded logins**, not live flows (PA-9: IP2 lands
≈ H8).

| IP | Track B delivers | Track F switches to |
|---|---|---|
| IP0 | frozen `@cat/shared` + fixtures | build every screen against fixtures |
| IP1 | schema, RLS, logins, `my_snapshot`, Realtime topics | real reads, sign-in, channel joins, pairing |
| IP2 | clock, machine deltas, anomalies, Guardian | hero card, map, anomaly table live; `/director` |
| IP3 | alerts, ack, tasks/PPE/SOS, ledger verify, lessons + Replay JSON | tiers UI, SOS, PPE flow, inbox, Verify, Replay screen |
| IP4 | Telegram, Twilio, witness | joint live test of flows 2, 3, 5 |
| IP5 | `estimateEta`, `v_task_analytics`, evidence rows | "why this estimate", what-if, one analytics chart, evidence card |
| IP6 | `ask` | Ask Spotter with photo |

## 4. Provisioning status (PA-10 refresh)

Already in `.env` (per PA-10): Supabase, Twilio, Telegram, Groq (accounts A and B), Pinecone, Voyage, and
now the Gemini key (D9 updated: all three are used by the `ask` chain; the AUP risk of account B is
accepted by Shlok).
Still needed:
| Item | Blocks |
|---|---|
| Both worktrees created from `main` after the H0 dependency commit; `.env` copied into each | H0 |
| Realtime "Allow public access" off; org usage check (paused projects vs 500 MB) | B0 |
| Both demo phones verified in Twilio; India geo permission; Anita pressed Start on the bot | B0 smoke test |
| Organiser sample dataset in `docs/brief/data/` | B6 (≈ H2) |
| RAG corpus in `docs/brief/data/kb/` | B18 (≈ H3) |
| `GOOGLE_GENERATIVE_AI_API_KEY` (not in `.env`) | B19 |
| TTS provider + key (ADR-002) | Hindi clips by ≈ H11, decision by H6 |
| `vercel login` fixed | **H0** (blocks B0b; deploy is P0) |
| TTS provider for the Hindi clips: Sarvam or **Gemini TTS** (`gemini-2.5-flash-preview-tts` is on the key; **Hindi quality unverified**, test in B0 smoke) | clips by ≈ H11 |
| Approval of the lane amendment (§0) | H0 |

## 5. Scope cuts (for Shlok)

Applied now (program cut list PA-3 §3, all eight, plus Track B specifics):
| # | Cut | Moves to | Owner |
|---|---|---|---|
| 1 | RAG eval (old B20) shown as "in progress" on the evidence card | after review 1 | B |
| 2 | Daily Merkle cron (checkpoint on demand + every 30 min in demo mode kept) | P1 | B |
| 3 | Fleet-baseline EWMA (per-machine EWMA kept) | P1 | B |
| 4 | Tamil UI (the `ta` enum stays, so it is additive later) | P1 | F |
| 5 | Static radar; machine↔machine proximity | P1 | F / B |
| 6 | Analytics reduced to one chart (the view still has all columns) | P1 | F |
| 7 | Replay for one event type: **seatbelt on a slope** (aligned with screens.md demo beat 4) | Guardian replay P1 | B / F |
| 8 | Ask tools limited to next task + active alerts | P1 | B |
| 9 | Rules cold over-rev, harsh operation, warning ignored | P1 | B |
| 10 | Gemini as a photo fallback (icon grid instead; privacy) | not planned | B |
| 11 | Automated ledger witness check (`ledger-witness`); replaced by the human compare (N1) | roadmap: OpenTimestamps / RFC 3161 | B |
| 12 | Language RPC (cookie locale in P0; UI-16) | P1 | B |

Next cuts if the main lane is behind at H10 (in order): PPE override path (the demo uses the vest-on
path) → `sos_cancel` → 30-min auto checkpoint → `inject_frame` → sparse half of hybrid retrieval
(dense only).
