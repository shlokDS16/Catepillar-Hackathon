-- Migration 006b — review fixes for B10b (006 stays as applied).
--   B1  The answer key leaked through list order (cards relevant-first in `ideal` order, best choice first).
--       build_replay now finishes every new replay with private.finish_replay: a per-replay seeded shuffle of the
--       cards and of each step's choices, stored in scenario_json so reloads see the same order, with a salt search
--       that rejects an order that is relevance-sorted, in `ideal` order, best-first or equal to the protocol order.
--   B2  A sealed near miss no longer reaches a trainer through its training records: event_is_sealed() also seals a
--       training.* event whose causation is a sealed event (so it goes to the operator's own topic only and
--       event_visible() hides it from everyone else); lesson_assignments / replay_scenarios are readable by a trainer
--       only for their own site and only when the source event is not sealed; replay_attempts are the operator's own
--       (a trainer gets scores from training.replay_completed). The operator still gets the lesson.
--   M   replay_submit validates the input shape and raises `validation`; open_order is capped.
--   m   empty trend / fault cards are not built; a sealed event's queue row is finished cleanly (lesson, no replay).

-- ── B2: sealed-by-causation ──────────────────────────────────────────────────────────────────────
create or replace function private.event_is_sealed(e public.events)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if e.type = 'incident.logged' then
    return coalesce((e.payload ->> 'non_punitive')::boolean, false)
        or exists (select 1 from public.incidents i
                   where i.id::text = e.payload ->> 'incident_id' and i.non_punitive);
  end if;
  if e.type in ('incident.reported', 'safety.seatbelt_breach', 'guardian.hazard_near_operator',
                'sos.raised', 'ppe.override_granted') then
    return coalesce((e.payload ->> 'non_punitive')::boolean,
                    e.type = 'incident.reported' and e.payload ->> 'incident_type' = 'near_miss');
  end if;
  if e.type like 'training.%' and e.causation_id is not null then   -- a lesson/replay born of a sealed event is sealed too
    return exists (select 1 from public.events c where c.id = e.causation_id
                   and c.type in ('incident.reported', 'safety.seatbelt_breach', 'guardian.hazard_near_operator', 'sos.raised', 'ppe.override_granted')
                   and coalesce((c.payload ->> 'non_punitive')::boolean, c.type = 'incident.reported' and c.payload ->> 'incident_type' = 'near_miss'));
  end if;
  return false;
end $$;

create or replace function private.trainer_may_read_training(p_operator uuid, p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.operators o where o.id = p_operator and o.site_id = private.my_site_id())
     and not exists (select 1 from public.events e where e.id = p_event and private.event_is_sealed(e))
$$;
revoke execute on function private.trainer_may_read_training(uuid, uuid) from public, anon;
grant execute on function private.trainer_may_read_training(uuid, uuid) to authenticated, service_role;

drop policy if exists lesson_assignments_read on public.lesson_assignments;
create policy lesson_assignments_read on public.lesson_assignments for select to authenticated using (
  operator_id = (select private.my_operator_id())
  or ((select private.app_role()) = 'trainer' and private.trainer_may_read_training(operator_id, because_event_id)));
drop policy if exists replay_scenarios_read on public.replay_scenarios;
create policy replay_scenarios_read on public.replay_scenarios for select to authenticated using (
  operator_id = (select private.my_operator_id())
  or ((select private.app_role()) = 'trainer' and private.trainer_may_read_training(operator_id, source_event_id)));
drop policy if exists replay_attempts_read on public.replay_attempts;
create policy replay_attempts_read on public.replay_attempts for select to authenticated
  using (operator_id = (select private.my_operator_id()));

-- ── B1 + minor: finish a freshly built replay ────────────────────────────────────────────────────
alter function private.build_replay(uuid) rename to build_replay_raw;

create or replace function private.finish_replay(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rs public.replay_scenarios; sj jsonb; k jsonb; v_cards jsonb; cand jsonb; v_rel text[]; v_ideal text[]; v_ids text[];
  v_flags boolean[]; nr int; n int; salt int; ok boolean; v_steps jsonb := '[]'; st jsonb; ch jsonb; best text[]; kind text; ids text[];
  kst jsonb; v_keep text[];
begin
  select * into rs from public.replay_scenarios where id = p_id;
  sj := rs.scenario_json; k := rs.answer_key;

  -- never build an empty card (§2.8: left out, never invented)
  select coalesce(jsonb_agg(c order by o), '[]') into v_cards
    from jsonb_array_elements(sj #> '{investigate,cards}') with ordinality t(c, o)
   where not (c ->> 'type' = 'telemetry_trend' and not exists (select 1 from jsonb_array_elements(c -> 'series') s where jsonb_array_length(s -> 'points') > 0))
     and not (c ->> 'type' = 'fault_code' and jsonb_array_length(c -> 'codes') = 0);
  if jsonb_array_length(v_cards) < 3 then
    raise exception 'finish_replay: only % evidence cards left (3 needed)', jsonb_array_length(v_cards) using errcode = 'P0001';
  end if;
  select array_agg(c ->> 'id') into v_keep from jsonb_array_elements(v_cards) c;
  k := jsonb_set(k, '{cards}', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(k -> 'cards') x where x ->> 'card_id' = any (v_keep)));
  k := jsonb_set(k, '{ideal}', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(k -> 'ideal') x where x = any (v_keep)));
  select coalesce(array_agg(x ->> 'card_id'), '{}') into v_rel from jsonb_array_elements(k -> 'cards') x where (x ->> 'relevant')::boolean;
  select coalesce(array_agg(x), '{}') into v_ideal from jsonb_array_elements_text(k -> 'ideal') x;
  nr := cardinality(v_rel); n := jsonb_array_length(v_cards);

  -- cards: seeded by the replay id, stable; reject relevance-sorted (either end) and `ideal` order
  cand := v_cards;
  for salt in 0 .. 200 loop
    select coalesce(jsonb_agg(c order by md5(rs.id::text || ':c:' || salt::text || (c ->> 'id'))), '[]') into cand from jsonb_array_elements(v_cards) c;
    select array_agg((c ->> 'id') = any (v_rel) order by o), array_agg(c ->> 'id' order by o) into v_flags, v_ids
      from jsonb_array_elements(cand) with ordinality t(c, o);
    ok := true;
    if nr > 0 and nr < n then
      if (select bool_and(f) from unnest(v_flags[1:nr]) f) then ok := false; end if;                -- relevant first
      if (select bool_and(f) from unnest(v_flags[n - nr + 1:n]) f) then ok := false; end if;        -- relevant last
    end if;
    if (select coalesce(array_agg(i order by o), '{}') from unnest(v_ids) with ordinality u(i, o) where i = any (v_rel)) = v_ideal and nr > 1 then ok := false; end if;
    exit when ok;
  end loop;
  sj := jsonb_set(sj, '{investigate,cards}', cand);

  -- choices of every step: best not first, protocol order not the answer (nor its mirror)
  for st in select x from jsonb_array_elements(sj #> '{decide,steps}') x loop
    select s into kst from jsonb_array_elements(k -> 'steps') s where (s ->> 'step')::int = (st ->> 'step')::int;
    select coalesce(array_agg(b), '{}') into best from jsonb_array_elements_text(coalesce(kst -> 'best', '[]')) b;
    kind := st ->> 'kind'; ch := st -> 'choices';
    for salt in 0 .. 200 loop
      select jsonb_agg(c order by md5(rs.id::text || ':s' || (st ->> 'step') || ':' || salt::text || (c ->> 'id'))) into ch from jsonb_array_elements(st -> 'choices') c;
      select array_agg(c ->> 'id' order by o) into ids from jsonb_array_elements(ch) with ordinality t(c, o);
      ok := true;
      if kind = 'order' then
        if ids = best or ids = (select coalesce(array_agg(b order by o desc), '{}') from unnest(best) with ordinality u(b, o)) then ok := false; end if;
      else
        if ids[1] = any (best) then ok := false; end if;
      end if;
      exit when ok;
    end loop;
    v_steps := v_steps || jsonb_set(st, '{choices}', ch);
  end loop;
  sj := jsonb_set(sj, '{decide,steps}', v_steps);

  update public.replay_scenarios set scenario_json = sj, answer_key = k where id = p_id;
end $$;

create or replace function private.build_replay(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_pre uuid; v_id uuid;
begin
  select rs.id into v_pre from public.replay_scenarios rs where rs.source_event_id = p_event_id;
  v_id := private.build_replay_raw(p_event_id);
  if v_pre is null then perform private.finish_replay(v_id); end if;
  return v_id;
end $$;

-- ── step_loop: a sealed event gets its lesson (the operator's own) and no replay; no error row ───
create or replace function private.step_loop(p_limit int default 20)
returns int language plpgsql security definer set search_path = '' as $$
declare q record; ev public.events; v_lesson text; l public.lessons; v_assign uuid; v_err text; v_done int := 0; v_replay boolean;
begin
  for q in select lq.event_id from private.loop_queue lq where lq.done_at is null and lq.error is null
            order by lq.enqueued_at limit greatest(p_limit, 0) for update skip locked loop
    v_err := null; v_assign := null;
    select * into ev from public.events e where e.id = q.event_id;
    if ev.id is null then
      update private.loop_queue set error = 'event not found' where event_id = q.event_id;
      v_done := v_done + 1; continue;
    end if;
    select et.lesson_code, et.replay into v_lesson, v_replay from public.event_types et where et.type = ev.type;

    begin
      if v_lesson is not null and ev.operator_id is not null then
        select * into l from public.lessons x where x.code = v_lesson;
        if l.id is null then raise exception 'lesson % does not exist', v_lesson using errcode = 'P0001'; end if;
        insert into public.lesson_assignments (operator_id, lesson_id, because_event_id)
          values (ev.operator_id, l.id, ev.id) on conflict do nothing returning id into v_assign;
        if v_assign is not null then   -- causation = the event: if it is sealed, so is this one (event_is_sealed)
          perform private.emit_event('training.lesson_assigned',
            jsonb_build_object('assignment_id', v_assign, 'lesson_code', v_lesson, 'because_event_id', ev.id),
            'lesson_assigned:' || v_assign::text, 'system', ev.site_id, p_run_id => ev.run_id, p_machine_id => ev.machine_id,
            p_operator_id => ev.operator_id, p_causation_id => ev.id);
        end if;
      end if;
    exception when others then
      v_err := 'lesson: ' || sqlstate || ' ' || sqlerrm;
    end;

    begin
      if coalesce(v_replay, false) and not private.event_is_sealed(ev) then perform private.build_replay(ev.id); end if;
    exception when others then
      v_err := coalesce(v_err || '; ', '') || 'replay: ' || sqlstate || ' ' || sqlerrm;
    end;

    update private.loop_queue set done_at = case when v_err is null then now() end, error = v_err where event_id = q.event_id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- ── M: replay_submit input validation ────────────────────────────────────────────────────────────
create or replace function private.replay_validate(p_scenario jsonb, p_open text[], p_choices jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare c jsonb; x jsonb; v_step numeric; v_ms numeric; v_ids text[]; v_valid text[]; v_seen int[] := '{}'; v_kind text; n int;
begin
  if p_open is not null and cardinality(p_open) > 50 then raise exception 'validation' using errcode = 'P0001'; end if;
  if p_open is not null and exists (select 1 from unnest(p_open) o where o is null or length(o) > 100) then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) > 10 then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  for c in select e from jsonb_array_elements(p_choices) e loop
    if coalesce(jsonb_typeof(c), '') <> 'object' or coalesce(jsonb_typeof(c -> 'step'), '') <> 'number'
       or coalesce(jsonb_typeof(c -> 'ms'), '') <> 'number' or coalesce(jsonb_typeof(c -> 'choice_ids'), '') <> 'array' then
      raise exception 'validation' using errcode = 'P0001';
    end if;
    v_step := (c ->> 'step')::numeric; v_ms := (c ->> 'ms')::numeric;
    if v_step <> trunc(v_step) or v_step < 1 or v_step > 100 or v_ms <> trunc(v_ms) or v_ms < 0 or v_ms > 3600000 then
      raise exception 'validation' using errcode = 'P0001';
    end if;
    if v_step::int = any (v_seen) then raise exception 'validation' using errcode = 'P0001'; end if;   -- one answer per step
    v_seen := v_seen || v_step::int;
    n := jsonb_array_length(c -> 'choice_ids');
    if n < 1 or n > 5 then raise exception 'validation' using errcode = 'P0001'; end if;
    if exists (select 1 from jsonb_array_elements(c -> 'choice_ids') i where jsonb_typeof(i) <> 'string') then
      raise exception 'validation' using errcode = 'P0001';
    end if;
    select array_agg(i) into v_ids from jsonb_array_elements_text(c -> 'choice_ids') i;
    select s -> 'choices', s ->> 'kind' into x, v_kind from jsonb_array_elements(p_scenario #> '{decide,steps}') s where (s ->> 'step')::int = v_step::int;
    if x is null then raise exception 'validation' using errcode = 'P0001'; end if;                    -- unknown step
    select array_agg(ch ->> 'id') into v_valid from jsonb_array_elements(x) ch;
    if exists (select 1 from unnest(v_ids) i where not (i = any (v_valid))) then raise exception 'validation' using errcode = 'P0001'; end if;   -- unknown choice id
    if (select count(distinct i) from unnest(v_ids) i) <> cardinality(v_ids) then raise exception 'validation' using errcode = 'P0001'; end if;  -- duplicates
  end loop;
end $$;

create or replace function public.replay_submit(p_replay_id uuid, p_request_id uuid, p_open_order text[], p_choices jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rs public.replay_scenarios; v_prev jsonb; v_res jsonb; v_attempt uuid; ev public.events;
begin
  rs := private.replay_for_caller(p_replay_id);
  if p_request_id is null then raise exception 'validation' using errcode = 'P0001'; end if;
  select a.result into v_prev from public.replay_attempts a where a.replay_id = rs.id and a.request_id = p_request_id;
  if v_prev is not null then return v_prev; end if;
  perform private.replay_validate(rs.scenario_json, p_open_order, p_choices);

  v_res := private.replay_score(rs.scenario_json, rs.answer_key, coalesce(p_open_order, '{}'), p_choices);
  insert into public.replay_attempts (replay_id, operator_id, completed_at, open_order, choices, safety_score, procedure_score,
                                      efficiency_score, process_trace, request_id, result)
    values (rs.id, rs.operator_id, now(), coalesce(p_open_order, '{}'), p_choices,
            (v_res #>> '{scores,safety}')::numeric, (v_res #>> '{scores,procedure}')::numeric, (v_res #>> '{scores,efficiency}')::numeric,
            v_res -> 'process_trace', p_request_id, v_res)
    on conflict (replay_id, request_id) where request_id is not null do nothing
    returning id into v_attempt;
  if v_attempt is null then
    select a.result into v_prev from public.replay_attempts a where a.replay_id = rs.id and a.request_id = p_request_id;
    return v_prev;
  end if;
  select * into ev from public.events e where e.id = rs.source_event_id;
  perform private.emit_event('training.replay_completed',
    jsonb_build_object('replay_id', rs.id, 'attempt_id', v_attempt, 'scores', v_res -> 'scores'),
    'replay_completed:' || v_attempt::text, 'user', ev.site_id, p_run_id => ev.run_id, p_machine_id => ev.machine_id,
    p_operator_id => rs.operator_id, p_causation_id => ev.id);
  return v_res;
end $$;
revoke execute on function public.replay_submit(uuid, uuid, text[], jsonb) from public, anon;
grant execute on function public.replay_submit(uuid, uuid, text[], jsonb) to authenticated, service_role;

comment on function private.finish_replay(uuid) is
  '006b: prunes empty cards and applies a per-replay seeded shuffle (stored) so list order carries no answer: relevance-sorted, ideal-ordered, best-first and answer-ordered layouts are rejected.';
comment on function private.build_replay_raw(uuid) is 'The 006 builder; private.build_replay wraps it and calls finish_replay for a new replay.';
