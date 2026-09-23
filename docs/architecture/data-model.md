# Data model (Postgres 15+ on Supabase, Mumbai)

Status: Proposed with ADR-001. Owner: Track B. Migrations land in `supabase/migrations/` in the order of
`backend-tasks.md`. Markers: **[V]** verified today, **[R]** from research 10-15, **[A]** assumption,
**[U]** unverified.

## 0. Conventions

- Schemas: `public` (exposed to the Data API, RLS on every table), `private` (functions, held-out labels,
  detector state; **not** exposed), `extensions` (postgis, pg_net), `cron`, `vault`, `realtime`.
- Keys: `uuid primary key default gen_random_uuid()` unless noted; high-volume streams use
  `bigint generated always as identity`. Business codes (`EXC-014`, `OP-0007`) are `unique text`.
- Time: `timestamptz`. Scenario rows carry **simulated** time in `ts`/`sim_ts`; `recorded_at` is always
  wall-clock `now()`. Timers (SOS, escalation) use wall-clock only.
- Geometry: `extensions.geography(Point, 4326)` / `(Polygon, 4326)`; GIST index on every geography
  column. Distances in metres via `ST_DWithin(geography, geography, m)` [R] research 10 §6.
- Every scenario-produced row carries `run_id` (FK `scenario_runs`); `run_id is null` = historical
  (generated history). **Nothing is ever deleted to reset a demo: reset creates a new run.** The UI
  reads the run where `scenario_runs.is_current`.
- Writes from clients go only through `security definer` RPCs with `set search_path = ''` and an
  explicit role check. Tables grant clients `select` only (and only where a policy allows).
- RLS helpers (in `private`, `stable`, `security definer`), always wrapped as `(select …)` inside
  policies so they are evaluated once per statement [A: Supabase RLS performance guidance, to be
  checked against the `supabase-postgres-best-practices` skill in task B2]:
  `private.app_role() → app_role`, `private.my_operator_id() → uuid`, `private.my_site_id() → uuid`.

Enums (Postgres `create type … as enum`, mirrored 1:1 in `packages/shared` zod enums):
`app_role` (operator, fleet_manager, trainer) · `alert_tier` (info, caution, warning, critical) ·
`skill_level` (novice, intermediate, expert) · `task_type` (excavation, trenching, material_loading,
grading, demolition) · `task_status` (planned, in_progress, paused, completed, cancelled, blocked_ppe) ·
`weather_kind` (clear, hot, rain, windy, cold, fog, dust) · `fault_severity` (info, caution, derate,
shutdown) [R] research 11 §1.3 · `run_status` (ready, playing, paused, finished) · `frame_kind`
(telemetry, gps, operator_state, weather, fault, ppe, marker) · `alert_status` (open, acknowledged,
escalating, escalated, resolved, suppressed) · `dispatch_channel` (telegram, twilio_voice) ·
`dispatch_status` (queued, sending, sent, delivered, answered, no_answer, failed, suppressed, dry_run) ·
`incident_type` (seatbelt_breach, guardian_hazard, sos, ppe_override, near_miss, first_aid,
property_damage, manual, correction) · `visibility` (operator, site, supervisor).

Roles in the RLS matrices below: **OP** operator, **FM** fleet_manager, **TR** trainer, **SVC** service
(Edge Functions using the secret key → Postgres role `service_role`, which bypasses RLS [V] but still
obeys table grants). "RPC" = write only via a named security-definer function. "—" = no access.

## 1. Organiser dataset mapping

Their files are not in the repo yet (`docs/brief/data/` holds only `.gitkeep`) **[A]: the mapping below
uses the column names in the problem statement; units, value vocabularies and the meaning of
"Idling time" must be confirmed against the sample file** (task B6).

Telemetry dataset (9 fields) → `telemetry_readings` (+ reference tables):
| Organiser field | Column | Notes |
|---|---|---|
| Timestamp | `telemetry_readings.ts` | parsed as IST if no offset [A] |
| Machine ID | `machines.code` → `telemetry_readings.machine_id` | loader upserts unknown codes into `machines` with `model_id` null + `assumed = true` |
| Operator ID | `operators.employee_code` → `telemetry_readings.operator_id` | same upsert rule |
| Engine hours | `telemetry_readings.engine_hours` numeric(10,2) | cumulative hour meter [A] |
| Fuel used | `telemetry_readings.fuel_used_l` numeric(10,2) | litres, cumulative per shift [A] |
| Load cycles | `telemetry_readings.load_cycles` int | cumulative per shift [A] |
| Idling time | `telemetry_readings.idle_hours` numeric(10,2) | **[A] cumulative hours; could be minutes per interval: confirm** |
| Seatbelt status | `telemetry_readings.seatbelt_fastened` boolean | map "Fastened/Unfastened", "Yes/No", 1/0 [A] |
| Safety alerts | `telemetry_readings.organiser_safety_alert` text (raw) | loader also writes a `safety.organiser_alert` event per non-empty value, so their example ("unfastened and an alert triggered") shows up in the inbox |

Task-time dataset (7 fields) → `task_history`:
| Organiser field | Column |
|---|---|
| Task ID | `task_history.external_ref` (unique with `source`) |
| Task type | `task_history.task_type` (`task_type` enum; unknown values rejected into a load report) |
| Weather | `task_history.weather` (`weather_kind`; free text kept in `weather_raw`) |
| Operator skill | `task_history.operator_skill` (`skill_level`) |
| Machine age | `task_history.machine_age_years` numeric(4,1) [A years] |
| Estimated time | `task_history.organiser_estimate_min` numeric(8,1) [A minutes] |
| Actual time | `task_history.actual_min` numeric(8,1) [A minutes] |

Every column beyond these is an **assumed sensor** or **synthetic** field and is tagged so in the UI
(`packages/shared` exports `ASSUMED_FIELDS` per table for the "assumed" chip).

## 2. Tables

### 2.1 Reference

**sites**: `id`, `code text unique`, `name text`, `site_type text` (quarry, coal_mine, highway),
`location geography(Point)`, `elevation_m numeric`, `timezone text default 'Asia/Kolkata'`,
`created_at`. Index: GIST(location).

**zones**: `id`, `site_id → sites`, `name`, `zone_type text` (work, hazard, no_go, parking, walkway,
fuel), `boundary geography(Polygon)`, `max_speed_kmh numeric`, `max_slope_deg numeric`.
Index: GIST(boundary), (site_id).

**machine_models**: `id`, `code text unique` (e.g. `320`, `950GC`), `name text` (e.g. "Cat 320 GC
excavator"), `machine_type text`, `rated_rpm int`, `idle_fuel_lph numeric`, `work_fuel_lph numeric`,
`baseline_idle_pct numeric default 25` [R] research 11 §4.1.

**machines**: `id`, `code text unique` (organiser Machine ID), `model_id → machine_models null`,
`serial_number text`, `manufacture_year int`, `home_site_id → sites`, `service_status text`,
`assumed boolean default false`. Index: (home_site_id).

**operators**: `id`, `employee_code text unique` (organiser Operator ID), `display_name`,
`skill_level skill_level`, `experience_hours numeric`, `preferred_language text check in ('en','hi','ta')`,
`site_id → sites`, `contact_ref text` (the **name of an Edge Function secret**, e.g.
`DEMO_OPERATOR_PHONE`; phone numbers never enter the database), `created_at`.

**profiles**: `user_id uuid pk → auth.users on delete cascade`, `role app_role not null`,
`operator_id → operators null` (required when role = operator), `site_id → sites`, `display_name`,
`language text`, `created_at`. One row per demo login (Ravi = operator, Anita = fleet_manager, a trainer).

**protocol_cards** (fixed, reviewed; never LLM-generated): `id text pk` (e.g. `hydraulic_fault`),
`fault_type text`, `version int`, `steps jsonb` (`{"en":[...],"hi":[...],"ta":[...]}`),
`audio_paths jsonb` (Storage paths of pre-generated clips), `source_refs text[]`, `reviewed_by text`,
`reviewed_at timestamptz`. Content from research 10 §6 protocol.

**event_types**: `type text pk` (e.g. `safety.seatbelt_breach`), `default_tier alert_tier null`,
`ledger boolean` (auto-appends an incident), `raises_alert boolean`, `visibility visibility`,
`description text`. Seeded from `packages/shared` `EVENT_TYPES` so the DB and the contracts cannot drift.

**alert_policies** (the alert budget as data): `kind text pk`, `tier alert_tier`,
`dedupe_window_s int`, `ack_timeout_s int null` (null = no escalation), `escalate_to text`
(`supervisor_telegram`, `supervisor_call`, `operator_call`), `rate_cap_per_10min int`,
`needs_ack boolean`.

**app_config** (single row): `demo_mode boolean`, `dry_run_external boolean` (dispatches become
`dry_run`: used in rehearsals so we do not burn Twilio trial minutes), `guardian_radius_m int default 50`,
`danger_radius_m int default 15`, `motion_speed_kmh numeric default 0.5`.

RLS (all of 2.1): OP/FM/TR `select` (profiles: own row for OP; all rows for FM, TR). No client writes.
SVC full. `app_config`: FM select only.

### 2.2 Shifts, tasks, task history

**shifts**: `id`, `run_id → scenario_runs null`, `operator_id`, `machine_id`, `site_id`,
`shift_type text`, `scheduled_start`, `scheduled_end`, `actual_start`, `actual_end`, `status text`.
Index: (operator_id, scheduled_start), (run_id).

**tasks** (today's plan; scenario-scoped): `id`, `run_id`, `shift_id`, `external_ref text`,
`operator_id`, `machine_id`, `site_id`, `zone_id null`, `task_type task_type`, `planned_start`,
`planned_quantity numeric null` [A], `status task_status default 'planned'`, `started_at`, `paused_at`,
`completed_at`, `progress_pct numeric(5,2) default 0`, `eta_p50_min numeric`, `eta_p90_min numeric`,
`eta_model_version text`, `eta_factors jsonb` (factor → multiplier, for "why this estimate"),
`ppe_override_incident_id → incidents(id) null`, `updated_at`.
Index: (run_id, operator_id, planned_start), (run_id, status).
RLS: OP select own (`operator_id = (select private.my_operator_id())`); FM select all; TR select all.
Writes: RPC (`task_start`, `task_pause`, `task_complete`).

**task_history** (ETA training data): `id`, `external_ref text`, `source text check in
('organiser','synthetic')`, `task_type`, `weather weather_kind`, `weather_raw text`,
`operator_skill skill_level`, `machine_age_years numeric(4,1)`, `organiser_estimate_min numeric(8,1)`,
`actual_min numeric(8,1)`; assumed extras: `operator_id null`, `machine_id null`, `site_id null`,
`started_at`, `temperature_c`, `wind_kmh`, `humidity_pct`, `material text`, `shift_hour smallint`,
`split text check in ('train','calib','test')` (fixed by seed; the test split is never used for fitting).
Unique (source, external_ref). Index: (task_type, weather), (split).
RLS: FM, TR select; OP select own rows; no client writes.

### 2.3 Scenario engine

**scenarios**: `id`, `code text unique` (`review1`), `seed bigint`, `site_id`, `shift_start_sim
timestamptz`, `duration interval`, `frame_count int`, `generator_version text`, `created_at`.

**scenario_frames** (pre-generated by the Python generator; the "sensor feed"):
`scenario_id → scenarios`, `seq int`, `sim_offset_ms bigint`, `kind frame_kind`, `machine_id null`,
`operator_id null`, `payload jsonb` (telemetry, GPS fix, PPE tags, on-foot flag, weather, fault code).
PK (scenario_id, seq). Index: (scenario_id, sim_offset_ms).
**Contains raw sensor values only: no event, no label.** RLS: **no client access** (future frames would
leak the script). SVC and `private` functions only.

**scenario_runs**: `id`, `scenario_id`, `status run_status`, `speed smallint check in (1,10,60)`,
`sim_anchor timestamptz` (sim time at `wall_anchor`), `wall_anchor timestamptz`, `cursor_seq int
default 0` (last applied frame), `is_current boolean default false` (partial unique index where true),
`dry_run_external boolean`, `created_by uuid`, `created_at`.
`sim_now = sim_anchor + (now() - wall_anchor) * speed` while playing.
RLS: all roles select. Writes: `director` Edge Function → `private.run_*` functions.

### 2.4 Telemetry and live state

**telemetry_readings**: `id bigint identity pk`, `run_id null`, `frame_seq int null`, `machine_id`,
`operator_id null`, `ts` (organiser Timestamp), `engine_hours`, `fuel_used_l`, `load_cycles`,
`idle_hours`, `seatbelt_fastened`, `organiser_safety_alert text` (the 9 organiser fields); assumed:
`rpm int`, `engine_load_pct numeric`, `coolant_temp_c numeric`, `hydraulic_temp_c numeric`,
`hydraulic_pressure_bar numeric`, `speed_kmh numeric`, `pitch_deg numeric`, `roll_deg numeric`,
`parking_brake boolean`, `fuel_level_pct numeric`, `def_pct numeric`, `location geography(Point)`.
Unique (run_id, frame_seq) (idempotent frame apply; history rows have both null). Index:
(machine_id, ts), (run_id, machine_id, ts) where run_id is not null, BRIN(ts), GIST(location).
RLS: OP select where `operator_id = me`; FM select all; TR —.

**machine_state** (latest per machine per run; what maps and Guardian read): PK (run_id, machine_id),
`ts`, `speed_kmh`, `moving boolean` (speed > `app_config.motion_speed_kmh` or parking brake off),
`parking_brake`, `seatbelt_fastened`, `operator_id null`, `pitch_deg`, `roll_deg`, `location`,
`hydraulic_temp_c`, `coolant_temp_c`, `health text` (ok, caution, fault), `active_anomaly_ids uuid[]`,
`updated_at`. Index: GIST(location).
RLS: all roles select (machine-level, not personal).

**operator_state** (latest per operator per run): PK (run_id, operator_id), `ts`, `location`,
`on_foot boolean`, `in_cab_machine_id null`, `ppe jsonb` (`{"helmet":true,"vest":false,"boots":true}`,
assumed UWB/RFID tags), `updated_at`. RLS: OP own; FM all; TR —.

**operator_gps_trail**: `id bigint identity`, `run_id null`, `operator_id`, `ts`, `location`,
`speed_kmh`, `accuracy_m`. Index: (run_id, operator_id, ts), GIST(location).
RLS: OP own; FM all (workplace-safety legitimate use, DPDP s.7 [R] research 10 §6); TR —.
Retention: history older than 90 days deleted by a nightly cron job.

**weather_snapshots**: `id`, `site_id`, `run_id null`, `ts`, `temperature_c`, `apparent_temperature_c`,
`humidity_pct`, `wind_kmh`, `precipitation_mm`, `wbgt_c` (approximation, labelled), `wind_chill_c`,
`source text` (open_meteo_archive, scenario). Index: (site_id, ts). RLS: all select.

**fault_codes**: `id`, `run_id null`, `machine_id`, `ts`, `code_type text` (j1939_spn_fmi,
cat_cid_fmi, cat_eid), `spn int`, `fmi int`, `cid int`, `mid int`, `eid int`, `severity fault_severity`,
`description_key text`, `active boolean`, `cleared_at`. Index: (machine_id, ts).
RLS: all select.

### 2.5 Detection

**private.detector_state**: PK (run_id, machine_id, metric), `n int`, `ewma numeric`, `ewvar numeric`,
`last_ts`, `in_alarm boolean`. EWMA λ = 0.2, control limit L = 3σ, warm-up 30 samples [A] (NIST
EWMA chart, research 11 §4.3).

**detector_baselines**: PK (scope, scope_id, metric), `scope text` (machine, model), `mean`, `sd`, `n`,
`fitted_from daterange`. Fitted from history days 1-20 only. RLS: FM, TR select.

**anomalies**: `id`, `run_id null`, `machine_id`, `operator_id null`, `anomaly_type text`
(idle_excess, seatbelt_off_moving, overspeed, slope_exceeded, cold_overrev, harsh_operation,
warning_ignored, fault_continued_operation, hydraulic_temp_drift, coolant_temp_drift, fuel_rate_drift),
`method text` (rule, ewma, fleet_z), `ts_start`, `ts_end null`, `severity_score smallint` (0-100,
risk-matrix weights [R] research 11 §4.4), `features jsonb` (numbers only: e.g. `idle_pct`,
`ratio_to_normal`, `fuel_l`, `cost_inr`; the UI renders the sentence in the operator's language),
`event_id → events`. Index: (run_id, machine_id, ts_start), (anomaly_type).
RLS: OP select where `operator_id = me or operator_id is null`; FM, TR select all.

**private.injected_labels** (the answer key; held out): `id`, `run_id null`, `machine_id`,
`anomaly_type`, `ts_start`, `ts_end`, `generator_version`. **Not exposed; no detector function reads
it.** Only `private.evaluate_detectors()` joins it, after detection, to fill `evidence_metrics`.

**evidence_metrics**: `id`, `metric_key text` (`detector.precision.idle_excess`, `eta.mae.model`,
`eta.mae.organiser`, `eta.p90_coverage`, `rag.hit_at_5`, `rag.faithfulness`), `value numeric`,
`n int`, `details jsonb`, `dataset_version text`, `computed_at`. RLS: all select.

### 2.6 Events, alerts, dispatches: see §3

### 2.7 Ledger: see §4

### 2.8 Training and the Loop

**lessons**: `id`, `code text unique` (`seatbelt_slopes`, `faulty_machine_nearby`), `title jsonb`
(i18n), `video_paths jsonb`, `quiz jsonb`, `topic_event_types text[]`.
**lesson_assignments**: `id`, `operator_id`, `lesson_id`, `because_event_id → events null`,
`assigned_at`, `completed_at`, `quiz_score numeric`. Unique (operator_id, lesson_id, because_event_id).
**replay_scenarios**: `id`, `source_event_id → events unique`, `operator_id`, `scenario_json jsonb`
(map snapshot, trail, machine, wind, decision steps), `created_at`.
**replay_attempts**: `id`, `replay_id`, `operator_id`, `started_at`, `completed_at`,
`outcome_score numeric`, `process_score numeric`, `choices jsonb`.
RLS: OP own (select; writes via `replay_submit`, `lesson_complete` RPCs); TR select all, assigns via
`lesson_assign` RPC; FM select all (aggregates on the evidence card). Near-miss derived records are
flagged non-punitive (§4) [policy, not technically enforced in P0].

### 2.9 Ask Spotter (RAG)

**kb_documents**: `id`, `title`, `source_url`, `licence text`, `audience app_role[]`, `language text`,
`safety_critical boolean`, `checksum text`, `ingested_at`.
**kb_chunks** (mirror of Pinecone records, used to display and to **validate citations**):
`id text pk` (= Pinecone record id), `document_id`, `ordinal int`, `heading text`, `text text`,
`page int null`, `modality text` (text, image), `image_path text null`, `audience app_role[]`.
**ask_logs**: `id`, `user_id`, `role app_role`, `question text`, `photo_path text null`,
`answer jsonb`, `cited_ids text[]`, `grounded boolean`, `model text`, `fallback_used text null`,
`latency_ms int`, `prompt_tokens int`, `created_at`.
RLS: kb_* select where `(select private.app_role()) = any(audience)`; ask_logs own select; writes SVC.

### 2.10 Privacy

**consents**: `id`, `operator_id`, `version text`, `purpose text`, `granted_at`, `revoked_at null`.
RLS: OP own (write via `consent_set` RPC); FM select. "My data" view = the OP-visible rows above.

## 3. Events, alerts and dispatches

### 3.1 `events`: the single source of truth

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| seq | bigint generated always as identity unique | global order for the UI |
| run_id | uuid → scenario_runs null | null for non-scenario events |
| type | text → event_types(type) | `domain.verb`, e.g. `safety.seatbelt_breach` |
| tier | alert_tier null | copied from payload rules / event_types |
| sim_ts | timestamptz null | simulated time of the underlying frame |
| recorded_at | timestamptz default now() | wall clock |
| site_id, machine_id, operator_id, task_id, alert_id | uuid null | subjects |
| visibility | visibility | operator / site / supervisor |
| source | text | `detector.rule`, `detector.ewma`, `guardian`, `user`, `director`, `system`, `telegram`, `twilio`, `loader` |
| payload | jsonb check (jsonb_typeof(payload) = 'object') | validated by zod at every edge; schema per type in `api-contracts.md` §3 |
| correlation_id | uuid | groups one story (SOS raise → ack → escalate) |
| causation_id | uuid null → events(id) | parent event |
| idempotency_key | text unique not null | see below |

Indexes: unique(idempotency_key); (run_id, seq); (operator_id, recorded_at desc); (type, recorded_at desc);
(correlation_id).
Grants: clients `select` only; inserts only via `private.emit_event(...)` (security definer), called by
detectors, RPCs and Edge Functions. `update`/`delete` revoked from `anon`, `authenticated`,
`service_role`; the table is append-only.
RLS: OP select where `visibility = 'site' or (operator_id = me and visibility = 'operator')`;
FM select all; TR select where `type like 'safety.%' or type like 'training.%' or type like 'guardian.%'`.

**Idempotency keys** (a retry, duplicate webhook or re-applied frame becomes a no-op via
`insert … on conflict (idempotency_key) do nothing returning …`, falling back to a select):
| Producer | Key format |
|---|---|
| detector | `det:{run_id}:{machine_code}:{rule}:{frame_seq}` |
| client RPC | `rpc:{function}:{request_id}` (client uuid v4 per user action) |
| Telegram | `tg:{update_id}` |
| Twilio | `tw:{CallSid}:{CallStatus}` or `tw:{CallSid}:digits` |
| director | `dir:{request_id}` |
| system job | `sys:{job}:{bucket}` (e.g. `sys:ledger_root:2026-09-23`) |

**Fan-out:** an `after insert` trigger on `events` calls `realtime.send(to_jsonb(new), new.type, topic,
true)` (the payload is the `EventEnvelope` of api-contracts §3) for each topic the event belongs to:
`op:{operator_id}` (operator-visible), `site:{site_id}` (site-visible), `sup:{site_id}` (all). Private
topics; RLS on `realtime.messages` (select) checks `realtime.topic()` against
`private.my_operator_id()`, `private.my_site_id()` and `private.app_role()` [V] Realtime Authorization
docs. The "Allow public access" Realtime setting is switched off.

Event types (P0; the canonical list lives in `packages/shared/src/contracts/events.ts`):
`scenario.{started,paused,resumed,speed_changed,jumped,finished}` ·
`task.{started,paused,completed,start_blocked}` · `ppe.{missing,restored,override_granted}` ·
`safety.{seatbelt_breach,seatbelt_resolved,overspeed,slope_exceeded,proximity,organiser_alert}` ·
`anomaly.{detected,cleared}` · `guardian.{hazard_near_operator,hazard_cleared}` ·
`alert.{raised,acknowledged,escalated,resolved,suppressed}` ·
`dispatch.{sent,delivered,answered,failed,suppressed}` · `sos.{raised,cancelled}` ·
`incident.logged` · `ledger.{checkpoint_published,verified,tamper_detected}` ·
`training.{lesson_assigned,lesson_completed,replay_completed}`.

### 3.2 `alerts`: one row per condition that needs a human

`id`, `run_id`, `origin_event_id → events`, `kind text → alert_policies`, `tier alert_tier`,
`status alert_status`, `operator_id`, `machine_id null`, `site_id`, `dedupe_key text`
(`{kind}:{operator_id}:{machine_id}`), `occurrences int default 1`, `first_seen`, `last_seen`,
`needs_ack boolean`, `ack_by uuid null`, `ack_at`, `ack_via text` (app, telegram, twilio_keypress,
sensor), `escalate_at timestamptz null` (wall clock), `escalation_level smallint default 0`,
`suppressed_by → alerts null`, `protocol_card_id → protocol_cards null`, `updated_at`.
Indexes: **unique (dedupe_key) where status in ('open','acknowledged','escalating')** (the dedupe
guarantee); (status, escalate_at) where status = 'open' (the timer scan); (operator_id, status).
RLS: OP select own; FM select all; TR —. Writes: `private.raise_alert`, RPC `alert_ack`,
`private.escalations_due`.

### 3.3 `dispatches`: the outbox for every external message

`id`, `alert_id → alerts null`, `purpose text` (alert, escalation, ledger_root, reminder),
`channel dispatch_channel`, `recipient_ref text` (secret name, e.g. `TELEGRAM_SUPERVISOR_CHAT_ID`),
`recipient_role text`, `attempt smallint default 1`, `status dispatch_status default 'queued'`,
`body jsonb` (template id + params + language; never a phone number), `provider_ref text`
(Telegram message_id, Twilio CallSid), `error jsonb`, `created_at`, `sent_at`, `updated_at`.
Unique (alert_id, purpose, channel, recipient_role, attempt).
Trigger `after insert when (new.status = 'queued')` → `net.http_post` to the `dispatch` Edge Function
with `{dispatch_id}` and `apikey` read from Vault [V] migration guide. Stuck rows (`sending` > 20 s) are
re-queued by `heartbeat()` with `attempt + 1`, max 2 attempts.
RLS: FM select; others —.

**private.telegram_updates**: `update_id bigint pk`, `received_at`. Webhook dedupe.

## 4. Ledger design

### 4.1 Table `incidents` (the hash-chained ledger)

| Column | Type | In hash? |
|---|---|---|
| id | uuid pk | no (surrogate) |
| seq | bigint unique not null, assigned as previous + 1 under the lock | yes |
| idempotency_key | text unique not null | no |
| run_id | uuid null | yes |
| occurred_at | timestamptz not null | yes |
| recorded_at | timestamptz not null (set inside `ledger_append`) | yes |
| incident_type | incident_type | yes |
| severity | smallint 1-5 | yes |
| site_id, operator_id, machine_id | uuid null | yes |
| lat, lon | numeric(9,6) null | yes (stored as numbers; a geography column is derived for maps) |
| description | text | yes |
| context | jsonb (auto snapshot: telemetry, conditions, task, GPS) | yes (canonicalised) |
| reported_by | uuid null (auth user) | yes |
| reporter_kind | text (user, system, detector, supervisor) | yes |
| source_event_id | uuid null | yes |
| supersedes_seq | bigint null (corrections are new rows, never edits) | yes |
| non_punitive | boolean default true for near_miss | yes |
| prev_hash | char(64) | yes |
| entry_hash | char(64) | result |
| canon_version | smallint default 1 | yes (as `v`) |

Append-only, three layers: (1) `revoke insert, update, delete, truncate on incidents from anon,
authenticated, service_role`; (2) `before update or delete` row trigger and `before truncate`
statement trigger that raise; (3) inserts only through `private.ledger_append`, owned by `postgres`.
RLS: OP select own (`operator_id = me`); FM select all; TR select `incident_type = 'near_miss'`.

### 4.2 Canonical serialisation v1

A JSON object text with **keys in ascending code-point order, no whitespace, every scalar a JSON
string** (numbers and timestamps are strings, so float formatting can never differ between
implementations):
- `occurred_at`, `recorded_at`: UTC, microseconds, `YYYY-MM-DD"T"HH24:MI:SS.US"Z"` via
  `to_char(ts at time zone 'UTC', …)`.
- `lat`, `lon`: fixed 6 decimals (`to_char` / `numeric(9,6)::text`); `seq`, `severity`, `v`: integer text.
- uuids lower-case; nulls as JSON `null`; booleans as `true`/`false`.
- strings: `to_json(text)::text` (JSON escaping).
- `context`: `private.canon_jsonb(jsonb)`, recursive: object keys sorted with `collate "C"`, arrays in
  order, numbers emitted as `trim_scale(n)::text` inside strings (`trim_scale(8.4100) → 8.41` [V]
  postgresql.org functions-math). Writers must keep context numbers
  finite, |x| < 1e15, ≤ 6 decimals (enforced by the `ledger_append` validator).
- **Never hash `jsonb::text`**: jsonb does not preserve key order, so we build the text explicitly.

`entry_hash = encode(sha256(convert_to(canonical, 'UTF8')), 'hex')` using the built-in
`sha256(bytea) → bytea` [V] postgresql.org functions-binarystring. `prev_hash` is inside the canonical
object, so the link is hashed. Genesis `prev_hash` = 64 × `0`.
A TypeScript mirror (`packages/shared/src/ledger/canonical.ts`) exists only for the offline evidence
script and must match golden vectors (including Hindi text and a nested context) in tests.

### 4.3 `private.ledger_append(p_idempotency_key text, p_entry jsonb) returns incidents`

```
security definer, set search_path = ''
1. perform pg_advisory_xact_lock(4210001);            -- one ledger-wide key; held to commit [V]
2. if a row with p_idempotency_key exists → return it (idempotent retry).
3. validate p_entry (types, numeric domain, description ≤ 2,000 chars).
4. select seq, entry_hash from public.incidents order by seq desc limit 1;
   new_seq := coalesce(seq, 0) + 1; prev := coalesce(entry_hash, repeat('0', 64));
5. recorded_at := date_trunc('microseconds', clock_timestamp());
6. canonical := private.ledger_canonical(new row values); entry_hash := sha256 hex.
7. insert; perform private.emit_event('incident.logged', …, idem 'ledger:' || new_seq).
8. return the row.
```
Callers: RPCs `incident_log`, `sos_raise`, `ppe_override`, and the event pipeline for event types with
`event_types.ledger = true` (seatbelt breach, Guardian critical).

### 4.4 `public.ledger_verify(p_from bigint default 1, p_to bigint default null)`

Returns `(ok boolean, checked int, first_bad_seq bigint, reason text, expected text, stored text,
head_seq bigint, head_hash text)`. Walks by `seq`; for each row checks (a) `seq` continuity (reason
`seq_gap`), (b) `prev_hash` = previous row's stored `entry_hash` (`link_broken`), (c) recomputed hash =
stored `entry_hash` (`hash_mismatch`). Stops at the first failure → UI shows "chain breaks at #214".
Executable by FM (and OP for own view is not needed). Emits `ledger.verified` or
`ledger.tamper_detected`.

### 4.5 Merkle root and external witness

- Leaves: `entry_hash` bytes of entries in the period, ordered by `seq`. Leaf node =
  `sha256(0x00 || leaf)`; parent = `sha256(0x01 || left || right)` (domain separation as in RFC 6962
  [A]: we cite the idea, not the exact split rule); an odd node at a level is carried up unchanged.
  Empty period = `sha256('')`.
- `public.ledger_roots`: `id`, `kind text` (daily, checkpoint), `period_start`, `period_end`,
  `first_seq`, `last_seq`, `leaf_count`, `root_hex char(64)`, `head_hash char(64)`, `computed_at`,
  `dispatch_id → dispatches`, `telegram_message_id bigint null`. Insert-only (same grants/trigger as
  the ledger). RLS: all roles select.
- **Daily**: pg_cron `'35 18 * * *'` (00:05 IST; pg_cron runs in UTC [A]) calls
  `private.ledger_publish_root('daily', day)` → inserts the root → queues a Telegram dispatch to the
  fleet manager: "Spotter ledger 2026-09-23: 47 entries, #168-#214, root 9f2c…e41a, head a71b…".
- **Checkpoint** (demo): director command `ledger_checkpoint` publishes the same message for entries up to
  the head, just before the tamper step.
- `public.ledger_root_check(p_root_id)` recomputes the root for that period and compares it with the
  stored `root_hex`; the UI shows both next to "published to Telegram at 14:02, message #…". The
  Telegram message is the witness the database cannot rewrite.

### 4.6 Tamper demo (two levels, both honest)

1. **Naive edit** (SQL editor as the database owner: disable the mutation trigger, change one
   description, re-enable): `ledger_verify` → "chain breaks at #N (hash_mismatch)".
2. **Sophisticated edit** (an attacker who also recomputes every later hash): the chain verifies ✓,
   but `ledger_root_check` ≠ the root published to Telegram → "database no longer matches the external
   witness". This is the point of the Merkle root.
Backup for stage: `private.demo_tamper(seq, mode)` callable only via the `director` function and only
when `app_config.demo_mode`. "Tamper-evident", never "tamper-proof".

## 5. Functions exposed as RPCs (signatures in api-contracts.md §4)

`task_start`, `task_pause`, `task_complete`, `ppe_override`, `sos_raise`, `sos_cancel`, `alert_ack`,
`incident_log`, `ledger_verify`, `ledger_root_check`, `lesson_complete`, `replay_submit`,
`lesson_assign`, `consent_set`, `my_snapshot` (cockpit bootstrap in one call).

## 6. Scheduled jobs (pg_cron)

| Job | Schedule | Does |
|---|---|---|
| `heartbeat` | `'1 seconds'` [V] | guarded by `pg_try_advisory_xact_lock`; `private.scenario_tick()` for the current playing run; `private.escalations_due()`; re-queue stuck dispatches |
| `ledger-daily-root` | `'35 18 * * *'` | daily Merkle root → Telegram |
| `cron-log-cleanup` | `'0 * * * *'` | delete `cron.job_run_details` older than 1 h ([V] rows are never cleaned automatically) |
| `retention` | `'0 20 * * *'` | delete history GPS/telemetry past 90 days |

## 7. Volumes and the 500 MB Free limit

The Free plan goes read-only at 500 MB database size [V]. Plan (estimates [A], measured in task B8):
| Data | Rows | In DB? |
|---|---|---|
| History telemetry, 20 machines, 5-min, **30 days** | 172,800 | yes (days 1-20 fit baselines, days 21-30 held out for detector evaluation) |
| History telemetry, full 90 days | 518,400 | **no**: CSV/Parquet in `data/` for judges; organiser-format export |
| GPS trail, 30 operators, 8 h shift, 5-min, 30 days | 43,200 | yes |
| task_history (synthetic + organiser rows) | ≈ 7,500 | yes |
| Demo scenario frames (8 h at 1-min, 2 machines at 10 s) | ≈ 30,000 | yes |
Target < 250 MB including indexes; the seed script prints `pg_database_size` and fails above 300 MB.
