-- Migration 005 (B10): the six P0 rule detectors as pure functions, `apply_findings`, and the detector hook.
-- References: data-model §2.5, event-pipeline §0/§1/§7/§8, api-contracts §12, backend-tasks B10.
--
-- Layers (G2-2):
--   pure      private.detect_seatbelt / _overspeed / _slope / _idle / _fault / _proximity, and detect_rules
--             (immutable, read nothing, write nothing; every division guarded; a null reading never fires)
--   effects   private.render_explanation, private.raise_alert (minimal; B12 replaces it), private.apply_findings
--   hook      private.detect_frame (replaces the B9 no-op): reads the state apply_frame just wrote, builds the
--             pure inputs, calls detect_rules, hands the findings to apply_findings
--
-- Every event goes through private.emit_event, so private.event_visible(), the sealed-ledger rules and the
-- ledger/Loop enqueue in the event trigger apply unchanged. Nothing here writes the ledger.
--
-- Decisions (also in the track-b log):
--   * Edge-triggered. A condition that stays true over many frames is ONE event and ONE alert: private.rule_state
--     remembers which (machine, rule, subject) is active and re-fires only on a tier increase. Event keys are
--     det:{run}:{machine code}:{rule}[:{subject}]:{frame_seq}; a re-applied frame is a no-op (EP §8).
--   * slope_exceeded is subsumed by seatbelt_off_moving in the same frame (the breach already carries the slope
--     and goes critical over the zone limit): one breach is exactly one event.
--   * proximity fires only for the warning and danger rings of a MOVING machine and an on-foot person; the
--     awareness ring stays in operator_state.nearest (a ring event per frame would drown the inbox).
--   * Events of audience 'site' (anomaly.detected) carry no operator_id: a site topic reaches every operator, so
--     the row must not say who was idling (data-model §2.10). anomalies.operator_id is RLS-protected instead.
--   * An alert's tier is capped at its policy's tier_max (idle_excess and anomaly_machine stay at caution).
--   * Alert resolution, upgrade events (alert.raised), rate caps and dispatch belong to B12; nothing here dispatches.
--   * Catch-up frames still produce anomalies and events; their alert is stored suppressed (catch_up), EP §0.

-- ── 1. tables ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scenario_runs(id) on delete cascade,
  machine_id uuid not null references public.machines(id),
  operator_id uuid references public.operators(id),
  anomaly_type public.anomaly_type not null,
  method text not null check (method in ('rule', 'ewma')),
  ts_start timestamptz not null,
  ts_end timestamptz,
  severity_score int not null check (severity_score between 0 and 100),
  severity_tier public.alert_tier not null,
  explanation jsonb not null check (jsonb_typeof(explanation) = 'object' and explanation ? 'en' and explanation ? 'hi'),
  fuel_l numeric(8,1),
  cost_inr numeric(10,0),
  features jsonb not null default '{}',
  location extensions.geography(Point, 4326),
  event_id uuid,                       -- the event that announced it (no FK: purge_run deletes events first)
  created_at timestamptz not null default now()
);
create index if not exists anomalies_run_idx on public.anomalies (run_id);
create index if not exists anomalies_machine_idx on public.anomalies (machine_id, ts_start);
create index if not exists anomalies_operator_idx on public.anomalies (operator_id);
alter table public.anomalies enable row level security;
drop policy if exists anomalies_read on public.anomalies;
create policy anomalies_read on public.anomalies for select to authenticated
  using (operator_id is null or operator_id = (select private.my_operator_id()) or (select private.is_staff()));
grant select on public.anomalies to authenticated;

create table if not exists private.rule_state (
  run_id uuid not null references public.scenario_runs(id) on delete cascade,
  machine_id uuid not null references public.machines(id),
  rule text not null,
  subject text not null default '',     -- '' except proximity (the person's operator id)
  active boolean not null,
  tier public.alert_tier not null,
  since_ts timestamptz not null,
  last_frame_seq int not null,
  anomaly_id uuid,
  alert_id uuid,
  updated_at timestamptz not null default now(),
  primary key (run_id, machine_id, rule, subject)
);
create index if not exists rule_state_machine_idx on private.rule_state (machine_id);

drop type if exists private.finding cascade;
create type private.finding as (
  rule text, anomaly_type text, event_type text, alert_kind text,
  tier public.alert_tier, severity_score int,
  machine_id uuid, machine_code text, operator_id uuid, subject text,
  features jsonb, event_payload jsonb, slots jsonb,
  fuel_l numeric, cost_inr numeric, lat double precision, lon double precision);

-- ── 2. pure helpers and detectors ───────────────────────────────────────────────────────────────
create or replace function private.severity_tier(p_score int)
returns public.alert_tier language sql immutable set search_path = '' as $$
  select case when p_score is null or p_score < 25 then 'info'::public.alert_tier
              when p_score < 50 then 'caution'::public.alert_tier
              when p_score < 75 then 'warning'::public.alert_tier
              else 'critical'::public.alert_tier end
$$;

-- p_frame : {machine_id, machine_code, operator_id, frame_seq, speed_kmh, pitch_deg, roll_deg, seatbelt_fastened, lat, lon}
-- p_state : {zone:{id,max_speed_kmh,max_slope_deg}|null, idle:{idle_h,engine_h,elapsed_min,baseline_idle_pct,idle_fuel_lph}|null,
--            fault:{code,severity,minutes}|null, people:[{operator_id,distance_m}]}
-- p_cfg   : {motion_speed_kmh, default_max_slope_deg, idle_caution_pct, idle_warning_pct, idle_min_window_min,
--            fuel_price_inr_per_l, fault_grace_min, danger_radius_m, warning_radius_m}

create or replace function private.detect_seatbelt(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare speed numeric := (p_frame ->> 'speed_kmh')::numeric;
        pitch numeric := (p_frame ->> 'pitch_deg')::numeric;
        roll numeric := (p_frame ->> 'roll_deg')::numeric;
        mv numeric := coalesce((p_cfg ->> 'motion_speed_kmh')::numeric, 0.5);
        slope numeric; lim numeric; crit boolean; f private.finding;
begin
  if (p_frame ->> 'seatbelt_fastened') is distinct from 'false' then return; end if;   -- null = unknown: never fires
  if speed is null or speed <= mv then return; end if;
  slope := greatest(abs(coalesce(pitch, 0)), abs(coalesce(roll, 0)));
  lim := coalesce((p_state #>> '{zone,max_slope_deg}')::numeric, (p_cfg ->> 'default_max_slope_deg')::numeric);
  crit := lim is not null and slope > lim;
  f.rule := 'seatbelt_off_moving'; f.anomaly_type := 'seatbelt_off_moving';
  f.event_type := 'safety.seatbelt_breach'; f.alert_kind := 'seatbelt_off_moving';
  f.severity_score := case when crit then 85 else 60 end;
  f.tier := private.severity_tier(f.severity_score);
  f.machine_id := (p_frame ->> 'machine_id')::uuid; f.machine_code := p_frame ->> 'machine_code';
  f.operator_id := (p_frame ->> 'operator_id')::uuid; f.subject := '';
  f.features := jsonb_build_object('speed_kmh', speed, 'pitch_deg', coalesce(pitch, 0), 'roll_deg', coalesce(roll, 0),
                                   'slope_limit_deg', coalesce(lim, 0));
  f.event_payload := jsonb_build_object('frame_seq', (p_frame ->> 'frame_seq')::int, 'speed_kmh', speed,
                       'pitch_deg', coalesce(pitch, 0), 'roll_deg', coalesce(roll, 0), 'slope_limit_deg', lim,
                       'zone_id', p_state #> '{zone,id}');
  f.slots := jsonb_build_object('speed_kmh', speed, 'pitch_deg', slope);
  f.lat := (p_frame ->> 'lat')::double precision; f.lon := (p_frame ->> 'lon')::double precision;
  return next f;
end $$;

create or replace function private.detect_overspeed(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare speed numeric := (p_frame ->> 'speed_kmh')::numeric;
        lim numeric := (p_state #>> '{zone,max_speed_kmh}')::numeric; f private.finding;
begin
  if speed is null or lim is null or lim <= 0 or speed <= lim then return; end if;
  f.rule := 'overspeed'; f.anomaly_type := 'overspeed'; f.event_type := 'safety.overspeed'; f.alert_kind := null;
  f.severity_score := least(70, 30 + floor(100 * (speed - lim) / lim))::int;
  f.tier := private.severity_tier(f.severity_score);
  f.machine_id := (p_frame ->> 'machine_id')::uuid; f.machine_code := p_frame ->> 'machine_code';
  f.operator_id := (p_frame ->> 'operator_id')::uuid; f.subject := '';
  f.features := jsonb_build_object('speed_kmh', speed, 'limit_kmh', lim);
  f.event_payload := jsonb_build_object('frame_seq', (p_frame ->> 'frame_seq')::int, 'speed_kmh', speed,
                       'limit_kmh', lim, 'zone_id', p_state #> '{zone,id}');
  f.slots := jsonb_build_object('speed_kmh', speed, 'limit_kmh', lim);
  f.lat := (p_frame ->> 'lat')::double precision; f.lon := (p_frame ->> 'lon')::double precision;
  return next f;
end $$;

create or replace function private.detect_slope(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare speed numeric := (p_frame ->> 'speed_kmh')::numeric;
        pitch numeric := (p_frame ->> 'pitch_deg')::numeric;
        roll numeric := (p_frame ->> 'roll_deg')::numeric;
        mv numeric := coalesce((p_cfg ->> 'motion_speed_kmh')::numeric, 0.5);
        slope numeric; lim numeric; f private.finding;
begin
  if speed is null or speed <= mv then return; end if;           -- a parked machine on a slope is not working it
  if pitch is null and roll is null then return; end if;
  slope := greatest(abs(coalesce(pitch, 0)), abs(coalesce(roll, 0)));
  lim := coalesce((p_state #>> '{zone,max_slope_deg}')::numeric, (p_cfg ->> 'default_max_slope_deg')::numeric);
  if lim is null or slope <= lim then return; end if;
  f.rule := 'slope_exceeded'; f.anomaly_type := 'slope_exceeded'; f.event_type := 'safety.slope_exceeded'; f.alert_kind := null;
  f.severity_score := least(80, 50 + floor(5 * (slope - lim)))::int;
  f.tier := private.severity_tier(f.severity_score);
  f.machine_id := (p_frame ->> 'machine_id')::uuid; f.machine_code := p_frame ->> 'machine_code';
  f.operator_id := (p_frame ->> 'operator_id')::uuid; f.subject := '';
  f.features := jsonb_build_object('pitch_deg', coalesce(pitch, 0), 'roll_deg', coalesce(roll, 0), 'limit_deg', lim);
  f.event_payload := jsonb_build_object('frame_seq', (p_frame ->> 'frame_seq')::int, 'pitch_deg', coalesce(pitch, 0),
                       'roll_deg', coalesce(roll, 0), 'limit_deg', lim);
  f.slots := jsonb_build_object('pitch_deg', slope, 'limit_deg', lim);
  f.lat := (p_frame ->> 'lat')::double precision; f.lon := (p_frame ->> 'lon')::double precision;
  return next f;
end $$;

-- api-contracts §12: excess_idle_h = idle_h − baseline/100 × engine_h; fuel_l = round(excess × idle_fuel_lph, 1);
-- cost_inr = round(fuel_l × price, −1); ratio_to_normal = idle_pct ÷ baseline_idle_pct.
create or replace function private.detect_idle(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare i jsonb := p_state -> 'idle';
        idle_h numeric; engine_h numeric; elapsed numeric; base numeric; lph numeric; price numeric;
        idle_pct numeric; excess numeric; ratio numeric; fuel numeric; cost numeric; f private.finding;
begin
  if i is null or jsonb_typeof(i) <> 'object' then return; end if;
  idle_h := (i ->> 'idle_h')::numeric; engine_h := (i ->> 'engine_h')::numeric;
  elapsed := (i ->> 'elapsed_min')::numeric; base := (i ->> 'baseline_idle_pct')::numeric;
  lph := (i ->> 'idle_fuel_lph')::numeric; price := (p_cfg ->> 'fuel_price_inr_per_l')::numeric;
  if idle_h is null or engine_h is null or elapsed is null or base is null or lph is null or price is null then return; end if;
  if engine_h <= 0 or idle_h < 0 or base <= 0 or lph <= 0 then return; end if;     -- sd = 0 analogue: no division by zero
  if elapsed < coalesce((p_cfg ->> 'idle_min_window_min')::numeric, 30) then return; end if;
  idle_pct := 100 * idle_h / engine_h;
  if idle_pct < coalesce((p_cfg ->> 'idle_caution_pct')::numeric, 40) then return; end if;
  excess := idle_h - base / 100 * engine_h;
  if excess <= 0 then return; end if;                                               -- at or under its normal: no cost, no finding
  ratio := idle_pct / base;
  fuel := round(excess * lph, 1);
  cost := round(fuel * price, -1);
  f.rule := 'idle_excess'; f.anomaly_type := 'idle_excess'; f.event_type := 'anomaly.detected'; f.alert_kind := 'idle_excess';
  f.severity_score := case when idle_pct >= coalesce((p_cfg ->> 'idle_warning_pct')::numeric, 50) then 60 else 40 end;
  f.tier := private.severity_tier(f.severity_score);
  f.machine_id := (p_frame ->> 'machine_id')::uuid; f.machine_code := p_frame ->> 'machine_code';
  f.operator_id := (p_frame ->> 'operator_id')::uuid; f.subject := '';
  f.features := jsonb_build_object('idle_pct', round(idle_pct, 1), 'ratio_to_normal', round(ratio, 2),
                  'baseline_idle_pct', base, 'idle_h', idle_h, 'engine_h', engine_h, 'excess_idle_h', round(excess, 3));
  f.slots := jsonb_build_object('idle_pct', round(idle_pct), 'ratio', round(ratio, 1), 'fuel_l', fuel, 'cost_inr', cost);
  f.fuel_l := fuel; f.cost_inr := cost;
  f.lat := (p_frame ->> 'lat')::double precision; f.lon := (p_frame ->> 'lon')::double precision;
  return next f;
end $$;

create or replace function private.detect_fault(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare fl jsonb := p_state -> 'fault';
        speed numeric := (p_frame ->> 'speed_kmh')::numeric;
        mv numeric := coalesce((p_cfg ->> 'motion_speed_kmh')::numeric, 0.5);
        minutes numeric; sev text; f private.finding;
begin
  if fl is null or jsonb_typeof(fl) <> 'object' then return; end if;
  sev := fl ->> 'severity'; minutes := (fl ->> 'minutes')::numeric;
  if sev is null or minutes is null or speed is null then return; end if;
  if sev not in ('caution', 'derate', 'shutdown') then return; end if;               -- 'info' faults never fire
  if speed <= mv then return; end if;                                                -- stopped: not "kept working"
  if minutes < coalesce((p_cfg ->> 'fault_grace_min')::numeric, 5) then return; end if;
  f.rule := 'fault_continued_operation'; f.anomaly_type := 'fault_continued_operation';
  f.event_type := 'anomaly.detected'; f.alert_kind := 'anomaly_machine';
  f.severity_score := case sev when 'shutdown' then 80 when 'derate' then 60 else 35 end;
  f.tier := private.severity_tier(f.severity_score);
  f.machine_id := (p_frame ->> 'machine_id')::uuid; f.machine_code := p_frame ->> 'machine_code';
  f.operator_id := (p_frame ->> 'operator_id')::uuid; f.subject := '';
  f.features := jsonb_build_object('minutes', floor(minutes), 'speed_kmh', speed);
  f.slots := jsonb_build_object('minutes', floor(minutes), 'code', fl ->> 'code');
  f.lat := (p_frame ->> 'lat')::double precision; f.lon := (p_frame ->> 'lon')::double precision;
  return next f;
end $$;

-- one finding per person inside the warning ring of a MOVING machine; awareness (outside) never fires
create or replace function private.detect_proximity(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare speed numeric := (p_frame ->> 'speed_kmh')::numeric;
        mv numeric := coalesce((p_cfg ->> 'motion_speed_kmh')::numeric, 0.5);
        danger numeric := coalesce((p_cfg ->> 'danger_radius_m')::numeric, 15);
        warn numeric := greatest(coalesce((p_cfg ->> 'warning_radius_m')::numeric, 30), danger);
        p jsonb; d numeric; z text; f private.finding;
begin
  if speed is null or speed <= mv then return; end if;
  if p_state -> 'people' is null or jsonb_typeof(p_state -> 'people') <> 'array' then return; end if;
  for p in select e from jsonb_array_elements(p_state -> 'people') e loop
    d := (p ->> 'distance_m')::numeric;
    if d is null or p ->> 'operator_id' is null or d > warn then continue; end if;
    z := case when d <= danger then 'danger' else 'warning' end;
    f.rule := 'proximity_person_machine'; f.anomaly_type := null; f.event_type := 'safety.proximity';
    f.alert_kind := 'proximity_zone';
    f.severity_score := case z when 'danger' then 70 else 40 end;
    f.tier := private.severity_tier(f.severity_score);
    f.machine_id := (p_frame ->> 'machine_id')::uuid; f.machine_code := p_frame ->> 'machine_code';
    f.operator_id := (p ->> 'operator_id')::uuid;        -- the person at risk
    f.subject := p ->> 'operator_id';
    f.features := jsonb_build_object('distance_m', d);
    f.event_payload := jsonb_build_object('other_kind', 'machine', 'other_id', p_frame ->> 'machine_id',
                         'distance_m', d, 'zone', z);
    f.slots := '{}'::jsonb;
    f.lat := (p_frame ->> 'lat')::double precision; f.lon := (p_frame ->> 'lon')::double precision;
    return next f;
  end loop;
end $$;

create or replace function private.detect_rules(p_frame jsonb, p_state jsonb, p_cfg jsonb)
returns setof private.finding language plpgsql immutable set search_path = '' as $$
declare f private.finding; v_belt boolean := false;
begin
  for f in select * from private.detect_seatbelt(p_frame, p_state, p_cfg) loop v_belt := true; return next f; end loop;
  for f in select * from private.detect_overspeed(p_frame, p_state, p_cfg) loop return next f; end loop;
  if not v_belt then   -- the breach already carries the slope (and goes critical over the limit)
    for f in select * from private.detect_slope(p_frame, p_state, p_cfg) loop return next f; end loop;
  end if;
  for f in select * from private.detect_idle(p_frame, p_state, p_cfg) loop return next f; end loop;
  for f in select * from private.detect_fault(p_frame, p_state, p_cfg) loop return next f; end loop;
  for f in select * from private.detect_proximity(p_frame, p_state, p_cfg) loop return next f; end loop;
end $$;

-- ── 3. effects ──────────────────────────────────────────────────────────────────────────────────
-- Named-slot substitution (R2-4: format() only takes %s). Numbers are printed without trailing zeros;
-- cost_inr gets thousands separators. A template slot left unfilled raises, so the poison-frame log shows it.
create or replace function private.render_explanation(p_type text, p_slots jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare t public.explanation_templates%rowtype; en text; hi text; k text; v jsonb; s text;
begin
  select * into t from public.explanation_templates where anomaly_type = p_type::public.anomaly_type;
  if not found then raise exception 'no explanation template for %', p_type using errcode = 'P0001'; end if;
  en := t.en; hi := t.hi;
  for k, v in select * from jsonb_each(coalesce(p_slots, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'number' then
      s := case when k = 'cost_inr' then to_char((v #>> '{}')::numeric, 'FM999,999,999,990')
                else trim_scale((v #>> '{}')::numeric)::text end;
    else
      s := v #>> '{}';
    end if;
    en := replace(en, '{' || k || '}', coalesce(s, ''));
    hi := replace(hi, '{' || k || '}', coalesce(s, ''));
  end loop;
  if en ~ '\{[a-z_]+\}' or hi ~ '\{[a-z_]+\}' then
    raise exception 'explanation % has an unfilled slot: %', p_type, en using errcode = 'P0001';
  end if;
  return jsonb_build_object('en', en, 'hi', hi);
end $$;

-- Minimal alert write for B10 (B12 replaces this body with the full engine: grouped suppression, rate cap,
-- flood summary, alert.raised on upgrade). Dedupe is by hazard_key; a higher tier upgrades in place.
create or replace function private.raise_alert(p_run_id uuid, p_kind text, p_hazard_key text, p_tier public.alert_tier,
  p_site_id uuid, p_operator_id uuid, p_machine_id uuid, p_catchup boolean, p_protocol_card_id text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pol public.alert_policies%rowtype; a public.alerts%rowtype; v_tier public.alert_tier; v_id uuid; v_esc timestamptz; i int;
begin
  select * into pol from public.alert_policies where kind = p_kind;
  if not found then raise exception 'unknown alert kind %', p_kind using errcode = 'P0001'; end if;
  v_tier := least(p_tier, pol.tier_max);
  if p_catchup then            -- EP §0: catch-up alerts are stored, never dispatched
    insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                               suppress_reason, protocol_card_id)
    values (p_run_id, p_kind, p_hazard_key, v_tier, 'suppressed', p_operator_id, p_machine_id, p_site_id, false,
            'catch_up', p_protocol_card_id)
    returning id into v_id;
    return v_id;
  end if;
  v_esc := case when pol.needs_ack and pol.ack_timeout_s is not null then now() + make_interval(secs => pol.ack_timeout_s) end;
  for i in 1..2 loop
    select * into a from public.alerts
      where hazard_key = p_hazard_key and status in ('open', 'acknowledged', 'escalating') and kind <> 'sos' for update;
    if found then
      if v_tier > a.tier then
        update public.alerts set tier = v_tier, occurrences = occurrences + 1, last_seen = now(),
          tier_history = tier_history || jsonb_build_array(jsonb_build_object('from', a.tier, 'to', v_tier, 'at', now())),
          escalate_at = case when status = 'open' then coalesce(v_esc, escalate_at) else escalate_at end
          where id = a.id;
      else
        update public.alerts set occurrences = occurrences + 1, last_seen = now() where id = a.id;
      end if;
      return a.id;
    end if;
    begin
      insert into public.alerts (run_id, kind, hazard_key, tier, status, operator_id, machine_id, site_id, needs_ack,
                                 escalate_at, protocol_card_id)
      values (p_run_id, p_kind, p_hazard_key, v_tier, 'open', p_operator_id, p_machine_id, p_site_id, pol.needs_ack,
              v_esc, p_protocol_card_id)
      returning id into v_id;
      return v_id;
    exception when unique_violation then null;   -- a concurrent writer won: loop and merge into it
    end;
  end loop;
  raise exception 'raise_alert could not settle hazard %', p_hazard_key using errcode = 'P0001';
end $$;

-- The effects layer. p_clear_machine / p_clear_person say whose active rules this evaluation covered: an active
-- rule of that machine (or proximity pair of that person) with no finding in p_findings is cleared.
create or replace function private.apply_findings(p_run_id uuid, p_frame_seq int, p_sim_ts timestamptz, p_catchup boolean,
  p_findings private.finding[], p_clear_machine uuid default null, p_clear_person uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare f private.finding; st private.rule_state%rowtype; v_site uuid; v_site_loc extensions.geography;
        v_key text; v_loc extensions.geography; v_expl jsonb; v_anom uuid; v_alert uuid; v_payload jsonb;
        ev public.events%rowtype; v_fired int := 0; v_sub text; v_group text; v_since timestamptz; v_had boolean;
begin
  select s.site_id, si.location into v_site, v_site_loc
    from public.scenario_runs r join public.scenarios s on s.id = r.scenario_id join public.sites si on si.id = s.site_id
    where r.id = p_run_id;
  if v_site is null then raise exception 'apply_findings: unknown run %', p_run_id using errcode = 'P0001'; end if;

  foreach f in array coalesce(p_findings, '{}'::private.finding[]) loop
    v_sub := coalesce(f.subject, '');
    v_key := 'det:' || p_run_id::text || ':' || f.machine_code || ':' || f.rule || ':'
             || case when v_sub <> '' then v_sub || ':' else '' end || p_frame_seq::text;
    if exists (select 1 from public.events e where e.idempotency_key = v_key) then continue; end if;   -- re-applied frame
    select * into st from private.rule_state r
      where r.run_id = p_run_id and r.machine_id = f.machine_id and r.rule = f.rule and r.subject = v_sub;
    v_had := found and st.active;
    if v_had and f.tier <= st.tier then
      update private.rule_state set last_frame_seq = p_frame_seq, updated_at = now()
        where run_id = p_run_id and machine_id = f.machine_id and rule = f.rule and subject = v_sub;
      continue;                                                                                          -- still the same breach
    end if;

    -- fire ---------------------------------------------------------------------------------------
    v_loc := coalesce(
      case when f.lat is not null and f.lon is not null
           then extensions.ST_SetSRID(extensions.ST_MakePoint(f.lon, f.lat), 4326)::extensions.geography end,
      (select ms.location from public.machine_state ms where ms.run_id = p_run_id and ms.machine_id = f.machine_id),
      v_site_loc);
    v_anom := null; v_alert := null; v_expl := null;
    if v_had and st.anomaly_id is not null then   -- tier upgrade: close the earlier anomaly
      update public.anomalies set ts_end = p_sim_ts where id = st.anomaly_id and ts_end is null;
    end if;
    if f.anomaly_type is not null then
      v_expl := private.render_explanation(f.anomaly_type, f.slots || jsonb_build_object('machine', f.machine_code));
      insert into public.anomalies (run_id, machine_id, operator_id, anomaly_type, method, ts_start, severity_score,
                                    severity_tier, explanation, fuel_l, cost_inr, features, location)
      values (p_run_id, f.machine_id, f.operator_id, f.anomaly_type::public.anomaly_type, 'rule', p_sim_ts,
              f.severity_score, f.tier, v_expl, f.fuel_l, f.cost_inr, f.features, v_loc)
      returning id into v_anom;
    end if;
    if f.alert_kind is not null then
      select p.hazard_group into v_group from public.alert_policies p where p.kind = f.alert_kind;
      v_alert := private.raise_alert(p_run_id, f.alert_kind,
        v_group || ':' || coalesce(f.operator_id::text, '-') || ':' || f.machine_code,
        f.tier, v_site, f.operator_id, f.machine_id, p_catchup);
    end if;
    if f.event_type = 'anomaly.detected' then
      v_payload := jsonb_build_object('anomaly_id', v_anom, 'anomaly_type', f.anomaly_type, 'method', 'rule',
        'severity_score', f.severity_score, 'severity_tier', f.tier, 'explanation', v_expl,
        'fuel_l', f.fuel_l, 'cost_inr', f.cost_inr, 'features', f.features,
        'lat', extensions.ST_Y(v_loc::extensions.geometry), 'lon', extensions.ST_X(v_loc::extensions.geometry));
    else
      v_payload := f.event_payload;
      if v_anom is not null then
        v_payload := v_payload || jsonb_build_object('anomaly_id', v_anom, 'severity_score', f.severity_score,
                       'severity_tier', f.tier, 'explanation', v_expl);
      end if;
    end if;
    ev := private.emit_event(f.event_type, v_payload, v_key, 'detector.rule', v_site, p_run_id, f.machine_id,
            case when f.event_type = 'anomaly.detected' then null else f.operator_id end,   -- site-audience rows name nobody
            null::uuid, v_alert, p_sim_ts, f.tier);
    if v_anom is not null then update public.anomalies set event_id = ev.id where id = v_anom; end if;
    if v_alert is not null then
      update public.alerts set origin_event_id = ev.id where id = v_alert and origin_event_id is null;
    end if;
    v_since := case when v_had then st.since_ts else p_sim_ts end;
    insert into private.rule_state (run_id, machine_id, rule, subject, active, tier, since_ts, last_frame_seq, anomaly_id, alert_id)
    values (p_run_id, f.machine_id, f.rule, v_sub, true, f.tier, v_since, p_frame_seq, v_anom, v_alert)
    on conflict (run_id, machine_id, rule, subject) do update set active = true, tier = excluded.tier,
      since_ts = excluded.since_ts, last_frame_seq = excluded.last_frame_seq, anomaly_id = excluded.anomaly_id,
      alert_id = excluded.alert_id, updated_at = now();
    if v_anom is not null then
      update public.machine_state set active_anomaly_ids = array_append(array_remove(active_anomaly_ids, st.anomaly_id), v_anom)
        where run_id = p_run_id and machine_id = f.machine_id;
    end if;
    v_fired := v_fired + 1;
  end loop;

  -- clear what this evaluation covered and no longer finds
  for st in
    select * from private.rule_state r
      where r.run_id = p_run_id and r.active
        and ((p_clear_machine is not null and r.machine_id = p_clear_machine)
          or (p_clear_person is not null and r.rule = 'proximity_person_machine' and r.subject = p_clear_person::text))
  loop
    if not exists (select 1 from unnest(coalesce(p_findings, '{}'::private.finding[])) u
                   where u.machine_id = st.machine_id and u.rule = st.rule and coalesce(u.subject, '') = st.subject) then
      update private.rule_state set active = false, last_frame_seq = p_frame_seq, updated_at = now()
        where run_id = st.run_id and machine_id = st.machine_id and rule = st.rule and subject = st.subject;
      if st.anomaly_id is not null then
        update public.anomalies set ts_end = p_sim_ts where id = st.anomaly_id and ts_end is null;
        update public.machine_state set active_anomaly_ids = array_remove(active_anomaly_ids, st.anomaly_id)
          where run_id = st.run_id and machine_id = st.machine_id;
      end if;
    end if;
  end loop;
  return v_fired;
end $$;

-- ── 4. the hook: replaces the B9 no-op ──────────────────────────────────────────────────────────
-- Runs inside step_tick's per-frame exception block, on the state apply_frame just wrote. A telemetry frame
-- evaluates its machine; a gps / operator_state frame evaluates the person against moving machines nearby.
create or replace function private.detect_frame(p_run_id uuid, p_frame public.scenario_frames,
                                                p_frame_sim timestamptz, p_catchup boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare cfg public.app_config%rowtype; c jsonb; v_site uuid;
        ms public.machine_state%rowtype; os public.operator_state%rowtype; m record;
        v_frame jsonb; v_state jsonb; v_findings private.finding[] := '{}'; v_all private.finding[] := '{}';
        v_zone jsonb; v_idle jsonb; v_fault jsonb; v_people jsonb; cur record; base record;
        v_warn numeric;
begin
  if p_frame.kind not in ('telemetry', 'gps', 'operator_state') then return 0; end if;
  select * into cfg from public.app_config where id;
  select s.site_id into v_site from public.scenario_runs r join public.scenarios s on s.id = r.scenario_id where r.id = p_run_id;
  v_warn := greatest(coalesce(cfg.danger_radius_m, 15), 30);
  c := jsonb_build_object('motion_speed_kmh', cfg.motion_speed_kmh, 'default_max_slope_deg', 15,
         'idle_caution_pct', 40, 'idle_warning_pct', 50, 'idle_min_window_min', 30,
         'fuel_price_inr_per_l', cfg.fuel_price_inr_per_l, 'fault_grace_min', 5,
         'danger_radius_m', cfg.danger_radius_m, 'warning_radius_m', v_warn);

  if p_frame.kind = 'telemetry' then
    if p_frame.machine_id is null then return 0; end if;
    select * into ms from public.machine_state s where s.run_id = p_run_id and s.machine_id = p_frame.machine_id;
    if not found then return 0; end if;
    select mc.code as code, mm.baseline_idle_pct, mm.idle_fuel_lph into m
      from public.machines mc left join public.machine_models mm on mm.id = mc.model_id where mc.id = p_frame.machine_id;

    select jsonb_build_object('id', z.id, 'max_speed_kmh', z.max_speed_kmh, 'max_slope_deg', z.max_slope_deg) into v_zone
      from public.zones z
      where z.site_id = v_site and ms.location is not null and extensions.ST_Covers(z.boundary, ms.location)
      order by extensions.ST_Area(z.boundary) limit 1;

    -- idle over the rolling 60 sim-minute window (the reading this frame just wrote vs the one an hour earlier)
    select t.ts, t.engine_hours, t.idle_hours into cur from public.telemetry_readings t
      where t.run_id = p_run_id and t.frame_seq = p_frame.seq;
    if cur.engine_hours is not null and cur.idle_hours is not null then
      select t.ts, t.engine_hours, t.idle_hours into base from public.telemetry_readings t
        where t.run_id = p_run_id and t.machine_id = p_frame.machine_id and t.ts <= cur.ts - interval '60 minutes'
          and t.engine_hours is not null and t.idle_hours is not null order by t.ts desc limit 1;
      if base.ts is null then
        select t.ts, t.engine_hours, t.idle_hours into base from public.telemetry_readings t
          where t.run_id = p_run_id and t.machine_id = p_frame.machine_id and t.ts < cur.ts
            and t.engine_hours is not null and t.idle_hours is not null order by t.ts asc limit 1;
      end if;
      if base.ts is not null then
        v_idle := jsonb_build_object('idle_h', cur.idle_hours - base.idle_hours, 'engine_h', cur.engine_hours - base.engine_hours,
          'elapsed_min', extract(epoch from (cur.ts - base.ts)) / 60.0,
          'baseline_idle_pct', m.baseline_idle_pct, 'idle_fuel_lph', m.idle_fuel_lph);
      end if;
    end if;

    -- the worst fault that is active NOW and how long it has been continuously active
    select jsonb_build_object('code', x.code, 'severity', x.severity,
             'minutes', floor(extract(epoch from (p_frame_sim - x.first_ts)) / 60.0)) into v_fault
      from (
        select case when g.spn is not null then 'SPN' || g.spn || '-FMI' || coalesce(g.fmi::text, '?')
                    when g.cid is not null then 'CID' || g.cid || '-FMI' || coalesce(g.fmi::text, '?')
                    else 'EID' || coalesce(g.eid::text, '?') end as code,
               (array_agg(g.severity::text order by g.ts desc))[1] as severity,
               (array_agg(g.active order by g.ts desc))[1] as is_active,
               min(g.ts) filter (where g.active and (g.last_clear is null or g.ts > g.last_clear)) as first_ts
          from (select f.*, max(case when not f.active then f.ts end)
                          over (partition by f.spn, f.fmi, f.cid, f.mid, f.eid) as last_clear
                  from public.fault_codes f
                 where f.run_id = p_run_id and f.machine_id = p_frame.machine_id and f.ts <= p_frame_sim) g
         group by g.spn, g.fmi, g.cid, g.mid, g.eid
      ) x
      where x.is_active and x.first_ts is not null and x.severity in ('caution', 'derate', 'shutdown')
      order by case x.severity when 'shutdown' then 3 when 'derate' then 2 else 1 end desc, x.first_ts asc limit 1;

    -- on-foot people near this machine (fresh state only: a stale position is not a hazard)
    select coalesce(jsonb_agg(jsonb_build_object('operator_id', o.operator_id,
             'distance_m', round(extensions.ST_Distance(o.location, ms.location)::numeric, 1))), '[]'::jsonb) into v_people
      from public.operator_state o
      where o.run_id = p_run_id and o.on_foot is true and o.location is not null and ms.location is not null
        and o.operator_id is distinct from ms.operator_id
        and o.ts >= p_frame_sim - interval '120 seconds'
        and extensions.ST_DWithin(o.location, ms.location, v_warn);

    v_frame := jsonb_build_object('machine_id', p_frame.machine_id, 'machine_code', m.code, 'operator_id', ms.operator_id,
      'frame_seq', p_frame.seq, 'speed_kmh', ms.speed_kmh, 'pitch_deg', ms.pitch_deg, 'roll_deg', ms.roll_deg,
      'seatbelt_fastened', ms.seatbelt_fastened,
      'lat', case when ms.location is not null then extensions.ST_Y(ms.location::extensions.geometry) end,
      'lon', case when ms.location is not null then extensions.ST_X(ms.location::extensions.geometry) end);
    v_state := jsonb_build_object('zone', v_zone, 'idle', v_idle, 'fault', v_fault, 'people', v_people);
    v_findings := array(select r from private.detect_rules(v_frame, v_state, c) r);
    return private.apply_findings(p_run_id, p_frame.seq, p_frame_sim, p_catchup, v_findings, p_frame.machine_id, null);
  end if;

  -- person-side frame: this operator against the moving machines around them
  if p_frame.operator_id is null then return 0; end if;
  select * into os from public.operator_state o where o.run_id = p_run_id and o.operator_id = p_frame.operator_id;
  if found and os.on_foot is true and os.location is not null then
    for m in
      select s.machine_id, mc.code, s.speed_kmh, s.location,
             round(extensions.ST_Distance(s.location, os.location)::numeric, 1) as dist
        from public.machine_state s join public.machines mc on mc.id = s.machine_id
       where s.run_id = p_run_id and s.location is not null and s.moving
         and s.operator_id is distinct from os.operator_id
         and s.ts >= p_frame_sim - interval '120 seconds'
         and extensions.ST_DWithin(s.location, os.location, v_warn)
    loop
      v_frame := jsonb_build_object('machine_id', m.machine_id, 'machine_code', m.code, 'frame_seq', p_frame.seq,
        'speed_kmh', m.speed_kmh, 'lat', extensions.ST_Y(m.location::extensions.geometry),
        'lon', extensions.ST_X(m.location::extensions.geometry));
      v_state := jsonb_build_object('people', jsonb_build_array(jsonb_build_object('operator_id', os.operator_id, 'distance_m', m.dist)));
      v_all := v_all || array(select r from private.detect_proximity(v_frame, v_state, c) r);
    end loop;
  end if;
  return private.apply_findings(p_run_id, p_frame.seq, p_frame_sim, p_catchup, v_all, null, p_frame.operator_id);
end $$;

comment on function private.detect_frame(uuid, public.scenario_frames, timestamptz, boolean) is
  'B10 detector hook (replaces the B9 no-op): builds the pure inputs from the state apply_frame just wrote, runs private.detect_rules, applies the findings. Runs inside step_tick''s per-frame exception block.';
comment on function private.detect_rules(jsonb, jsonb, jsonb) is
  'Pure (immutable) P0 rules: seatbelt_off_moving, overspeed, slope_exceeded (subsumed by a seatbelt breach), idle_excess, fault_continued_operation, proximity_person_machine. No table access, no writes; nulls never fire.';
comment on function private.apply_findings(uuid, int, timestamptz, boolean, private.finding[], uuid, uuid) is
  'Effects layer: anomaly row + explanation, alert (via raise_alert), event (via emit_event only), rule_state edge tracking. Idempotent on det:{run}:{machine}:{rule}:{frame_seq}.';
comment on function private.raise_alert(uuid, text, text, public.alert_tier, uuid, uuid, uuid, boolean, text) is
  'Minimal B10 alert write (dedupe by hazard_key, upgrade in place, catch-up suppressed). B12 replaces it with the full alert engine.';

revoke execute on function
  private.severity_tier(int), private.detect_seatbelt(jsonb, jsonb, jsonb), private.detect_overspeed(jsonb, jsonb, jsonb),
  private.detect_slope(jsonb, jsonb, jsonb), private.detect_idle(jsonb, jsonb, jsonb), private.detect_fault(jsonb, jsonb, jsonb),
  private.detect_proximity(jsonb, jsonb, jsonb), private.detect_rules(jsonb, jsonb, jsonb), private.render_explanation(text, jsonb),
  private.raise_alert(uuid, text, text, public.alert_tier, uuid, uuid, uuid, boolean, text),
  private.apply_findings(uuid, int, timestamptz, boolean, private.finding[], uuid, uuid),
  private.detect_frame(uuid, public.scenario_frames, timestamptz, boolean)
  from public, anon, authenticated;

-- ── 5. purge_run: also drops the rule state (body as in 004b plus one delete) ───────────────────
create or replace function private.purge_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.scenario_runs%rowtype; v jsonb := '{}'::jsonb; n int;
        v_ledger_before int; v_ledger_after int;
begin
  select * into v_run from public.scenario_runs r where r.id = p_run_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not v_run.rehearsal then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select count(*) into v_ledger_before from public.incidents i where i.run_id = p_run_id;

  -- BEFORE the events go. A queue row is a promise that an incident will be written; if its event
  -- is about to vanish, the promise must be withdrawn rather than left to fail forever. Only rows
  -- still unwritten are touched — anything already in the chain is immutable and stays, which is
  -- what the ledger check at the end of this function proves.
  delete from private.ledger_queue lq
    where lq.written_incident_id is null
      and lq.event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('ledger_queue', n);

  delete from public.replay_attempts ra
    where ra.replay_id in (select rs.id from public.replay_scenarios rs
                           where rs.source_event_id in (select e.id from public.events e where e.run_id = p_run_id));
  get diagnostics n = row_count; v := v || jsonb_build_object('replay_attempts', n);

  delete from public.replay_scenarios rs
    where rs.source_event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('replay_scenarios', n);

  delete from public.lesson_assignments la
    where la.because_event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('lesson_assignments', n);

  delete from private.loop_queue lq
    where lq.event_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('loop_queue', n);

  delete from public.dispatches d
    where d.alert_id in (select a.id from public.alerts a where a.run_id = p_run_id)
       or d.subject_id in (select e.id from public.events e where e.run_id = p_run_id);
  get diagnostics n = row_count; v := v || jsonb_build_object('dispatches', n);

  -- `alerts.origin_event_id → events` and `events.alert_id → alerts` point at each other, so neither
  -- table can go first. Both deletes therefore live in ONE statement: a non-deferrable foreign key is
  -- checked when the whole statement (data-modifying CTEs included) has finished, by which time both
  -- sides are gone. Splitting this in two would fail on whichever half ran first.
  with d_alerts as (delete from public.alerts a where a.run_id = p_run_id returning a.id)
  delete from public.events e where e.run_id = p_run_id;
  get diagnostics n = row_count; v := v || jsonb_build_object('events', n);

  -- B10/B11 tables: they do not exist yet, and purge_run must not wait for them to be written.
  if to_regclass('public.anomalies') is not null then
    execute 'delete from public.anomalies where run_id = $1' using p_run_id;
  end if;
  delete from private.rule_state where run_id = p_run_id;
  if to_regclass('private.detector_state') is not null then
    execute 'delete from private.detector_state where run_id = $1' using p_run_id;
  end if;

  delete from public.machine_state where run_id = p_run_id;
  delete from public.operator_state where run_id = p_run_id;
  delete from private.machine_broadcast where run_id = p_run_id;
  delete from public.operator_gps_trail where run_id = p_run_id;
  delete from public.telemetry_readings where run_id = p_run_id;
  get diagnostics n = row_count; v := v || jsonb_build_object('telemetry_readings', n);
  delete from public.weather_snapshots where run_id = p_run_id;
  delete from public.fault_codes where run_id = p_run_id;
  delete from private.tick_errors where run_id = p_run_id;
  delete from private.tick_log where run_id = p_run_id;

  select count(*) into v_ledger_after from public.incidents i where i.run_id = p_run_id;
  if v_ledger_after <> v_ledger_before then
    raise exception 'purge_run touched the ledger (% → %)', v_ledger_before, v_ledger_after using errcode = 'P0001';
  end if;

  return v || jsonb_build_object('run_id', p_run_id, 'incidents_kept', v_ledger_after);
end $$;
