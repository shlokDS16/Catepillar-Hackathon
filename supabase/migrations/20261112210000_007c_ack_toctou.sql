-- Migration 007c: security review of 007b (HIGH, TOCTOU). 007b is applied, so the fix lands here.
--
-- alert_ack read the alert without a lock, checked tier and motion, then called ack_alert: a concurrent upgrade to
-- critical between the check and the UPDATE let an operator close a now-critical alert. Now the alert row is locked
-- (FOR UPDATE) before the checks, and ack_alert's UPDATE itself refuses an operator on a critical alert or while
-- motion-locked, so the rule holds on the row actually updated. When the guard blocks, only operator_ack_at is recorded.
-- Also: apply_findings' lost-rule_state rebuild looks at 'escalated' alerts too (005b:93-94).
-- Dry run only.

create or replace function private.ack_alert(p_alert_id uuid, p_via public.ack_via, p_by uuid, p_by_role public.app_role)
returns public.alerts language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; v_locked boolean := false;
begin
  perform private.alert_dispatch_pending(p_alert_id);       -- plan what the tier owes BEFORE any status change
  if p_by_role = 'operator' then
    select coalesce((private.can_call_operator(x.run_id, x.operator_id) ->> 'motion_locked')::boolean, true) into v_locked
      from public.alerts x where x.id = p_alert_id;
  end if;
  update public.alerts set status = 'acknowledged', ack_at = now(), ack_by = p_by, ack_via = p_via, escalate_at = null
    where id = p_alert_id and status in ('open', 'escalating', 'escalated')
      and not (p_by_role = 'operator' and (tier = 'critical' or v_locked))
    returning * into a;
  if found then
    update public.dispatches set status = 'suppressed', error = jsonb_build_object('reason', 'acknowledged')
      where alert_id = a.id and status = 'queued' and (p_by_role = 'fleet_manager' or recipient_role = 'operator');
    perform private.emit_event('alert.acknowledged',
      jsonb_build_object('alert_id', a.id, 'via', p_via, 'by_role', p_by_role),
      'alertack:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
      p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
  else
    select * into a from public.alerts x where x.id = p_alert_id;
    if p_by_role = 'operator' and a.tier = 'critical' and a.status in ('open', 'escalating', 'escalated') then
      update public.alerts set operator_ack_at = coalesce(operator_ack_at, now()) where id = a.id;   -- the sighting only
    end if;
  end if;
  return a;
end $$;

create or replace function public.alert_ack(p_alert_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles%rowtype; a public.alerts%rowtype;
begin
  select * into me from public.profiles where user_id = (select auth.uid());
  if not found then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_alert_id is null or p_request_id is null then raise exception 'validation' using errcode = 'P0001'; end if;
  select * into a from public.alerts x where x.id = p_alert_id for update;      -- serialises with raise_alert's upgrade
  if not found
     or not ((me.role = 'fleet_manager' and a.site_id = me.site_id)
          or (me.role = 'operator' and a.operator_id = me.operator_id and a.kind <> 'sos')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if me.role = 'operator' then
    if coalesce((private.can_call_operator(a.run_id, me.operator_id) ->> 'motion_locked')::boolean, true) then
      raise exception 'forbidden' using errcode = 'P0001', hint = 'motion_locked';
    end if;
    if a.tier = 'critical' then
      update public.alerts set operator_ack_at = coalesce(operator_ack_at, now())
        where id = a.id and status in ('open', 'escalating', 'escalated');
      perform private.emit_event('alert.acknowledged',
        jsonb_build_object('alert_id', a.id, 'via', 'app', 'by_role', 'operator'),
        'alertack_op:' || a.id::text || ':' || a.epoch::text, 'system', a.site_id, p_run_id => a.run_id,
        p_machine_id => a.machine_id, p_operator_id => a.operator_id, p_alert_id => a.id);
      select * into a from public.alerts x where x.id = p_alert_id;
      return jsonb_build_object('alert_id', a.id, 'status', a.status);
    end if;
  end if;
  a := private.ack_alert(a.id, 'app', me.user_id, me.role);
  return jsonb_build_object('alert_id', a.id, 'status', a.status);
end $$;

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
                          and a.status in ('open', 'acknowledged', 'escalating', 'escalated') and a.kind <> 'sos' limit 1);
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

revoke execute on function private.ack_alert(uuid, public.ack_via, uuid, public.app_role),
  private.apply_findings(uuid, int, timestamptz, boolean, private.finding[], uuid, uuid) from public, anon, authenticated;
revoke execute on function public.alert_ack(uuid, uuid) from public, anon;
grant execute on function public.alert_ack(uuid, uuid) to authenticated, service_role;
grant execute on function private.ack_alert(uuid, public.ack_via, uuid, public.app_role) to service_role;
