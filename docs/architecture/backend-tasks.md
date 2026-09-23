# Track B task list (to review 1)

Status: Proposed with ADR-001. Owner: backend-lead (implementation subagents on model `fable`, lead
reviews every diff before backend-reviewer). Worktree: Track B, folders `supabase/`, `scripts/`,
`packages/shared` only. Each task is ≤ 1 h and ends with its tests green and a line in CHECKLIST.md.

## 0. Test harness (set up in B0, used by every task)

- **SQL tests**: `supabase/tests/*.sql`, each wrapped in `begin; … rollback;` with `do $$ … assert …
  $$` blocks, run by `scripts/sqltest.ts` (Node, `postgres` driver) against the Mumbai project through
  the session pooler connection string. Rolled back, so tests never leave data. (Local pgTAP via
  `supabase test db` needs `supabase start` + Docker [V]; Docker 29.3.1 is installed, so we can switch
  if the laptop has the RAM; not assumed.)
- **TypeScript tests**: vitest in `packages/shared` (contracts, ETA, ledger canonical mirror) and for
  pure helpers in `supabase/functions/_shared/` (TwiML builder, Telegram payloads, signature check,
  RAG gate), which are written as plain TS with no Deno-only APIs so Node can test them.
- **Live checks**: `scripts/demo-check.ts` (B21) drives all six flows end to end against the project.
- Installs needed at B0 (not done in this design phase): Supabase CLI (`npx supabase@<latest>`: the
  npm registry offered 2.117.0 today [V]), uv (not installed [V]), vitest, `postgres`.

## 1. Tasks

| # | Task (≤ 1 h) | Acceptance criteria | Tests |
|---|---|---|---|
| **B0** (45 m) | Tooling + project link: `supabase init`, `link` to the Mumbai ref, `config.toml` with `verify_jwt=false` for `dispatch`, `telegram-webhook`, `twilio-voice`; set Edge Function secrets from `.env`; store the secret key in Vault as `secret_key`; `scripts/sqltest.ts` skeleton | `select version()` ≥ 15.1.1.61 (needed for second-level pg_cron [V]); `supabase secrets list` shows every REQ key; sqltest runs one trivial assert | sqltest smoke |
| **B1** (1 h) | Contracts v1.0.0 in `packages/shared/src/contracts/*` exactly as `api-contracts.md`; fixtures; `index.ts` exports; add missing event payloads; **freeze** | `pnpm -r typecheck` green; every fixture parses; `EVENT_TYPES` exported; tag `contracts-v1.0.0` | vitest: fixtures valid, one invalid fixture per schema rejected, `z.toJSONSchema(AskAnswer)` snapshot |
| **B2** (1 h) | Migration 001: extensions (postgis, pg_cron, pg_net), enums, reference tables (§2.1), `profiles`, `private.app_role/my_operator_id/my_site_id`, RLS on every table; `supabase gen types` → `packages/shared/src/db.types.ts` | Security Advisor shows no "RLS disabled" on `public` tables; generated types compile | sqltest: operator JWT sees own profile only; FM sees all; anon sees nothing (`set local role` + `request.jwt.claims`) |
| **B3** (1 h) | Migration 002: scenario tables, `telemetry_readings`, `machine_state`, `operator_state`, `operator_gps_trail`, `weather_snapshots`, `fault_codes`, `task_history`, `shifts`, `tasks` + indexes + RLS | `scenario_frames` not selectable by any client role; indexes present | sqltest: frames hidden from OP/FM; OP reads only own telemetry; unique (run_id, frame_seq) rejects a duplicate |
| **B4** (1 h) | Migration 003: `event_types` (seeded from `EVENT_TYPES`), `events`, `private.emit_event`, fan-out trigger with `realtime.send` to `op:/site:/sup:` topics, `realtime.messages` select policies; `alerts`, `dispatches`, `alert_policies` seed; `my_snapshot` RPC (reads whatever exists) | emitting twice with one key yields one row; a private channel join as Ravi receives `op:{ravi}` and is refused `sup:{site}` | sqltest: idempotency, append-only (update raises), RLS per role; manual: two browser clients via a 20-line script |
| **B5** (1 h) | Migration 004: ledger: `incidents`, grants/revokes, mutation triggers, `private.canon_jsonb`, `private.ledger_canonical`, `private.ledger_append` (advisory lock), `ledger_verify`, Merkle functions, `ledger_roots`, `ledger_root_check`, `private.demo_tamper` | 3 appends chain correctly; genesis = 64 zeros; verify ✓; edit → verify ✗ at that seq; rehash → verify ✓ and root check ✗ | sqltest: all of the above + idempotent append + 2 concurrent appends via two connections get seq n, n+1; vitest: TS canonical mirror = SQL output for 5 golden vectors (Hindi text, nested context, nulls) |
| **B6** (1 h) | Generator v1 (`scripts/generator/`, Python + uv, numpy `default_rng(seed)`): 3 sites, zones, 20 real Cat models, 30 operators; **demo scenario frames** (Nagpur quarry, 8 h shift, EXC-007 seatbelt-off-on-slope at 00:40, EXC-014 hydraulic drift near on-foot Ravi at 01:30, PPE vest missing at 00:00, ~10 s frames for the 2 demo machines); organiser-format CSV writer | deterministic: same seed → identical files (hash printed); CSV headers exactly the organiser's 9 and 7 fields | pytest: determinism, header match, drift present in frames, no label columns in frames |
| **B7** (1 h) | Generator v2: 30-day DB history + 90-day files; hidden effects (interactions, noise, outliers) not given to the detector; injected labelled anomalies → `injected_labels.csv`; `task_history` with train/calib/test split; Open-Meteo archive weather for the 3 sites [V endpoint `archive-api.open-meteo.com/v1/archive`] with synthetic fallback | anomaly rate 2-5 %; every anomaly type present ≥ 20 times in days 21-30 | pytest: label/type counts, split sizes, weather fallback path |
| **B8** (1 h) | `scripts/seed.ts`: load reference data, history, scenario `review1`, labels into `private.injected_labels`, auth users (Ravi operator, Anita fleet_manager, a trainer) via the admin API, profiles, protocol cards (hydraulic_fault, fire, proximity) and lessons; organiser CSVs if present in `docs/brief/data/` | re-runnable (upserts); prints row counts and `pg_database_size` < 300 MB else fails; demo logins work | sqltest: counts; RLS smoke as each seeded user |
| **B9** (1 h) | Scenario engine: `private.run_*` (new_run, play, pause, set_speed, jump_to, inject_frame), `private.scenario_tick`, `private.apply_frame`, `private.heartbeat` + pg_cron `'1 seconds'`, `clock` + `machines` broadcasts, cron log cleanup job | at 60× an 8 h shift plays in 8 min; pause freezes `sim_now`; new_run replays identically (same telemetry hash per frame); overlapping heartbeat is skipped | sqltest: tick applies exactly the due frames; double tick is a no-op; jump applies skipped frames with catch-up suppression |
| **B10** (1 h) | Rule detectors in `private.detect_rules(frame)`: seatbelt off while moving (critical on slope), overspeed vs zone, slope exceeded, idle excess (≥ 40 % / ≥ 50 % [R]), cold over-rev, harsh operation, warning ignored, fault with continued operation, proximity zones; explanation features (numbers, ₹ cost) | the demo seatbelt frame produces exactly one `safety.seatbelt_breach` + one ledger entry | sqltest: one positive and one negative case per rule; re-applied frame emits nothing new |
| **B11** (1 h) | EWMA detector (`private.detector_state`, λ 0.2, 3σ, warm-up 30, 2 consecutive) + fleet baseline from days 1-20; Guardian (`ST_DWithin`, 50 m / 15 m, bearing, wind) + protocol card id | the EXC-014 drift raises `anomaly.detected` then `guardian.hazard_near_operator` with distance ≈ scenario value ± 2 m | sqltest: drift detected within N samples; stable series never alarms; Guardian respects radius |
| **B12** (1 h) | Alert engine: `private.raise_alert` (dedupe, lower-tier suppression, rate cap, catch-up), `alert_ack` RPC (CAS), `private.escalations_due` (CAS), `private.can_call_operator` (motion lock, cooldown), `private.requeue_stuck_dispatches` | duplicate breach → `occurrences = 2`, one dispatch; moving operator → dispatch `suppressed (motion_lock)`; SOS escalates once at 60-61 s (measure jitter) | sqltest: each budget rule; ack vs escalation race (two sessions) ends in exactly one state; motion-lock matrix (on foot / parked / moving) |
| **B13** (1 h) | Edge Function `dispatch` (CAS `queued→sending`, templates hi/en, dry-run mode) + Telegram adapter (`sendMessage` with inline Acknowledge, `sendLocation`, `editMessageText`); `telegram-webhook` (secret header, `update_id` dedupe, `answerCallbackQuery`, `alert_ack`); `scripts/telegram-setup.ts` (`setWebhook` with `secret_token`, `getWebhookInfo`) | SOS in dry-run records `dry_run`; live: Anita's phone gets the message and the button acknowledges within 2 s; a replayed update is ignored | vitest: payload builders, callback parsing, secret check; live check script |
| **B14** (1 h) | Twilio adapter: `calls.create` with inline `Twiml` (Hindi `<Say>` + `<Gather>`), `StatusCallback`; `twilio-voice` (signature validation, Digits=1 → `alert_ack`, status → `dispatch.*` events); re-check motion lock before calling | a real call reaches the verified demo phone; pressing 1 acknowledges; `no-answer` retries once after 60 s; XML response content type confirmed (the [U] in event-pipeline §9) | vitest: TwiML builder ≤ 4,000 chars [V], signature check against a known-good vector (from Twilio's docs if one is published [U], else captured from the first live callback); live call once (trial minutes) |
| **B15** (1 h) | Operator/FM RPCs: `task_start` (PPE gate, override check, ETA store), `task_pause`, `task_complete`, `ppe_override` (ledger), `sos_raise`, `sos_cancel`, `incident_log`, `lesson_complete`, `replay_submit`, `lesson_assign`, `consent_set`; Edge Function `director` (FM JWT + secret, maps DirectorCommand → `private.run_*`, `ledger_checkpoint`, `demo_tamper`, `set_dry_run`) | every RPC idempotent on `p_request_id`; wrong role → `forbidden`; PPE flow and override flow match event-pipeline §4 | sqltest per RPC (happy, forbidden, repeat); vitest: director command parsing + constant-time compare |
| **B16** (1 h) | ETA: `packages/shared/src/eta/model.ts` (pure) + `scripts/eta-fit.ts` (OLS on log time, split-conformal q90) → `model.v1.json`; evidence rows `eta.mae.model`, `eta.mae.organiser`, `eta.p90_coverage`; seed p50/p90 for scenario tasks | model MAE < organiser-estimate MAE on the test split, or we report honestly that it is not; P90 coverage on test within 0.85-0.95 | vitest: determinism, factor bars multiply to p50/base, monotonic in heat for the hot band |
| **B17** (45 m) | Evidence + ledger jobs: `private.evaluate_detectors()` (replay days 21-30 through the SQL detectors into a scratch run, join labels afterwards) → precision/recall per anomaly type; `ledger-daily-root` cron + `ledger_publish_root` → Telegram dispatch | evidence card rows exist per anomaly type with n; a checkpoint message arrives in Telegram with root + head | sqltest: evaluator never reads labels before detection finishes (function order), metrics bounded 0-1 |
| **B18** (1 h) | RAG ingest `scripts/rag-ingest.ts`: chunk by heading (200-500 tokens), images as separate records; Voyage `voyage-multimodal-3.5` dense (1024) [V], Pinecone inference `pinecone-sparse-english-v0` sparse [V]; create index (dotproduct, us-east-1 [V]); upsert with `audience`, `safety_critical`, `lang`; mirror to `kb_chunks` | index count = `kb_chunks` count; a sample hybrid query returns a known chunk top-3 | vitest: chunker; live: 3 known-answer queries |
| **B19** (1 h) | Edge Function `ask`: the pipeline in event-pipeline §6, fetch adapters (Groq, Gemini, Voyage, Pinecone), fallback chain, citation gate, refusal, prompt-injection wrapping, `ask_logs`, rate cap | photo question returns 3 steps with a valid citation in ≤ 8 s p95 [A]; a question with no evidence is refused; forced Groq 429 falls back to Gemini | vitest: gate (invented citation id → refused), injection fixtures (instructions inside a chunk / inside image text are ignored) |
| **B20** (30 m) | RAG eval: 20 questions × 3 roles subset, hit@5 and faithfulness (citation-supported steps), written to `evidence_metrics` | numbers on the evidence card with n = 20 | the eval script itself |
| **B21** (45 m) | `scripts/demo-check.ts`: pre-flight (pg_cron alive, `getWebhookInfo`, Twilio balance/verified numbers, Pinecone/Voyage/Groq reachability, DB size) + the six flows headless in dry-run; defenso `guard_code` on auth/DB/env/request-body code; Supabase security + performance advisors | all six flows green in dry-run; advisors clean or waived in writing | the script |

Total ≈ 20.5 task-hours. With implementation subagents running the parallel lane (below) the Track B
wall-clock is ≈ 14 h. **Cut line if behind at H14:** B20 moves after review 1 (RAG eval shown as
"in progress"), B17's daily cron (keep the checkpoint), the EWMA fleet-baseline half of B11 (keep the
per-machine EWMA).

## 2. Critical path

```
Shlok provisions (§4) → B0 → B1 (freeze) → B2 → B3 → B4 → B9 → B10 → B11 → B12 → B13 → B14 → B15 → B21 → joint dry run
                                   ≈ 0.75 + 11 + 0.75 = 12.5 h
Parallel lane (subagents, disjoint files):
  B6 → B7 → B8 (must land before B10's scenario assertions; B9 can start on a hand-made 20-frame fixture)
  B5 (ledger) any time after B4 · B16 (ETA) any time after B1 · B17 after B8 + B11 · B18 → B19 → B20 after B1
```
Longest dependency chain touching an external party: Telegram (B13) and Twilio (B14) need the
supervisor to have pressed Start on the bot and both demo phones verified in Twilio **before H10**.

## 3. Where Track F integrates

| IP | When (Track B hour) | Track B delivers | Track F switches to |
|---|---|---|---|
| IP0 | ≈ H2 (after B1) | frozen `@cat/shared` contracts + fixtures | build every screen against fixtures |
| IP1 | ≈ H6 (after B4 + B8) | real schema, RLS, seeded logins, `my_snapshot`, Realtime topics | supabase-js reads, sign-in for Ravi/Anita, channel joins |
| IP2 | ≈ H9 (after B9-B11) | live clock, `machines` frames, anomalies, Guardian events | cockpit hero card, map, anomaly table live; `/director` page calls `director` |
| IP3 | ≈ H11 (after B12, B15) | alerts, `alert_ack`, task/PPE/SOS RPCs, ledger verify | alert tiers UI, SOS hold-to-arm, PPE flow, supervisor inbox, Verify ledger |
| IP4 | ≈ H13 (after B13-B14) | real Telegram + Twilio (dry-run toggle) | nothing new in UI; joint live test of flows 2, 3 |
| IP5 | ≈ H15 (after B16-B17) | `estimateEta`, `evidence_metrics` | "why this estimate", what-if slider, evidence card |
| IP6 | ≈ H17 (after B19) | `ask` function | Ask Spotter screen with photo |
| Dry run | ≈ H18 | `demo-check.ts` green | full 5-minute script twice, once with dry-run off |

## 4. What Shlok must provision before Track B starts (blocking B0)

1. **Supabase** project in Mumbai: fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`;
   tell us the plan (Free assumed: 500 MB DB limit [V]); Realtime Settings → switch off "Allow public
   access" (private channels only [V]).
2. **Twilio**: SID, auth token, trial number; **both demo phones added as Verified Caller IDs**; India
   enabled in Voice geo permissions [R]; note the remaining trial credit.
3. **Telegram**: bot token; Anita's phone opens the bot and presses Start; chat id filled;
   `TELEGRAM_WEBHOOK_SECRET` generated.
4. **Groq** key(s) in one organisation [R]; **Google AI Studio key** for the Gemini fallback (new env var
   `GOOGLE_GENERATIVE_AI_API_KEY`; add to `.env.example`); **Pinecone** and **Voyage** keys.
5. `DEMO_DRIVER_SECRET`.
6. **The organiser's sample dataset files** into `docs/brief/data/` (the folder is empty today; the
   column mapping in data-model §1 is an assumption until then).
7. **RAG corpus**: the safety/procedure documents (with licence notes) into `docs/brief/data/kb/`.
8. **TTS decision** for pre-generated Hindi clips (ADR-002; Sarvam was dropped; Azure Speech F0 is
   the researched option [R]). Not blocking B0; blocking the alert audio by ≈ H11.
9. Approve two build-time installs: Supabase CLI and uv (neither is on the laptop today [V]).
10. Create the Track B worktree from `main` (the repo has commits and only the main worktree today [V]).
