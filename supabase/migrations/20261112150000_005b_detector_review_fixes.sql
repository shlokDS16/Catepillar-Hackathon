-- Migration 005b: Opus review of B10 (3 majors, 6 minors). 005 is applied, so every fix lands here.
--
-- MAJOR 1  A tier rise on an ACTIVE rule no longer re-fires the domain event. One breach stays one event, one
--          ledger_queue row, one loop_queue row, one lesson and one replay (EP §1). The alert is upgraded in
--          place (raise_alert) and ONE `alert.raised {upgraded_from}` is emitted (EP §7); the anomaly's severity
--          (and, for idle, its explanation and cost) is updated in place.
-- MAJOR 2  rule_state remembers whether the breach began in catch-up. On the first LIVE frame of a still-active
--          rule the alert is raised live (open, escalate_at), so a jump_to or a stall that lands mid-breach no
--          longer leaves the beat silent.
-- MAJOR 3  anomalies are site-scoped (new site_id) and follow data-model §2.10: an operator reads their own and
--          unattributed rows, the fleet manager reads the site's, the trainer reads unattributed rows only.
-- MINOR 4  A lost rule_state is rebuilt from the open anomaly, so the NEXT frame of the same breach is not a new one.
-- MINOR 5  A frame older than the rule's last seen frame can neither clear nor re-fire it.
-- MINOR 6  Honest wording: anomaly.detected events carry no operator_id, but operator_pairings plus
--          operators.display_name could still name the idler. operator_pairings is therefore narrowed to the
--          operator's own rows and the fleet manager (checked: nothing in apps/web, scripts or the security-definer
--          functions reads it through RLS; they run as owner).
-- MINOR 7  Thresholds live in app_config (tunable, EP §7 [A]).
-- MINOR 8  The idle window must be a FULL 60 sim-minutes, so "of the last hour" is true. The anomaly's numbers
--          are refreshed on a tier upgrade, not on every frame (the cost shown is that of the crossing).
-- MINOR 9  Alert resolution stays with B12: a fastened belt does not resolve the open seatbelt alert yet, so B12 must
--          resolve it before its sos-escalator exists, or a fastened belt escalates after 20 s.

-- ── thresholds ──────────────────────────────────────────────────────────────────────────────────
alter table public.app_config
  add column if not exists detector_default_slope_deg numeric(4,1) not null default 15,
  add column if not exists detector_idle_caution_pct numeric(5,1) not null default 40,
  add column if not exists detector_idle_warning_pct numeric(5,1) not null default 50,
  add column if not exists detector_idle_window_min int not null default 60,
  add column if not exists detector_fault_grace_min int not null default 5,
  add column if not exists detector_warning_radius_m numeric(6,1) not null default 30;

-- ── rule_state: catch-up flag and the announcing event ──────────────────────────────────────────
alter table private.rule_state
  add column if not exists catchup boolean not null default false,
  add column if not exists event_id uuid;

-- ── anomalies: site scope and §2.10 ─────────────────────────────────────────────────────────────
alter table public.anomalies add column if not exists site_id uuid references public.sites(id);
create index if not exists anomalies_site_idx on public.anomalies (site_id);
update public.anomalies a set site_id = s.site_id
  from public.scenario_runs r join public.scenarios s on s.id = r.scenario_id
  where a.run_id = r.id and a.site_id is null;
drop policy if exists anomalies_read on public.anomalies;
create policy anomalies_read on public.anomalies for select to authenticated using (
  site_id = (select private.my_site_id())
  and (operator_id is null or operator_id = (select private.my_operator_id()) or (select private.is_fm()))
);

-- ── operator_pairings: own rows and the fleet manager ───────────────────────────────────────────
drop policy if exists operator_pairings_read_all on public.operator_pairings;
drop policy if exists operator_pairings_read on public.operator_pairings;
create policy operator_pairings_read on public.operator_pairings for select to authenticated
  using (operator_id = (select private.my_operator_id()) or (select private.is_fm()));

-- ── apply_findings ──────────────────────────────────────────────────────────────────────────────
create or replace function private.apply_findings(p_run_id uuid, p_frame_seq int, p_sim_ts timestamptz, p_catchup boolean,
  p_findings private.finding[], p_clear_machine uuid default null, p_clear_person uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare f private.finding; st private.rule_state%rowtype; v_site uuid; v_site_loc extensions.geography;
        v_key text; v_loc extensions.geography; v_expl jsonb; v_anom uuid; v_alert uuid; v_payload jsonb;
        ev public.events%rowtype; v_fired int := 0; v_sub text; v_group text; v_hk text; v_had boolean;
        oa public.anomalies%rowtype; al public.alerts%rowtype; v_old_tier public.alert_tier;
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
    v_hk := null;
    if f.alert_kind is not null then
      select p.hazard_group into v_group from public.alert_policies p where p.kind = f.alert_kind;
      v_hk := v_group || ':' || coalesce(f.operator_id::text, '-') || ':' || f.machine_code;
    end if;

    select * into st from private.rule_state r
      where r.run_id = p_run_id and r.machine_id = f.machine_id and r.rule = f.rule and r.subject = v_sub;
    v_had := found and st.active;
    if not v_had and f.anomaly_type is not null then      -- MINOR 4: rebuild a lost rule_state from the open anomaly
      select * into oa from public.anomalies a
        where a.run_id = p_run_id and a.machine_id = f.machine_id and a.anomaly_type = f.anomaly_type::public.anomaly_type
          and a.ts_end is null order by a.ts_start desc limit 1;
      if found then
        v_had := true;
        st.run_id := p_run_id; st.machine_id := f.machine_id; st.rule := f.rule; st.subject := v_sub; st.active := true;
        st.tier := oa.severity_tier; st.since_ts := oa.ts_start; st.last_frame_seq := 0; st.anomaly_id := oa.id;
        st.catchup := false; st.event_id := oa.event_id;
        st.alert_id := (select a.id from public.alerts a where a.hazard_key = v_hk
                          and a.status in ('open', 'acknowledged', 'escalating') and a.kind <> 'sos' limit 1);
      end if;
    end if;

    if v_had then
      if p_frame_seq < st.last_frame_seq then continue; end if;          -- MINOR 5: an older frame changes nothing

      if f.tier > st.tier then
        -- MAJOR 1: upgrade in place. No new domain event, no new ledger or Loop work.
        if f.alert_kind is not null and not p_catchup then
          select a.tier into v_old_tier from public.alerts a where a.id = st.alert_id;
          v_alert := private.raise_alert(p_run_id, f.alert_kind, v_hk, f.tier, v_site, f.operator_id, f.machine_id, false);
          select * into al from public.alerts a where a.id = v_alert;
          if al.status in ('open', 'acknowledged', 'escalating') and (v_old_tier is null or al.tier > v_old_tier) then
            if al.origin_event_id is null then update public.alerts set origin_event_id = st.event_id where id = al.id; end if;
            perform private.emit_event('alert.raised',
              jsonb_build_object('alert_id', al.id, 'kind', al.kind, 'tier', al.tier, 'needs_ack', al.needs_ack,
                'escalate_at', al.escalate_at, 'occurrences', al.occurrences, 'protocol_card_id', al.protocol_card_id,
                'upgraded_from', v_old_tier),
              'alertup:' || al.id::text || ':' || al.tier::text, 'detector.rule', v_site, p_run_id, f.machine_id,
              case when f.event_type = 'anomaly.detected' then null else f.operator_id end,
              null::uuid, al.id, p_sim_ts, al.tier);
          end if;
          st.alert_id := v_alert; st.catchup := false;
        end if;
        if st.anomaly_id is not null then
          v_expl := private.render_explanation(f.anomaly_type, f.slots || jsonb_build_object('machine', f.machine_code));
          update public.anomalies set severity_score = f.severity_score, severity_tier = f.tier, explanation = v_expl,
            fuel_l = f.fuel_l, cost_inr = f.cost_inr, features = f.features where id = st.anomaly_id;
        end if;
        st.tier := f.tier;
      elsif st.catchup and not p_catchup and f.alert_kind is not null then
        -- MAJOR 2: the breach began in catch-up (alert stored suppressed) and is now live: raise it for real
        v_alert := private.raise_alert(p_run_id, f.alert_kind, v_hk, f.tier, v_site, f.operator_id, f.machine_id, false);
        if st.event_id is not null then
          update public.alerts set origin_event_id = st.event_id where id = v_alert and origin_event_id is null;
        end if;
        st.alert_id := v_alert; st.catchup := false;
      end if;
      insert into private.rule_state (run_id, machine_id, rule, subject, active, tier, since_ts, last_frame_seq,
                                      anomaly_id, alert_id, catchup, event_id)
      values (p_run_id, f.machine_id, f.rule, v_sub, true, st.tier, st.since_ts, p_frame_seq, st.anomaly_id,
              st.alert_id, st.catchup, st.event_id)
      on conflict (run_id, machine_id, rule, subject) do update set active = true, tier = excluded.tier,
        last_frame_seq = excluded.last_frame_seq, anomaly_id = excluded.anomaly_id, alert_id = excluded.alert_id,
        catchup = excluded.catchup, event_id = excluded.event_id, updated_at = now();
      continue;
    end if;

    -- fire: a rule that was not active ------------------------------------------------------------
    v_loc := coalesce(
      case when f.lat is not null and f.lon is not null
           then extensions.ST_SetSRID(extensions.ST_MakePoint(f.lon, f.lat), 4326)::extensions.geography end,
      (select ms.location from public.machine_state ms where ms.run_id = p_run_id and ms.machine_id = f.machine_id),
      v_site_loc);
    v_anom := null; v_alert := null; v_expl := null;
    if f.anomaly_type is not null then
      v_expl := private.render_explanation(f.anomaly_type, f.slots || jsonb_build_object('machine', f.machine_code));
      insert into public.anomalies (run_id, site_id, machine_id, operator_id, anomaly_type, method, ts_start, severity_score,
                                    severity_tier, explanation, fuel_l, cost_inr, features, location)
      values (p_run_id, v_site, f.machine_id, f.operator_id, f.anomaly_type::public.anomaly_type, 'rule', p_sim_ts,
              f.severity_score, f.tier, v_expl, f.fuel_l, f.cost_inr, f.features, v_loc)
      returning id into v_anom;
    end if;
    if f.alert_kind is not null then
      v_alert := private.raise_alert(p_run_id, f.alert_kind, v_hk, f.tier, v_site, f.operator_id, f.machine_id, p_catchup);
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
            case when f.event_type = 'anomaly.detected' then null else f.operator_id end,
            null::uuid, v_alert, p_sim_ts, f.tier);
    if v_anom is not null then update public.anomalies set event_id = ev.id where id = v_anom; end if;
    if v_alert is not null then
      update public.alerts set origin_event_id = ev.id where id = v_alert and origin_event_id is null;
    end if;
    insert into private.rule_state (run_id, machine_id, rule, subject, active, tier, since_ts, last_frame_seq,
                                    anomaly_id, alert_id, catchup, event_id)
    values (p_run_id, f.machine_id, f.rule, v_sub, true, f.tier, p_sim_ts, p_frame_seq, v_anom, v_alert, p_catchup, ev.id)
    on conflict (run_id, machine_id, rule, subject) do update set active = true, tier = excluded.tier,
      since_ts = excluded.since_ts, last_frame_seq = excluded.last_frame_seq, anomaly_id = excluded.anomaly_id,
      alert_id = excluded.alert_id, catchup = excluded.catchup, event_id = excluded.event_id, updated_at = now();
    if v_anom is not null then
      update public.machine_state set active_anomaly_ids = array_append(active_anomaly_ids, v_anom)
        where run_id = p_run_id and machine_id = f.machine_id;
    end if;
    v_fired := v_fired + 1;
  end loop;

  -- clear what this evaluation covered and no longer finds (never on an older frame)
  for st in
    select * from private.rule_state r
      where r.run_id = p_run_id and r.active and r.last_frame_seq < p_frame_seq
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
  v_warn := greatest(coalesce(cfg.danger_radius_m, 15), cfg.detector_warning_radius_m);
  c := jsonb_build_object('motion_speed_kmh', cfg.motion_speed_kmh, 'default_max_slope_deg', cfg.detector_default_slope_deg,
         'idle_caution_pct', cfg.detector_idle_caution_pct, 'idle_warning_pct', cfg.detector_idle_warning_pct,
         'idle_min_window_min', cfg.detector_idle_window_min, 'fuel_price_inr_per_l', cfg.fuel_price_inr_per_l,
         'fault_grace_min', cfg.detector_fault_grace_min, 'danger_radius_m', cfg.danger_radius_m, 'warning_radius_m', v_warn);

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

revoke execute on function
  private.apply_findings(uuid, int, timestamptz, boolean, private.finding[], uuid, uuid),
  private.detect_frame(uuid, public.scenario_frames, timestamptz, boolean)
  from public, anon, authenticated;
comment on function private.apply_findings(uuid, int, timestamptz, boolean, private.finding[], uuid, uuid) is
  'Effects layer (005b): a tier rise on an active rule upgrades the alert in place (one alert.raised) and never re-fires the event; a catch-up breach goes live on its first live frame; older frames neither clear nor re-fire; a lost rule_state is rebuilt from the open anomaly. anomaly.detected events carry no operator_id, though operator_pairings (own rows + FM only since 005b) is the only join to a name.';
