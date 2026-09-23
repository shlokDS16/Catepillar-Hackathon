-- Migration 001 (B2): extensions, schemas, RLS helpers, reference tables, tasks, scenario engine,
-- telemetry and live state, privacy. Enums come from 20260923000000_contracts_enums.sql (generated).
-- Rules (data-model §0): RLS on every public table; clients get `select` only where a policy allows;
-- writes go through security-definer RPCs (B15); scenario frames are invisible to every client role.

-- ── Extensions and schemas ─────────────────────────────────────────────────────────────────────────
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;   -- needed to call the RLS helpers below; nothing in it is exposed by PostgREST
alter default privileges in schema private revoke execute on functions from public;

-- generic updated_at maintenance
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ── 2.1 Reference ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  site_type text not null check (site_type in ('quarry', 'coal_mine', 'highway')),
  location extensions.geography(Point, 4326) not null,
  elevation_m numeric(7,1),
  timezone text not null default 'Asia/Kolkata'
);
create index if not exists sites_location_gix on public.sites using gist (location);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  name text not null,
  zone_type text not null check (zone_type in ('work', 'hazard', 'no_go', 'parking', 'walkway', 'fuel')),
  boundary extensions.geography(Polygon, 4326) not null,
  max_speed_kmh numeric(5,1),
  max_slope_deg numeric(4,1)
);
create index if not exists zones_site_idx on public.zones (site_id);
create index if not exists zones_boundary_gix on public.zones using gist (boundary);

create table if not exists public.machine_models (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  machine_type text not null,
  rated_rpm int,
  idle_fuel_lph numeric(6,2),
  work_fuel_lph numeric(6,2),
  baseline_idle_pct numeric(5,2) not null default 25,
  source_url text
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  model_id uuid references public.machine_models(id),
  serial_number text,
  manufacture_year int,
  home_site_id uuid references public.sites(id),
  service_status text not null default 'in_service' check (service_status in ('in_service', 'maintenance', 'retired')),
  assumed boolean not null default false
);
create index if not exists machines_home_site_idx on public.machines (home_site_id);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  display_name text not null,
  skill_level public.skill_level not null,
  experience_hours numeric(8,1) not null default 0,
  preferred_language public.lang not null default 'hi',
  site_id uuid not null references public.sites(id),
  contact_ref text,                      -- name of an Edge Function secret (e.g. DEMO_OPERATOR_PHONE); phone numbers never enter the database
  pseudonym text not null unique         -- e.g. Operator-7F2, used by the near-miss view
);
create index if not exists operators_site_idx on public.operators (site_id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  operator_id uuid references public.operators(id),
  site_id uuid not null references public.sites(id),
  display_name text not null,
  language public.lang not null default 'en',
  constraint profiles_operator_role check (role <> 'operator' or operator_id is not null)
);
create index if not exists profiles_operator_idx on public.profiles (operator_id);

-- ── RLS helpers (data-model §0; after profiles because SQL-language bodies are checked at create time): stable, security definer, always used as `(select …)` in policies ──
create or replace function private.app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.user_id = (select auth.uid())
$$;
create or replace function private.my_operator_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.operator_id from public.profiles p where p.user_id = (select auth.uid())
$$;
create or replace function private.my_site_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.site_id from public.profiles p where p.user_id = (select auth.uid())
$$;
-- convenience for policies: fleet manager or trainer
create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role in ('fleet_manager', 'trainer'))
$$;
create or replace function private.is_fm()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'fleet_manager')
$$;
revoke execute on function private.app_role(), private.my_operator_id(), private.my_site_id(), private.is_staff(), private.is_fm() from public, anon;
grant execute on function private.app_role(), private.my_operator_id(), private.my_site_id(), private.is_staff(), private.is_fm() to authenticated, service_role;


create table if not exists public.protocol_cards (
  id text primary key,
  fault_type text not null,
  version int not null default 1,
  title jsonb not null,                  -- I18nText
  steps jsonb not null,                  -- I18nText[] (1-6)
  pictogram text not null,
  upwind_hint boolean not null default false,
  audio_paths jsonb,
  source_refs text[] not null default '{}',
  reviewed_by text,
  reviewed_at timestamptz
);

-- generated seeds (contracts): rows written by supabase/seed/contracts_registry.sql (embedded in migration 002)
create table if not exists public.event_types (
  type text primary key,
  default_tier public.alert_tier,
  ledger boolean not null default false,
  raises_alert boolean not null default false,
  alert_kind text,
  audiences public.audience[] not null,
  lesson_code text,
  replay boolean not null default false
);
create table if not exists public.alert_policies (
  kind text primary key,
  hazard_group text not null,
  tier_default public.alert_tier not null,
  tier_max public.alert_tier not null,
  dedupe_window_s int,
  ack_timeout_s int,
  notify_now text[] not null default '{}',
  escalate_to text[] not null default '{}',
  rate_capped boolean not null default false,
  needs_ack boolean not null default false
);
create table if not exists public.explanation_templates (
  anomaly_type public.anomaly_type primary key,
  en text not null,
  hi text not null
);

create table if not exists public.app_config (
  id boolean primary key default true check (id),   -- single row
  demo_mode boolean not null default true,
  dry_run_external boolean not null default true,
  guardian_radius_m numeric(6,1) not null default 50,
  danger_radius_m numeric(6,1) not null default 15,
  motion_speed_kmh numeric(4,1) not null default 0.5,
  state_stale_s int not null default 10,
  max_frames_per_tick int not null default 200,
  checkpoint_every_min int not null default 30,
  fuel_price_inr_per_l numeric(6,2) not null default 92,
  updated_at timestamptz not null default now()
);
insert into public.app_config (id) values (true) on conflict (id) do nothing;

-- ── 2.3 Scenario engine (created before tasks/telemetry: they reference scenario_runs) ─────────────
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  seed bigint not null,
  site_id uuid not null references public.sites(id),
  shift_start_sim timestamptz not null,
  duration interval not null,
  frame_count int not null default 0,
  generator_version text not null
);

create table if not exists public.scenario_frames (
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  seq int not null,
  sim_offset_ms bigint not null,
  kind public.frame_kind not null,
  machine_id uuid references public.machines(id),
  operator_id uuid references public.operators(id),
  payload jsonb not null,
  primary key (scenario_id, seq)
);
create index if not exists scenario_frames_offset_idx on public.scenario_frames (scenario_id, sim_offset_ms);

create table if not exists public.scenario_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id),
  status public.run_status not null default 'ready',
  speed smallint not null default 1 check (speed in (1, 10, 60)),
  sim_anchor timestamptz not null,
  wall_anchor timestamptz not null default now(),
  cursor_seq int not null default 0,
  catchup_until_seq int,
  is_current boolean not null default false,
  rehearsal boolean not null default true,
  dry_run_external boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists scenario_runs_current_uidx on public.scenario_runs (is_current) where is_current;
create index if not exists scenario_runs_scenario_idx on public.scenario_runs (scenario_id);

create table if not exists private.tick_log (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  started_at timestamptz not null default now(),
  frames int not null,
  duration_ms int not null,
  errors int not null default 0,
  lag_sim_ms bigint
);
create index if not exists tick_log_started_idx on private.tick_log (started_at);
create table if not exists private.tick_errors (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  frame_seq int not null,
  sqlstate text,
  message text,
  at timestamptz not null default now()
);

-- ── 2.2 Shifts, tasks, task history ────────────────────────────────────────────────────────────────
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  operator_id uuid not null references public.operators(id),
  machine_id uuid references public.machines(id),
  site_id uuid not null references public.sites(id),
  shift_type text not null check (shift_type in ('day', 'night')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  status text not null default 'planned' check (status in ('planned', 'active', 'ended'))
);
create index if not exists shifts_operator_idx on public.shifts (operator_id, scheduled_start);
create index if not exists shifts_run_idx on public.shifts (run_id);

create table if not exists public.ppe_overrides (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,                 -- FK added below (tasks references ppe_overrides too)
  operator_id uuid not null references public.operators(id),
  granted_by uuid not null,
  reason text not null check (length(reason) between 10 and 500),
  missing text[] not null,
  granted_at timestamptz not null default now(),
  valid_until timestamptz not null,
  ledger_queue_id bigint                 -- private.ledger_queue.id (B5); no FK: the ledger never depends on purgeable rows
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  shift_id uuid references public.shifts(id),
  external_ref text,
  operator_id uuid not null references public.operators(id),
  machine_id uuid references public.machines(id),
  site_id uuid not null references public.sites(id),
  zone_id uuid references public.zones(id),
  task_type public.task_type not null,
  planned_start timestamptz not null,
  status public.task_status not null default 'planned',
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  planned_cycles int not null check (planned_cycles > 0),
  cycles_at_start int,
  progress_pct numeric(5,2) not null default 0,
  eta_p50_min numeric(7,1),
  eta_p90_min numeric(7,1),
  eta_model_version text,
  eta_factors jsonb,                     -- EtaFactor[] (array everywhere, G2-9)
  ppe_override_id uuid references public.ppe_overrides(id),
  updated_at timestamptz not null default now(),
  constraint tasks_eta_factors_array check (eta_factors is null or jsonb_typeof(eta_factors) = 'array')
);
create index if not exists tasks_run_operator_idx on public.tasks (run_id, operator_id, planned_start);
create index if not exists tasks_operator_idx on public.tasks (operator_id);
alter table public.ppe_overrides drop constraint if exists ppe_overrides_task_fk;
alter table public.ppe_overrides add constraint ppe_overrides_task_fk foreign key (task_id) references public.tasks(id) on delete cascade;
create index if not exists ppe_overrides_task_idx on public.ppe_overrides (task_id);
create index if not exists ppe_overrides_operator_idx on public.ppe_overrides (operator_id);
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function private.touch_updated_at();

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  external_ref text not null,
  source text not null check (source in ('organiser', 'synthetic')),
  task_type public.task_type not null,
  weather public.weather_kind not null,
  weather_raw text,
  operator_skill public.skill_level not null,
  machine_age_years numeric(4,1) not null,
  organiser_estimate_min numeric(7,1) not null,
  actual_min numeric(7,1) not null,
  operator_id uuid references public.operators(id),
  machine_id uuid references public.machines(id),
  site_id uuid references public.sites(id),
  started_at timestamptz,
  temperature_c numeric(4,1),
  wind_kmh numeric(5,1),
  humidity_pct numeric(5,1),
  material text,
  shift_hour smallint check (shift_hour between 0 and 23),
  split text not null check (split in ('train', 'calib', 'test')),
  model_p50_min numeric(7,1),            -- written by B16 for the test split
  model_p90_min numeric(7,1),
  unique (source, external_ref)
);
create index if not exists task_history_split_idx on public.task_history (split, task_type, weather);
create index if not exists task_history_operator_idx on public.task_history (operator_id);

-- The one P0 supervisor chart (api-contracts §14): ETA by task type × condition, estimate vs actual, test split.
create or replace view public.v_task_analytics with (security_invoker = true) as
select task_type,
       weather as condition,
       count(*)::int as n,
       round(avg(actual_min), 1) as mean_actual_min,
       round(avg(organiser_estimate_min), 1) as mean_organiser_estimate_min,
       round(avg(model_p50_min), 1) as mean_model_p50_min,
       round(avg(abs(organiser_estimate_min - actual_min)), 1) as mae_organiser_min,
       round(avg(abs(model_p50_min - actual_min)), 1) as mae_model_min,
       round(avg(organiser_estimate_min - actual_min), 1) as bias_organiser_min,
       round(avg(model_p50_min - actual_min), 1) as bias_model_min
from public.task_history
where split = 'test' and model_p50_min is not null
group by task_type, weather
having count(*) >= 5;

-- ── 2.1 Pairing ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.operator_pairings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  operator_id uuid not null references public.operators(id),
  machine_id uuid not null references public.machines(id),
  paired_at timestamptz not null default now(),
  unpaired_at timestamptz
);
create unique index if not exists operator_pairings_active_uidx on public.operator_pairings (run_id, operator_id) where unpaired_at is null;
create index if not exists operator_pairings_machine_idx on public.operator_pairings (machine_id);

-- ── 2.4 Telemetry and live state ───────────────────────────────────────────────────────────────────
create table if not exists public.telemetry_readings (
  id bigint generated always as identity primary key,
  run_id uuid references public.scenario_runs(id) on delete cascade,
  frame_seq int,
  machine_id uuid not null references public.machines(id),
  operator_id uuid references public.operators(id),
  ts timestamptz not null,
  -- the 9 organiser fields (data-model §1)
  engine_hours numeric(10,2),
  fuel_used_l numeric(10,2),
  load_cycles int,
  idle_hours numeric(10,2),
  seatbelt_fastened boolean,
  organiser_safety_alert text,
  -- assumed sensors
  rpm int,
  engine_load_pct numeric(5,1),
  coolant_temp_c numeric(5,1),
  hydraulic_temp_c numeric(5,1),
  hydraulic_pressure_bar numeric(6,1),
  speed_kmh numeric(5,1),
  pitch_deg numeric(4,1),
  roll_deg numeric(4,1),
  parking_brake boolean,
  fuel_level_pct numeric(5,1),
  def_pct numeric(5,1),
  location extensions.geography(Point, 4326)
);
create unique index if not exists telemetry_run_frame_uidx on public.telemetry_readings (run_id, frame_seq) where run_id is not null;
create index if not exists telemetry_machine_ts_idx on public.telemetry_readings (machine_id, ts);
create index if not exists telemetry_run_machine_ts_idx on public.telemetry_readings (run_id, machine_id, ts) where run_id is not null;
create index if not exists telemetry_operator_idx on public.telemetry_readings (operator_id);
create index if not exists telemetry_ts_brin on public.telemetry_readings using brin (ts);
create index if not exists telemetry_location_gix on public.telemetry_readings using gist (location);

create table if not exists public.machine_state (
  run_id uuid not null references public.scenario_runs(id) on delete cascade,
  machine_id uuid not null references public.machines(id),
  ts timestamptz not null,
  speed_kmh numeric(5,1),
  moving boolean not null default false,
  parking_brake boolean,
  seatbelt_fastened boolean,
  operator_id uuid references public.operators(id),
  pitch_deg numeric(4,1),
  roll_deg numeric(4,1),
  location extensions.geography(Point, 4326),
  hydraulic_temp_c numeric(5,1),
  coolant_temp_c numeric(5,1),
  load_cycles int,
  health public.machine_health not null default 'ok',
  active_anomaly_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (run_id, machine_id)
);
create index if not exists machine_state_location_gix on public.machine_state using gist (location);

create table if not exists public.operator_state (
  run_id uuid not null references public.scenario_runs(id) on delete cascade,
  operator_id uuid not null references public.operators(id),
  ts timestamptz not null,
  location extensions.geography(Point, 4326),
  on_foot boolean,
  in_cab_machine_id uuid references public.machines(id),
  ppe jsonb not null default '{}',
  motion_locked boolean not null default true,     -- default deny (G2-17)
  call_allowed boolean not null default false,
  nearest jsonb,
  updated_at timestamptz not null default now(),
  primary key (run_id, operator_id)
);
create index if not exists operator_state_location_gix on public.operator_state using gist (location);

create table if not exists public.operator_gps_trail (
  id bigint generated always as identity primary key,
  run_id uuid references public.scenario_runs(id) on delete cascade,
  operator_id uuid not null references public.operators(id),
  ts timestamptz not null,
  location extensions.geography(Point, 4326) not null,
  speed_kmh numeric(5,1),
  accuracy_m numeric(6,1)
);
create index if not exists gps_trail_operator_ts_idx on public.operator_gps_trail (operator_id, ts);
create index if not exists gps_trail_run_idx on public.operator_gps_trail (run_id);

create table if not exists public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  ts timestamptz not null,
  temperature_c numeric(4,1) not null,
  apparent_temperature_c numeric(4,1),
  humidity_pct numeric(5,1),
  wind_kmh numeric(5,1) not null,
  wind_from_deg numeric(5,1),
  wind_gust_kmh numeric(5,1),
  precipitation_mm numeric(6,2),
  weather_code int,
  shortwave_wm2 numeric(7,1),
  wbgt_c numeric(4,1),
  wind_chill_c numeric(4,1),
  forecast_peak_c numeric(4,1),
  forecast_peak_at timestamptz,
  source text not null default 'open_meteo_archive'
);
create index if not exists weather_site_ts_idx on public.weather_snapshots (site_id, ts);
create index if not exists weather_run_idx on public.weather_snapshots (run_id);

create table if not exists public.fault_codes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  machine_id uuid not null references public.machines(id),
  ts timestamptz not null,
  code_type text not null check (code_type in ('j1939_spn_fmi', 'cat_cid_fmi', 'cat_eid')),
  spn int, fmi int, cid int, mid int, eid int,
  severity public.fault_severity not null,
  description_key text not null,
  active boolean not null default true,
  cleared_at timestamptz
);
create index if not exists fault_codes_machine_ts_idx on public.fault_codes (machine_id, ts);
create index if not exists fault_codes_run_idx on public.fault_codes (run_id);

-- ── 2.10 Privacy ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id),
  version text not null,
  purpose text not null default 'safety_companion',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists consents_operator_idx on public.consents (operator_id);

-- ── Grants: clients read only where a policy allows; anon gets nothing; service_role bypasses RLS ───
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated, service_role;
grant select on
  public.sites, public.zones, public.machine_models, public.machines, public.operators, public.profiles,
  public.operator_pairings, public.protocol_cards, public.event_types, public.alert_policies, public.explanation_templates,
  public.app_config, public.scenarios, public.scenario_frames, public.scenario_runs, public.shifts, public.tasks,
  public.ppe_overrides, public.task_history, public.v_task_analytics, public.telemetry_readings, public.machine_state,
  public.operator_state, public.operator_gps_trail, public.weather_snapshots, public.fault_codes, public.consents
to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['sites', 'zones', 'machine_models', 'machines', 'operators', 'profiles', 'operator_pairings',
    'protocol_cards', 'event_types', 'alert_policies', 'explanation_templates', 'app_config', 'scenarios', 'scenario_frames',
    'scenario_runs', 'shifts', 'tasks', 'ppe_overrides', 'task_history', 'telemetry_readings', 'machine_state',
    'operator_state', 'operator_gps_trail', 'weather_snapshots', 'fault_codes', 'consents']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- reference data: every signed-in role may read
do $$
declare t text;
begin
  foreach t in array array['sites', 'zones', 'machine_models', 'machines', 'operators', 'protocol_cards', 'event_types',
    'alert_policies', 'explanation_templates', 'scenarios', 'scenario_runs', 'machine_state', 'weather_snapshots', 'fault_codes']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read_all', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read_all', t);
  end loop;
end $$;

-- profiles: own row; FM and TR all
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

-- app_config: FM only
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to authenticated using ((select private.is_fm()));

-- scenario_frames: no client policy at all (invisible to every client role; the worker reads them as owner)

-- own-or-staff tables (OP own rows; FM and TR all)
do $$
declare t text;
begin
  foreach t in array array['operator_pairings', 'shifts', 'tasks', 'task_history']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (operator_id = (select private.my_operator_id()) or (select private.is_staff()))', t || '_read', t);
  end loop;
end $$;

-- own-or-FM tables (OP own rows; FM all; TR nothing)
do $$
declare t text;
begin
  foreach t in array array['ppe_overrides', 'telemetry_readings', 'operator_state', 'operator_gps_trail', 'consents']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (operator_id = (select private.my_operator_id()) or (select private.is_fm()))', t || '_read', t);
  end loop;
end $$;
