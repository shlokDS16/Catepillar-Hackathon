# Track B task list (to review 1): revision 2 after gate G2

Status: Proposed with ADR-001, re-baselined after G2 (`G2-n` backend review, `PA-n` program review).
Owner: backend-lead; implementation subagents on model `fable`; the lead reviews every diff before
backend-reviewer. Budget: **≈ 13 feature hours on the main lane** (PA-3), plus a subagent lane.

## 0. Working agreement (adopted from PA-4, PA-5, PA-6)

**Lanes (runbook amendment, needs Shlok's OK; PA-4).** One task at a time on the **main lane**
(`supabase/migrations`, `supabase/functions/*` except `ask`, `supabase/tests`, `packages/shared`).
Subagents may run in parallel **only** in the **subagent lane**: `scripts/` and `supabase/functions/ask/`
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

**Deploy owner (PA-6): Track B (backend-lead)** owns every deploy: migrations, Edge Functions and
secrets continuously; the web app from `main` at each IP merge **if** `vercel login` works by H10
(Shlok fixes the login; Track B runs `vercel deploy`). If not, the orchestrator records at H10 that the
demo runs from localhost (`pnpm build:web` + `next start` on the demo laptop). Twilio/Telegram webhooks
do not depend on this (they are Edge Functions).

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
| **B0** (1 h) | Link the project; `config.toml` with `verify_jwt = false` for **every** function (auth in code, G2-6); Edge Function secrets from `.env` + `PUBLIC_FUNCTIONS_URL`; secret key and supervisor chat id into Vault; Realtime "Allow public access" off; uv PATH; sqltest skeleton; **provider smoke test** (Telegram sendMessage, one Twilio call to a verified phone, Groq/Pinecone/Voyage pings); check org usage (do the paused projects count toward 500 MB? G2-15) and whether `cron.log_statement` can be turned off (G2-21) | image version ≥ 15.1.1.61 read from the Management API (`database.version`, not `select version()`, G2-21), **and** a probe `cron.schedule('probe','1 seconds',…)` runs then is unscheduled; smoke test green | sqltest smoke; smoke script output in the track log |
| **B1** (1 h) | Contracts v1.0.0 exactly as api-contracts (registry, replay, evidence keys); `scripts/gen-sql-seed.ts` (enums, `event_types`, `alert_policies`); fixtures; freeze | typecheck green; tag `contracts-v1.0.0`; merged → **IP0** | vitest: fixtures valid/invalid; registry → SQL seed snapshot; `z.toJSONSchema(AskAnswer)` snapshot |
| **B2** (1.25 h) | Migration 001: extensions, generated enums, reference tables, profiles, `operator_pairings`, RLS helpers; stream tables (scenario, telemetry, state, GPS, weather, faults), tasks (+ progress columns), `ppe_overrides`, `task_history`, `v_task_analytics`; `supabase gen types` | Security Advisor: no RLS-disabled `public` table; frames invisible to every client role | sqltest per role (OP own, FM all, anon none); unique (run_id, frame_seq) |
| **B4** (1 h) | Migration 002: generated seed; `events` with `audiences`, `emit_event`, fan-out one topic per audience; `realtime.messages` policies mirroring events RLS (G2-19); `alerts` (+ SOS-excluded dedupe index, G2-3); `dispatches` (unique by level, kick trigger on insert **or** update to `queued`, 20 s pg_net timeout; G2-10); `my_snapshot` | DB lists equal the registry; Ravi joins `op:{ravi}`, is refused `sup:`; trainer receives only trainer-audience events | sqltest: idempotency, append-only, registry parity, two SOS rows coexist |
| **B5** (1 h) | Migration 003: ledger: `ledger_queue`, `ledger-writer` job, canonical v1 (data-model §4.3), `ledger_write_one` validator, `ledger_verify` + head anchor, Merkle, `ledger_roots` (message id + sent text), `ledger_checkpoint`, `demo_tamper` | golden vectors 1-3 reproduced **byte for byte** in SQL and TS; edit → hash_mismatch; rehash → anchor ✗ | sqltest + vitest (vectors incl. Devanagari, nested context, integer-like keys, control-char rejection) |
| **B9** (1 h) | Scenario engine: `run_*`, `scenario-tick` job (own txn, 5 s statement timeout, try-lock, ≤ 200 frames, per-frame exception block → `tick_errors`), catch-up rule scaled by speed (G2-5), progress update from load cycles, `clock` + delta `machines` broadcasts, `tick_log`, `purge_run`, `housekeeping` job | 60× plays 8 h in 8 min with **zero** `catch_up` suppressions; `jump_to` suppresses only jumped frames; a raising detector frame is logged and skipped | sqltest: due-frame selection, double tick no-op, catch-up at 1×/10×/60×, poison frame |
| **B10** (45 m) | Pure rule detectors (P0 six rules, data-model §2.5) + `apply_findings` (anomalies with location, events, alerts, ledger_enqueue) | demo seatbelt frame → exactly one event, alert, queue entry | sqltest: positive + negative per rule; `sd = 0` and nulls never raise |
| **B10b** (45 m) | Loop builder (PA-1): `loop_on_event` → lesson assignment; `build_replay` (guardian template) → `ReplayScenario` JSON; `replay_submit` scoring | Guardian event yields one assignment + one replay whose JSON parses with `ReplayScenario` | sqltest + vitest (parse the stored JSON) |
| **B11** (45 m) | Per-machine EWMA + Guardian (radius, bearing, wind, tier upgrade under 15 m); **tick cost measurement** (G2-16) | EXC-014 drift → anomaly → hazard ≈ scenario distance ± 2 m; **tick p95 ≤ 250 ms, max ≤ 800 ms at 60×** over a full run (`tick_log`); if exceeded: background machines drop to 5-min frames | sqltest; `tick_log` report in the track log → merge **IP2** |
| **B12** (1 h) | Alert engine (event-pipeline §7): upgrade in place, grouped suppression by open alerts only, cap on info/caution, flood summary; `alert_ack`; **`sos-escalator` job** (own txn, skip locked); `can_call_operator` (deny by default, staleness); `dispatch-requeue` job | SOS escalates once at 60-61 s **while a poison frame is failing the tick** (G2-1 repro); warning→critical re-raises and dispatches | sqltest: each budget rule incl. the G2-8 repros; ack/escalation race; motion-lock matrix |
| **B15** (1 h) | RPCs: `pair_machine`, `task_start/pause/complete` (PPE gate, ETA + factors), `ppe_override`, `sos_raise` (no lock wait), `sos_cancel`, `incident_log`, `alert_ack`, `lesson_complete`, `consent_set`, `near_miss_list`; `director` function (FM JWT + secret, rate limit) | every RPC idempotent; wrong role → `forbidden`; `sos_raise` returns < 300 ms while the ledger writer runs | sqltest per RPC; vitest director parsing + constant-time compare → merge **IP3** |
| **B13** (1 h) | `dispatch` (CAS, attempts counter, provider_ref, re-check alert status before escalation calls, dry-run) + Telegram adapter (message, location, edit, checkpoint line) + `telegram-webhook` → `private.telegram_callback` (G2-11) + `scripts/telegram-setup.ts` | live: button acks within 2 s; a forced failure after dedupe is retried and processed; replayed update ignored | vitest payload builders, callback parsing; live check |
| **B14** (1 h) | Twilio adapter (inline TwiML ≤ 4,000 chars [V], Hindi `<Say>`, `<Gather>` action = `PUBLIC_FUNCTIONS_URL/twilio-voice?d=…`) + `twilio-voice` (signature over the public URL, G2-7; Digits → ack; status → events; no-answer retry) | a real call reaches the verified phone; pressing 1 acknowledges; XML content type confirmed | vitest: signature against our own HMAC-SHA1 of Twilio's documented example string [V algorithm; the docs' sample digest looks truncated, so we compute it independently]; one live call |
| **B13b** (30 m) | `ledger-witness` function (FM JWT): `forwardMessage` re-fetch, parse `SPOTTER-LEDGER` line, compare with recomputed root + head anchor (G2-4) | after `rehash` tamper: witness = mismatch; untampered: match | vitest parser; live check → merge **IP4** |
| **B21** (30 m) | `scripts/demo-check.ts`: pre-flight (jobs alive, `tick_log` p95, webhook info, Twilio verified numbers/credit, providers, **DB size**) + six flows in dry-run; defenso `guard_code` on auth/DB/env/request-body code; Supabase security + performance advisors; STRIDE slide content handed to the pitch owner | all six flows green; advisors clean or waived in writing | the script |

Main lane total: **13.5 h**, about 0.5 h over the 13 h target, so the "next cuts" list in §5 applies
from H10 if the lane is behind.

## 2. Subagent lane (parallel, `scripts/` + `supabase/functions/ask/`, ≈ 7 h of subagent time)

| # | Task | Acceptance | Tests |
|---|---|---|---|
| **B6** (1 h) | Generator v1 (Python, uv, `default_rng(seed)`): sites, zones, 20 Cat models, 30 operators; demo scenario frames (PPE vest missing at 00:00, EXC-007 seatbelt off on slope at 00:40, EXC-014 drift near on-foot Ravi at 01:30, 12 m approach at 01:34); `planned_cycles` per task; organiser-format CSVs | deterministic hash; headers exactly the organiser's 9 and 7 fields | pytest |
| **B7** (1.25 h) | Generator v2: 30-day DB history + 90-day files; hidden effects; injected labels; task_history splits; Open-Meteo archive weather [V endpoint] with synthetic fallback; **synthetic Loop cohort** (assigned vs control operators, recurrence within 14 days) and idle % inputs (PA-2) | anomaly rate 2-5 %; ≥ 20 per type in days 21-30; cohort sizes printed | pytest |
| **B8** (1 h) | `scripts/seed.ts`: reference, history, scenario `review1`, labels, auth users (Ravi, Anita, trainer), protocol cards, lessons, replay template; size gate < 300 MB | re-runnable; demo logins work → enables **IP1** | sqltest counts + RLS smoke |
| **B16** (1 h) | ETA: `scripts/eta-fit.ts` → `packages/shared/src/eta/model.v1.json` (the lane hands the model file and `model.ts` to the main lane for commit); evidence `eta.*`; p50/p90 + factors seeded for scenario tasks | MAE vs organiser estimate reported honestly; P90 coverage 0.85-0.95 | vitest |
| **B17** (45 m) | `scripts/eval.ts`: creates the **`eval` sandbox schema**, loads days 21-30 day by day, runs the pure `private.detect_*` functions, scores against `injected_labels`, writes `detector.*`, **`fleet.idle_pct`**, **`loop.repeat_rate.*`**, then drops the sandbox (G2-2) | zero rows added to `events`, `incidents`, `alerts`, `dispatches`, `realtime.messages` (asserted before/after) | the before/after count assertion |
| **B18** (1 h) | RAG ingest: heading chunker; **LlamaParse** for PDFs with tables (key already in `.env`; PA-8) with plain-text fallback; Voyage multimodal dense (1024) + Pinecone sparse; `kb_chunks` mirror | index count = mirror count; 3 known-answer queries top-3 | vitest chunker; live queries |
| **B19** (1 h) | `ask` function (event-pipeline §6): user-JWT auth + rate limits (G2-6), vision → enum only, verbatim-rule gate (G2-13), live tools next task + alerts, 120b → Gemini text fallback | forged publishable-key call → 401; injection fixtures refused or grounded; p95 ≤ 8 s [A] | vitest gate + injection fixtures → merge **IP6** |

## 3. Critical path and integration points (re-baselined)

```
H0     B0 (+ smoke test)            H1    B1 → IP0 (contracts + fixtures)
H2     B2 → B4 → B5                 lane: B6 → B7 → B8 (lands by ≈ H5)
H5.5   IP1 (schema, RLS, seeded logins, my_snapshot, Realtime topics)
H5.5   B9 → B10 → B11 → IP2 (≈ H8: live clock, machines, anomalies, Guardian)
H8     B10b → B12 → B15 → IP3 (≈ H11: alerts, acks, tasks/PPE/SOS RPCs, ledger verify, Loop, Replay)
H11    B13 → B14 → B13b → IP4 (≈ H14: real Telegram + Twilio + witness)
       lane: B16 → IP5 (≈ H10: ETA + analytics view) · B17 (≈ H11: evidence) · B18 → B19 → IP6 (≈ H12)
H14    B21 → H15 joint dry run #1 (dry-run on) → fixes → H17-18 dry run #2 (live calls)
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

Already in `.env` (per PA-10): Supabase, Twilio, Telegram, Groq × 4, Pinecone, Voyage.
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
| `vercel login` fixed | web deploy decision at H10 |
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
| 7 | Replay for one event type: Guardian near-miss | P1 for others | B / F |
| 8 | Ask tools limited to next task + active alerts | P1 | B |
| 9 | Rules cold over-rev, harsh operation, warning ignored | P1 | B |
| 10 | Gemini as a photo fallback (icon grid instead; privacy) | not planned | B |

Next cuts if the main lane is behind at H10 (in order): PPE override path (the demo uses the vest-on
path) → `sos_cancel` → 30-min auto checkpoint → `inject_frame` → sparse half of hybrid retrieval
(dense only).
