# Data model (Postgres 17 on Supabase, Mumbai)

Status: Proposed with ADR-001, **revision 2 after gate G2** (findings are cited as `G2-n` for the
backend review and `PA-n` for the program review; dispositions are in ADR-001). Owner: Track B.
Migrations land in `supabase/migrations/` in the order of `backend-tasks.md`. Markers: **[V]** verified,
**[R]** from research 10-15, **[A]** assumption, **[U]** unverified.

## 0. Conventions

- Schemas: `public` (exposed to the Data API, RLS on every table), `private` (functions, held-out labels,
  detector state, queues; **not** exposed), `eval` (sandbox for detector evaluation; not exposed, no
  triggers to live tables; G2-2), `extensions` (postgis, pg_net), `cron`, `vault`, `realtime`.
- Keys: `uuid primary key default gen_random_uuid()` unless noted; high-volume streams use
  `bigint generated always as identity`. Business codes (`EXC-014`, `OP-0007`) are `unique text`.
- Time: `timestamptz`. Scenario rows carry **simulated** time in `ts`/`sim_ts`; `recorded_at` is always
  wall-clock `now()`. Timers (SOS, escalation, alert windows, rate caps) use **wall-clock only** (G2-8c:
  human attention runs on wall time at any scenario speed).
- Geometry: `extensions.geography(Point, 4326)` / `(Polygon, 4326)`; GIST index on every geography
  column. Distances in metres via `ST_DWithin` [R] research 10 §6.
- Every scenario-produced row carries `run_id` (FK `scenario_runs`); `run_id is null` = historical
  generated data. A new demo run is a new `run_id`. **Rehearsal runs** (`scenario_runs.rehearsal = true`)
  are purged by `private.purge_run(run_id)` to keep the database small (G2-15); the ledger is never
  purged (§4.7).
- Writes from clients go only through `security definer` RPCs with `set search_path = ''`, an explicit
  role check, and `set lock_timeout = '2s'`. Tables grant clients `select` only, where a policy allows.
- RLS helpers (in `private`, `stable`, `security definer`), always wrapped as `(select …)` inside
  policies [A: Supabase RLS performance guidance, confirmed in task B2 against the
  `supabase-postgres-best-practices` skill]: `private.app_role() → app_role`,
  `private.my_operator_id() → uuid`, `private.my_site_id() → uuid`.

Enums (Postgres `create type … as enum`; **generated** from `packages/shared` by
`scripts/gen-sql-enums.ts`, so contracts are the single source, G2-9):
`app_role` (operator, fleet_manager, trainer) · `alert_tier` (info, caution, warning, critical) ·
`skill_level` · `task_type` · `task_status` (planned, in_progress, paused, completed, cancelled,
blocked_ppe) · `weather_kind` · `fault_severity` (info, caution, derate, shutdown) [R] ·
`run_status` (ready, playing, paused, finished) · `frame_kind` (telemetry, gps, operator_state, weather,
fault, ppe) · `alert_status` (open, acknowledged, escalating, escalated, resolved, suppressed) ·
`dispatch_channel` (telegram, twilio_voice) · `dispatch_status` (queued, sending, sent, delivered,
answered, no_answer, failed, suppressed, dry_run) · `incident_type` (seatbelt_breach, guardian_hazard,
sos, ppe_override, near_miss, first_aid, property_damage, manual, correction) ·
`audience` (operator, site, supervisor, trainer).

Roles in the RLS matrices: **OP** operator, **FM** fleet_manager, **TR** trainer, **SVC** service
(Edge Functions with the secret key → `service_role`, bypasses RLS [V], still obeys grants).
"RPC" = write only via a named security-definer function. "—" = no access.

## 1. Organiser dataset mapping

The files are not in the repo yet (`docs/brief/data/` holds only `.gitkeep`). **[A]: this mapping uses
the column names in the problem statement; units, vocabularies and the meaning of "Idling time" are
confirmed against the sample in task B6.**

Telemetry dataset (9 fields) → `telemetry_readings`:
| Organiser field | Column | Notes |
|---|---|---|
| Timestamp | `ts` | IST if no offset [A] |
| Machine ID | `machines.code` → `machine_id` | unknown codes upserted with `assumed = true` |
| Operator ID | `operators.employee_code` → `operator_id` | same rule |
| Engine hours | `engine_hours numeric(10,2)` | cumulative hour meter [A] |
| Fuel used | `fuel_used_l numeric(10,2)` | litres, cumulative per shift [A] |
| Load cycles | `load_cycles int` | cumulative per shift [A]; also the **progress source** (§2.2) |
| Idling time | `idle_hours numeric(10,2)` | **[A] cumulative hours; may be minutes per interval** |
| Seatbelt status | `seatbelt_fastened boolean` | maps "Fastened/Unfastened", "Yes/No", 1/0 [A] |
| Safety alerts | `organiser_safety_alert text` (raw) | loader also emits `safety.organiser_alert` per non-empty value |

Task-time dataset (7 fields) → `task_history`: Task ID → `external_ref`; Task type → `task_type`;
Weather → `weather` (+ `weather_raw`); Operator skill → `operator_skill`; Machine age →
`machine_age_years` [A years]; Estimated time → `organiser_estimate_min` [A minutes]; Actual time →
`actual_min` [A minutes].

Every other column is an **assumed sensor** or **synthetic** field; `packages/shared` exports
`ASSUMED_FIELDS` per table for the UI's "assumed" chip.

## 2. Tables

### 2.1 Reference

**sites**: `id`, `code unique`, `name`, `site_type`, `location geography(Point)`, `elevation_m`,
`timezone default 'Asia/Kolkata'`. GIST(location).

**zones**: `id`, `site_id`, `name`, `zone_type` (work, hazard, no_go, parking, walkway, fuel),
`boundary geography(Polygon)`, `max_speed_kmh`, `max_slope_deg`. GIST(boundary).

**machine_models**: `id`, `code unique`, `name`, `machine_type`, `rated_rpm`, `idle_fuel_lph`,
`work_fuel_lph`, `baseline_idle_pct default 25` [R] research 11 §4.1.

**machines**: `id`, `code unique`, `model_id null`, `serial_number`, `manufacture_year`, `home_site_id`,
`service_status`, `assumed boolean default false`.

**operators**: `id`, `employee_code unique`, `display_name`, `skill_level`, `experience_hours`,
`preferred_language check in ('en','hi','ta')`, `site_id`, `contact_ref text` (name of an Edge Function
secret such as `DEMO_OPERATOR_PHONE`; phone numbers never enter the database), `pseudonym text unique`
(e.g. `Operator-7F2`, used by the near-miss view).

**profiles**: `user_id pk → auth.users`, `role app_role`, `operator_id null` (required for operator),
`site_id`, `display_name`, `language`.

**operator_pairings** (M10 "pair a machine", G2-14/PA-8): `run_id`, `operator_id`, `machine_id`,
`paired_at`, `unpaired_at null`. Unique (run_id, operator_id) where `unpaired_at is null`. RPC `pair_machine`.

**protocol_cards** (fixed, reviewed; never LLM-generated): `id text pk`, `fault_type`, `version`,
`steps jsonb` (`{"en":[…],"hi":[…],"ta":[…]}`), `audio_paths jsonb`, `source_refs text[]`,
`reviewed_by`, `reviewed_at`.

**event_types** (generated seed, never hand-edited; G2-9): `type text pk`, `default_tier`,
`ledger boolean`, `raises_alert boolean`, `alert_kind text null`, `audiences audience[]`,
`lesson_code text null`, `replay boolean`. Written by `scripts/gen-sql-seed.ts` from `EVENT_REGISTRY`
(api-contracts §3); B4's test compares the table with the registry.

**alert_policies** (generated seed from `ALERT_POLICIES` in contracts): `kind text pk`,
`hazard_group text` (seatbelt, guardian:{machine}, proximity, ppe, machine_health, idle, sos, ledger,
flood), `tier_default`, `dedupe_window_s` (wall), `ack_timeout_s null`, `escalate_to text[]`,
`rate_capped boolean` (true only for info/caution kinds), `needs_ack`.

**app_config** (single row): `demo_mode`, `dry_run_external`, `guardian_radius_m 50`,
`danger_radius_m 15`, `motion_speed_kmh 0.5`, `state_stale_s 10`, `max_frames_per_tick 200`,
`checkpoint_every_min 30`.

RLS (2.1): OP/FM/TR select (profiles: OP own row; FM, TR all). `app_config`: FM select. No client writes
except `pair_machine` (RPC).

### 2.2 Shifts, tasks, task history

**shifts**: `id`, `run_id null`, `operator_id`, `machine_id`, `site_id`, `shift_type`,
`scheduled_start/end`, `actual_start/end`, `status`.

**tasks**: `id`, `run_id`, `shift_id`, `external_ref`, `operator_id`, `machine_id`, `site_id`,
`zone_id null`, `task_type`, `planned_start`, `status task_status`, `started_at`, `paused_at`,
`completed_at`,
`planned_cycles int` (from the generator: expected load cycles for the task),
`cycles_at_start int null`, `progress_pct numeric(5,2) default 0`,
`eta_p50_min`, `eta_p90_min`, `eta_model_version`, `eta_factors jsonb` (**array** of
`{key, multiplier, assumed}`, same shape as `EtaFactor`; G2-9), `ppe_override_id → ppe_overrides null`,
`updated_at`. Index (run_id, operator_id, planned_start).
**Progress source (G2-14):** `apply_frame` for a telemetry frame of the machine paired with the task's
operator, while the task is `in_progress`, sets
`progress_pct = least(100, (load_cycles - cycles_at_start) * 100.0 / planned_cycles)` and emits
`task.progress` at every 10 % step. `task_start` stores `cycles_at_start` from `machine_state`.
RLS: OP own; FM, TR all. Writes: RPC.

**ppe_overrides**: `id`, `task_id`, `operator_id`, `granted_by uuid`, `reason text`, `missing text[]`,
`granted_at`, `valid_until` (+15 min), `ledger_queue_id → private.ledger_queue`. RLS: OP own, FM all.

**task_history**: `id`, `external_ref`, `source` (organiser, synthetic), `task_type`, `weather`,
`weather_raw`, `operator_skill`, `machine_age_years`, `organiser_estimate_min`, `actual_min`; assumed:
`operator_id`, `machine_id`, `site_id`, `started_at`, `temperature_c`, `wind_kmh`, `humidity_pct`,
`material`, `shift_hour`, `split` (train, calib, test). Unique (source, external_ref).
RLS: FM, TR select; OP own. View **`v_task_analytics`** (avg actual by task_type × weather, bias =
mean(actual − estimate) for organiser and model; PA-8) owned by task B16.

### 2.3 Scenario engine

**scenarios**: `id`, `code unique` (`review1`), `seed`, `site_id`, `shift_start_sim`, `duration`,
`frame_count`, `generator_version`.

**scenario_frames** (the sensor feed, raw values only, no events, no labels): PK (scenario_id, seq),
`sim_offset_ms`, `kind frame_kind`, `machine_id null`, `operator_id null`, `payload jsonb`.
Index (scenario_id, sim_offset_ms). RLS: no client access.

**scenario_runs**: `id`, `scenario_id`, `status`, `speed smallint check in (1,10,60)`, `sim_anchor`,
`wall_anchor`, `cursor_seq int default 0`, `catchup_until_seq int null` (set by `jump_to`; G2-5),
`is_current boolean` (partial unique where true), `rehearsal boolean default true` (the live demo run is
created with `false`), `dry_run_external boolean`, `created_by`, `created_at`.
`sim_now = sim_anchor + (now() - wall_anchor) * speed` while playing. RLS: all select; writes via
`director`.

**private.tick_log** (G2-16): `id`, `run_id`, `started_at`, `frames int`, `duration_ms int`,
`errors int`, `lag_sim_ms bigint`. Kept 24 h. Read by `demo-check` (p95/max).

**private.tick_errors**: `id`, `run_id`, `frame_seq`, `sqlstate`, `message`, `at`. A frame whose
detector raises is logged here and skipped (the tick keeps going; G2-1).

### 2.4 Telemetry and live state

**telemetry_readings**: `id bigint identity`, `run_id null`, `frame_seq null`, `machine_id`,
`operator_id null`, `ts`, the 9 organiser fields (§1), assumed: `rpm`, `engine_load_pct`,
`coolant_temp_c`, `hydraulic_temp_c`, `hydraulic_pressure_bar`, `speed_kmh`, `pitch_deg`, `roll_deg`,
`parking_brake`, `fuel_level_pct`, `def_pct`, `location`. Unique (run_id, frame_seq).
Index (machine_id, ts), (run_id, machine_id, ts) where run_id is not null, BRIN(ts), GIST(location).
RLS: OP where `operator_id = me`; FM all; TR —.

**machine_state** (latest per machine per run): PK (run_id, machine_id), `ts`, `speed_kmh`,
`moving boolean`, `parking_brake`, `seatbelt_fastened`, `operator_id null`, `pitch_deg`, `roll_deg`,
`location`, `hydraulic_temp_c`, `coolant_temp_c`, `load_cycles`, `health` (ok, caution, fault),
`active_anomaly_ids uuid[]`, `updated_at`. RLS: all select.

**operator_state**: PK (run_id, operator_id), `ts`, `location`, `on_foot boolean null`,
`in_cab_machine_id null`, `ppe jsonb`, `updated_at`. RLS: OP own; FM all.

**operator_gps_trail**: `id bigint identity`, `run_id null`, `operator_id`, `ts`, `location`,
`speed_kmh`, `accuracy_m`. RLS: OP own; FM all (DPDP s.7 workplace safety [R]); TR —. Retention 90 days.

**weather_snapshots**, **fault_codes**: as in revision 1 (site/machine keyed, all roles select).

### 2.5 Detection

Detectors are split into **pure functions** and an **effects layer** (G2-2):
- `private.detect_rules(frame jsonb, state jsonb, cfg jsonb) returns setof finding` and
  `private.detect_ewma(prev private.detector_state, x numeric, cfg jsonb) returns (next_state, finding)`
  are `immutable`, write nothing, raise nothing (every division guarded: `sd = 0` → no finding).
- `private.apply_findings(run_id, findings)` (live only) writes `anomalies`, emits events, raises alerts,
  enqueues ledger entries.
- The evaluator uses only the pure functions (§2.5.2).

**Rules in P0** (cut list: the rest move to P1, see backend-tasks §5): `seatbelt_off_moving` (critical when
pitch/roll > zone `max_slope_deg`), `overspeed` (zone `max_speed_kmh`), `slope_exceeded`,
`idle_excess` (≥ 40 % caution, ≥ 50 % warning over a rolling 60-min sim window [R]),
`fault_continued_operation`, `proximity_person_machine` (awareness/warning/danger rings).
**EWMA in P0:** per machine only (λ 0.2, 3σ, warm-up 30, 2 consecutive) on `hydraulic_temp_c`,
`coolant_temp_c`; fleet baseline → P1.

**private.detector_state**: PK (run_id, machine_id, metric), `n`, `ewma`, `ewvar`, `last_ts`,
`in_alarm`, `consecutive`.

**anomalies**: `id`, `run_id null`, `machine_id`, `operator_id null`, `anomaly_type`, `method`,
`ts_start`, `ts_end`, `severity_score`, `features jsonb` (numbers), **`location geography(Point)`**
(G2-14), `event_id`. RLS: OP where own or `operator_id is null`; FM, TR all.

**private.injected_labels** (the answer key): `id`, `machine_id`, `anomaly_type`, `ts_start`, `ts_end`,
`generator_version`. Read only by `eval.score()`.

#### 2.5.1 Evidence metrics

**evidence_metrics**: `metric_key`, `value`, `n`, `details jsonb`, `dataset_version`, `model`,
`computed_at`. Keys (PA-2):
`detector.precision.{type}`, `detector.recall.{type}` · `eta.mae.model`, `eta.mae.organiser`,
`eta.p90_coverage` · **`fleet.idle_pct`, `fleet.idle_pct.by_model`** · **`loop.repeat_rate.assigned`,
`loop.repeat_rate.control`** (synthetic cohort from the generator, labelled "how we would measure") ·
`rag.hit_at_5`, `rag.faithfulness` (only rows where `model` = the primary; G2-18).
RLS: all select.

#### 2.5.2 Evaluation sandbox (G2-2)

Schema `eval` is **created and dropped by `scripts/eval.ts`** (it is not part of the app migrations):
`eval.telemetry` (copy of history days 21-30, loaded in day-sized chunks), `eval.findings`, `eval.detector_state`. `eval.run_day(date)` calls the same pure
`private.detect_*` functions and writes **only** to `eval.*`. `eval.score()` joins `eval.findings` with
`private.injected_labels` after all days ran, writes `evidence_metrics`, then `truncate eval.telemetry,
eval.findings, eval.detector_state`. No trigger, no `emit_event`, no ledger, no Realtime, no dispatch
can be reached from `eval`. Run from `scripts/` over a direct connection (not pg_cron), one day per call,
so each statement stays under the 2-min `postgres` cap [V per G2 review].

### 2.6 Events, alerts, dispatches: §3 · 2.7 Ledger: §4

### 2.8 Training, Replay and the Loop (G2-14, PA-1)

**lessons**: `id`, `code unique` (`seatbelt_slopes`, `faulty_machine_nearby`), `title jsonb`,
`video_paths jsonb`, `quiz jsonb`, `topic_event_types text[]`.

**lesson_assignments**: `id`, `operator_id`, `lesson_id`, `because_event_id null`, `assigned_at`,
`completed_at`, `quiz_score`. Unique (operator_id, lesson_id, because_event_id).

**replay_templates**: `event_type text pk` (P0: **`guardian.hazard_near_operator` only**, cut list #7),
`steps jsonb` (3-4 steps; each: prompt i18n, options with `id`, `correct_option`, `weight`,
`time_limit_ms`), `version`.

**replay_scenarios**: `id`, `source_event_id unique`, `operator_id`, `template_version`,
`scenario_json jsonb` (validated by `ReplayScenario` in contracts): site map snapshot (zones within
300 m), the operator's GPS trail for the 10 sim-minutes before the event, machine positions and health at
`sim_ts`, wind at `sim_ts`, the faulty machine, the operator's real response time (event → ack), the
steps from the template.

**replay_attempts**: `id`, `replay_id`, `operator_id`, `started_at`, `completed_at`,
`outcome_score` (Σ weight of correct choices / Σ weights × 100), `process_score` (100 × share of steps
answered within `time_limit_ms`, minus 25 if steps were answered out of order), `choices jsonb`.

**Loop builder (task B10b):** `private.loop_on_event(event)`, called by `apply_findings` and the RPCs
after an event commits (via the events insert trigger, **not** inside the tick's detector subtransaction):
if `event_types.lesson_code` is set → insert `lesson_assignments` (idempotent unique) + emit
`training.lesson_assigned`; if `event_types.replay` → `private.build_replay(event_id)` → insert
`replay_scenarios` + emit `training.replay_ready`. Demo beat 4 replays **Ravi's Guardian near-miss with
EXC-014** (step 3 of the demo); the seatbelt breach assigns the `seatbelt_slopes` lesson only.

RLS: OP own (writes via `lesson_complete`, `replay_submit`); TR all + `lesson_assign`; FM select
aggregates via `evidence_metrics` only (training records are non-punitive).

### 2.9 Ask Spotter (RAG)

**kb_documents**, **kb_chunks** (mirror of Pinecone records; used to display citations and to run the
**verbatim-rule check**, G2-13), **ask_logs** (`model`, `fallback_used`, `prompt_tokens`, `latency_ms`,
`refusal_reason`). RLS: kb_* where role ∈ `audience`; ask_logs own; writes SVC.

**private.ask_rate** (G2-6): `user_id`, `window_start`, `count`; global row `user_id = null` for the
org-wide breaker (≤ 20 asks/min across all users).

### 2.10 Privacy

**consents** (OP own via `consent_set`; FM select). Near-miss mode (PA-8): FM's policy on `incidents`
excludes `non_punitive = true` rows; FM reads them through RPC `near_miss_list()` which returns
`operators.pseudonym` instead of the operator id. `ledger_verify` (security definer) still covers every
row.

## 3. Events, alerts and dispatches

### 3.1 `events`: the single source of truth

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| seq | bigint identity unique | UI order |
| run_id | uuid null | |
| type | text → event_types | from `EVENT_REGISTRY` |
| tier | alert_tier null | |
| sim_ts / recorded_at | timestamptz | sim / wall |
| site_id, machine_id, operator_id, task_id, alert_id | uuid null | |
| **audiences** | audience[] | from the registry; drives **both** RLS and Realtime topics (G2-19) |
| source | text | `detector.rule`, `detector.ewma`, `guardian`, `user`, `director`, `system`, `telegram`, `twilio`, `loader` |
| payload | jsonb (object) | zod-validated at every edge |
| correlation_id, causation_id | uuid | |
| idempotency_key | text unique | |

Append-only for API roles (`update`/`delete` revoked from `anon`, `authenticated`, `service_role`).
Only `private.purge_run` (owner) deletes, and only rows of `rehearsal` runs.
RLS (one rule per audience, mirroring topics exactly):
OP: `'operator' = any(audiences) and operator_id = me` **or** `'site' = any(audiences) and site_id = my site`;
FM: `site_id = my site`; TR: `'trainer' = any(audiences)`.
**Fan-out** (after insert): one `realtime.send(envelope, type, topic, true)` per audience:
`operator` → `op:{operator_id}`, `site` → `site:{site_id}`, `supervisor` → `sup:{site_id}`,
`trainer` → `train:{site_id}`. `realtime.messages` select policies grant each topic prefix to exactly the
same roles as the RLS above, so table and broadcast cannot disagree.

Idempotency keys: detector `det:{run_id}:{machine_code}:{rule}:{frame_seq}` · client RPC
`rpc:{function}:{request_id}` · Telegram `tg:{update_id}` · Twilio `tw:{CallSid}:{CallStatus}` /
`tw:{CallSid}:digits` · director `dir:{request_id}` · system `sys:{job}:{bucket}`.

### 3.2 `alerts`

`id`, `run_id`, `origin_event_id`, `kind`, `hazard_key text` (`{hazard_group}:{operator_id}:{subject}`,
e.g. `guardian:ravi:EXC-014`), `tier`, `status`, `operator_id`, `machine_id`, `site_id`,
`occurrences`, `first_seen`, `last_seen`, `needs_ack`, `ack_by`, `ack_at`, `ack_via`,
`escalate_at` (wall), `escalation_level`, `suppressed_by null`, `suppress_reason null`,
`protocol_card_id null`, `tier_history jsonb` (upgrades), `updated_at`.
Indexes:
- **`unique (hazard_key) where status in ('open','acknowledged','escalating') and kind <> 'sos'`**:
  dedupe for everything except SOS; every SOS is its own alert (G2-3).
- `(escalate_at) where status = 'open' and escalate_at is not null` (timer scan).
- `(operator_id, status)`.
Budget semantics (G2-8) are specified in event-pipeline §7. RLS: OP own; FM all; TR —.

### 3.3 `dispatches` (outbox)

`id`, `alert_id null`, `purpose` (alert, escalation, ledger_checkpoint, flood_summary, reminder),
`channel`, `recipient_ref` (secret name), `recipient_role`, `escalation_level smallint`,
`attempts smallint default 0`, `status`, `body jsonb` (template id + params + language),
`provider_ref text null` (CallSid / message_id), `sending_at`, `error jsonb`, `created_at`, `updated_at`.
**Unique (coalesce(alert_id, root/flood subject id), purpose, channel, recipient_role, escalation_level)**
(`flood_summary` rows carry a `subject_id` = the flood alert id, so they deduplicate too; G2-8d).
Attempts are a counter on the same row, never a new row (G2-10).
Kick: `after insert or update of status on dispatches for each row when (new.status = 'queued')` →
`net.http_post(url, body {dispatch_id}, headers {apikey from Vault}, timeout_milliseconds := 20000)` [V
pg_net signature; default 2000 ms is too short, G2-10].
Requeue: the `dispatch-requeue` job sets `status = 'queued', attempts = attempts + 1` for rows in
`sending` for > 30 s with `provider_ref is null` and `attempts < 2` (the update fires the kick).
Rows with a `provider_ref` are never re-sent; `dispatch` polls the provider instead.
RLS: FM select; others —.

**private.telegram_callback(update_id, chat_id, alert_id)** (G2-11): one transaction: insert
`private.telegram_updates(update_id)` (conflict → return `duplicate`), check `chat_id` = the configured
supervisor chat (stored in Vault as `telegram_supervisor_chat_id`), then `private.alert_ack(alert_id,
'telegram', fm_user)`. Any failure rolls the dedupe row back, so Telegram's retry is processed.
Execute granted to `service_role` only.

## 4. Ledger design

### 4.1 Table `incidents`

Columns as revision 1 (`id`, `seq`, `idempotency_key`, `run_id`, `occurred_at`, `recorded_at`,
`incident_type`, `severity`, `site_id`, `operator_id`, `machine_id`, `lat numeric(9,6)`,
`lon numeric(9,6)`, `description`, `context jsonb`, `reported_by`, `reporter_kind`, `source_event_id`,
`supersedes_seq`, `non_punitive`, `prev_hash char(64)`, `entry_hash char(64)`, `canon_version`).
Append-only: revokes + mutation triggers + insert only via `private.ledger_write_one`.
RLS: OP own; FM all except `non_punitive` rows (§2.10); TR `incident_type = 'near_miss'` (pseudonymised
via the same RPC).

### 4.2 Ledger queue and writer (G2-1)

Nothing user-facing or tick-facing waits on the ledger lock:
- `private.ledger_enqueue(idempotency_key, entry jsonb) returns bigint` inserts into
  **`private.ledger_queue`** (`id bigint identity`, `idempotency_key unique`, `entry jsonb`,
  `enqueued_at`, `written_incident_id null`, `error text null`). No lock. Used by the tick, `sos_raise`,
  `ppe_override`, `incident_log`.
- pg_cron **`ledger-writer`** `'1 seconds'` → `private.ledger_drain(max 50)`: for each unwritten queue
  row, in its own subtransaction: `pg_advisory_xact_lock(4210001)` → `ledger_write_one` → mark written.
  The lock is held for microseconds per job run and never inside a user RPC or the tick.
- RPCs return `ledger_queue_id`; the UI shows the incident when `incident.logged` arrives (≤ 1-2 s).

### 4.3 Canonical serialisation v1: exact, byte-identical in SQL and TS (G2-12)

The canonical text is the UTF-8 encoding of a JSON object built as follows. Every rule below is
enforced by the validator in `ledger_write_one` **before** hashing, so both implementations only ever
see the restricted domain.
1. **Keys**: ASCII `[a-z0-9_]` only (validator), sorted by byte value, at every nesting level.
   Implementations must sort `[key, value]` pairs explicitly; never rely on JS object iteration order
   (integer-like keys reorder).
2. **Scalars**: every non-null, non-boolean value is a JSON **string**. JSON numbers are **rejected** in
   `context` (the context builder formats numbers as strings when the snapshot is taken, e.g.
   `"6.2"`), so no float conversion ever happens.
3. **Top-level fields** as strings: `seq`, `severity`, `v` = integer text (`bigint::text`, no padding);
   `lat`, `lon` = `numeric(9,6)::text` (always 6 decimals, e.g. `"21.146300"`; no `to_char`, so no
   leading space); `occurred_at`, `recorded_at` = `to_char(ts at time zone 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` (always 6 fractional digits); uuids lower-case.
   The TS side receives these as text from the view `public.v_ledger_canonical_input` and **never parses
   them into `Date` or `number`** (microseconds and precision are preserved).
4. **Strings**: validator rejects any code point < U+0020 (control characters). Escaping is then only
   `"` → `\"` and `\` → `\\`; all other characters, including Devanagari, are emitted raw as UTF-8.
5. **null**, **true**, **false** literal; arrays in stored order; no whitespace anywhere.
6. `entry_hash = lower-hex(sha256(utf8(canonical)))` via `encode(sha256(convert_to(c,'UTF8')),'hex')` [V].

**Golden vector 1** (computed 2026-09-23 with Python `json.dumps(ensure_ascii=False,
separators=(',',':'), sort_keys=True)`; SQL and TS must both reproduce it byte for byte in B5):
```
input:
{"v":"1","seq":"1","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000",
 "run_id":null,"occurred_at":"2026-09-23T08:15:02.123456Z","recorded_at":"2026-09-23T08:15:03.000001Z",
 "incident_type":"seatbelt_breach","severity":"4","site_id":"11111111-1111-4111-8111-111111111111",
 "operator_id":"22222222-2222-4222-8222-222222222222","machine_id":"33333333-3333-4333-8333-333333333333",
 "lat":"21.146300","lon":"79.088200","description":"सीटबेल्ट नहीं लगा, ढलान 17.4° \"B3\"",
 "context":{"speed_kmh":"6.2","pitch_deg":"17.4","zone":{"name":"Bench 3","max_slope_deg":"15"},
            "ppe":["helmet","vest"]},
 "reported_by":null,"reporter_kind":"detector","source_event_id":"44444444-4444-4444-8444-444444444444",
 "supersedes_seq":null,"non_punitive":false}
canonical (797 bytes):
{"context":{"pitch_deg":"17.4","ppe":["helmet","vest"],"speed_kmh":"6.2","zone":{"max_slope_deg":"15","name":"Bench 3"}},"description":"सीटबेल्ट नहीं लगा, ढलान 17.4° \"B3\"","incident_type":"seatbelt_breach","lat":"21.146300","lon":"79.088200","machine_id":"33333333-3333-4333-8333-333333333333","non_punitive":false,"occurred_at":"2026-09-23T08:15:02.123456Z","operator_id":"22222222-2222-4222-8222-222222222222","prev_hash":"0000000000000000000000000000000000000000000000000000000000000000","recorded_at":"2026-09-23T08:15:03.000001Z","reported_by":null,"reporter_kind":"detector","run_id":null,"seq":"1","severity":"4","site_id":"11111111-1111-4111-8111-111111111111","source_event_id":"44444444-4444-4444-8444-444444444444","supersedes_seq":null,"v":"1"}
entry_hash: b04bf3cbe21a368128e2f5eb4d7d0d8a3b3a8491f84998aa2869e3cb88b51181
```
**Golden vector 2** (chain link): same input with `seq "2"`, `prev_hash` = vector 1's hash,
`incident_type "sos"`, `severity "5"`, `description "SOS"`, `context {}` →
`db5217f0823bfc42c5c14ca00414c2c24da4dae60819589d7f63db77f03e065f`.
**Golden vector 3** (Merkle, §4.5): leaves = [v1, v2] → root
`603286c8575192d014b33463f312267d7dc8e7ab398b163959a91438e69b3574`.
[A] PostgreSQL's `to_json(text)` produces the same escaping as rule 4 for this domain; B5 proves it
against the vectors, and if it does not, the SQL canonicaliser implements rule 4 with `replace()`.

### 4.4 `public.ledger_verify(p_from, p_to)`

Walks by `seq`: continuity (`seq_gap`), link (`link_broken`), recomputed hash (`hash_mismatch`); plus
**head anchor** (G2-4): for the latest published checkpoint, the entry at `last_seq` must exist and have
`entry_hash = head_hash` (`anchor_mismatch`, which catches truncation or rewriting before the checkpoint).
Returns the first failure.

### 4.5 Merkle root and the external witness (G2-4)

- Leaf node `sha256(0x00 ‖ entry_hash bytes)`, parent `sha256(0x01 ‖ left ‖ right)`, odd node carried up,
  empty = `sha256('')`; ordered by `seq`.
- **Checkpoint** (demo and every `checkpoint_every_min` while `demo_mode`; the daily job is cut to P1):
  `private.ledger_checkpoint()` computes `(first_seq, last_seq, leaf_count, root_hex, head_hash)` and
  queues a Telegram dispatch whose text carries the **full 64-hex root and full head hash** in a fixed,
  parseable line: `SPOTTER-LEDGER v1 seq=1..214 n=214 root=<64 hex> head=<64 hex>`.
- `ledger_roots`: `id`, `kind`, `first_seq`, `last_seq`, `leaf_count`, `root_hex`, `head_hash`,
  `computed_at`, **`telegram_chat_id`, `telegram_message_id`, `sent_text`, `sent_at`** (filled by
  `dispatch` from Telegram's response). Insert-only.
- **Witness check** = Edge Function **`ledger-witness`** (FM JWT): Telegram `forwardMessage(chat_id =
  supervisor chat, from_chat_id = supervisor chat, message_id = telegram_message_id)`, which returns the
  sent `Message` with its text [V core.telegram.org/bots/api#forwardmessage] → parse the
  `SPOTTER-LEDGER` line **from Telegram's copy** → call `public.ledger_recompute_root(first_seq,
  last_seq)` and `ledger_verify` → return `{telegram_root, recomputed_root, match, head_ok}`. The database
  copy of the root is shown but **not trusted**. The forwarded copy also appears in the chat as a visible
  re-check.
- Limits stated honestly: (1) the Telegram Bot API has no "get message by id" [V: none documented], so
  the forward is the re-fetch; (2) whoever holds the bot token can edit the witness (`edit_date` exists on
  `Message` [V]); our threat model separates the database owner from the Edge Function secrets holder;
  (3) entries after the last checkpoint are covered only by the chain until the next checkpoint (30 min
  in demo mode); (4) RFC 3161 timestamping stays on the roadmap as the second witness.

### 4.6 Tamper demo

1. Publish a checkpoint (Telegram shows the full root and head).
2. Naive edit as the database owner (disable the trigger, edit, re-enable) → Verify: "chain breaks at #N
   (hash_mismatch)".
3. Sophisticated edit (`demo_tamper(seq,'rehash')`, which also rewrites `ledger_roots.root_hex`) →
   chain ✓, **anchor ✗ and witness ✗**: Telegram's root ≠ the recomputed root.
Backup `private.demo_tamper` only via `director` when `demo_mode`.

### 4.7 Ledger and rehearsals

Rehearsal runs also write ledger entries (≈ 20 per run, < 50 KB); they are never purged. The live run's
entries are visually grouped by `run_id` in the console.

## 5. RPCs (signatures in api-contracts §4)

`pair_machine`, `task_start`, `task_pause`, `task_complete`, `ppe_override`, `sos_raise`, `sos_cancel`,
`alert_ack`, `incident_log`, `ledger_verify`, `near_miss_list`, `lesson_complete`, `replay_submit`,
`lesson_assign`, `consent_set`, `my_snapshot`.

## 6. Scheduled jobs (pg_cron): each job is its own transaction (G2-1)

| Job | Schedule | Does | Touches |
|---|---|---|---|
| `sos-escalator` | `'1 seconds'` | `private.escalations_due()` only: `select … for update skip locked` on due alerts, CAS, insert escalation dispatches | `alerts`, `dispatches`, `events` (no ledger, no frames) |
| `scenario-tick` | `'1 seconds'` | `set local statement_timeout = '5s'`; `pg_try_advisory_xact_lock(4210002)` or skip; apply ≤ `max_frames_per_tick` frames, each detector call in its own `begin … exception` block → `tick_errors`; write `tick_log` | frames, state, anomalies, events, alerts, `ledger_queue` |
| `ledger-writer` | `'1 seconds'` | `ledger_drain(50)` | `incidents`, `ledger_queue`, events |
| `dispatch-requeue` | `'5 seconds'` | requeue stuck dispatches (§3.3) | `dispatches` |
| `housekeeping` | `'*/10 * * * *'` | delete `cron.job_run_details` > 1 h; `tick_log` > 24 h; size guard (§7) | — |
| `demo-checkpoint` | `'*/30 * * * *'` | `ledger_checkpoint()` if `demo_mode` | `ledger_roots`, dispatches |

A failing tick can no longer block, roll back or delay an SOS escalation, and `sos_raise` never waits on
a lock held by a job. [U] `cron.log_statement` defaults to true (G2-21); B0 checks whether it can be set
off on Supabase; if not, the extra log lines are accepted (they are logs, not database size).

## 7. Size budget, including rehearsals and Realtime (G2-15)

Free plan: read-only above 500 MB **database size** [V]; the Fair Use check sums the organisation's
projects [V per G2]; whether the two paused projects in the org count is [U] → B0 checks the org usage
page, and if they count, Spotter goes in its own organisation.
| Item | Estimate [A, measured in B8/B21] |
|---|---|
| Empty project baseline | 40-60 MB [V] |
| Reference + 30-day history (telemetry 172,800, GPS 43,200, task_history 7,500) + indexes | ≈ 120 MB |
| Scenario frames (≈ 30,000) | ≈ 10 MB |
| One rehearsal run before purge (telemetry ≈ 12,000, GPS 14,400, events ≈ 400, state) | ≈ 8 MB → ≈ 0.2 MB after `purge_run` |
| Realtime `realtime.messages` (kept 3 days [V]): `machines` frame sent as a **delta** (only machines that moved > 5 m or changed health), ≤ 600 B/s while playing | ≈ 2 MB per playing hour → ≤ 40 MB over 20 playing hours |
| Eval sandbox (transient, one day at a time, truncated) | ≤ 15 MB peak |
| pg_net responses (6 h), `cron.job_run_details` (1 h), `tick_log` (24 h) | ≤ 10 MB |
| **Planned peak** | **≈ 260 MB** |
Guards: seed fails above 300 MB; `housekeeping` emits `system.db_size_warning` above 400 MB;
`demo-check` prints size. [U] deleting old rows from `realtime.messages` ourselves: not relied on.
