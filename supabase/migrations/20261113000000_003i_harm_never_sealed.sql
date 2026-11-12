-- 003i: harm is never sealed, decided at the single source of truth (review of 003h: two bypasses).
--
--  HIGH  003h's trigger read only the explicit payload `non_punitive` flag, but private.event_is_sealed() and
--        private.ledger_fields_from_event() also seal by INFERENCE (incident_type 'near_miss' with no flag), and
--        by causation (training.* born of a sealed event). Now:
--          private.event_seal_requested(e)  the old logic: flag, inference, incident.logged row, causation;
--          private.event_is_harm(e)         sos.raised, tier critical, severity >= 5 (malformed counts as harm),
--                                           incident type first_aid or sos (payload, or the incident row of an
--                                           incident.logged);
--          private.event_is_sealed(e)       = not harm and seal_requested  (every RLS policy, event_visible,
--                                           my_snapshot and the trainer reads already go through it);
--          private.ledger_fields_from_event non_punitive = not harm and (flag, else near_miss): the ledger row
--                                           can never be sealed for a harm event whatever the payload says;
--          trigger on events                refuses (validation + hint) a harm event that asks to be sealed
--                                           (flag or inference), for EVERY event type, not only incident.*.
--  MED   severity is parsed as a number like the ledger does: "5", 5 and 5.0 all count; a non-numeric or
--        fractional severity on incident.reported / incident.logged is refused with `validation`.
--  Data: no existing row changes. Hashes untouched.

-- severity as numeric: null when absent; NaN when present but malformed (NaN is never < 5, see event_is_harm)
create or replace function private.event_severity(p jsonb)
returns numeric language sql immutable set search_path = '' as $f$
  select case
    when p ->> 'severity' is null then null
    when btrim(p ->> 'severity') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then btrim(p ->> 'severity')::numeric
    else 'NaN'::numeric end;
$f$;

create or replace function private.event_is_harm(e public.events)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_type text; v_sev numeric; i public.incidents%rowtype;
begin
  if e.type = 'sos.raised' or e.tier = 'critical' then return true; end if;
  if e.type in ('incident.reported', 'incident.logged') then
    v_type := e.payload ->> 'incident_type';
    v_sev := private.event_severity(e.payload);
    if v_type in ('first_aid', 'sos') or v_sev >= 5 then return true; end if;   -- NaN >= 5 is true in Postgres: malformed = harm
    if e.type = 'incident.logged' then
      select * into i from public.incidents where id::text = e.payload ->> 'incident_id';
      if found and (i.incident_type::text in ('first_aid', 'sos') or i.severity >= 5) then return true; end if;
    end if;
  end if;
  return false;
end $$;

create or replace function private.event_seal_requested(e public.events)
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
                   and not private.event_is_harm(c)
                   and private.event_seal_requested(c));
  end if;
  return false;
end $$;

create or replace function private.event_is_sealed(e public.events)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.event_is_harm(e) and private.event_seal_requested(e);
$$;

-- harm and seal_requested are internals of event_is_sealed (a definer): no client grant (003_privileges allow-list)
revoke execute on function private.event_is_harm(public.events), private.event_seal_requested(public.events)
  from public, anon, authenticated;
revoke execute on function private.event_is_sealed(public.events) from public, anon;
grant execute on function private.event_is_sealed(public.events) to authenticated, service_role;

-- the ledger's own computation: a harm event can never become a non_punitive incident
create or replace function private.ledger_fields_from_event(p_event public.events)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_type public.incident_type; v_sev smallint; v_desc text; v_reporter text; v_non_punitive boolean;
begin
  case p_event.type
    when 'safety.seatbelt_breach'        then v_type := 'seatbelt_breach';
    when 'guardian.hazard_near_operator' then v_type := 'guardian_hazard';
    when 'sos.raised'                    then v_type := 'sos';
    when 'ppe.override_granted'          then v_type := 'ppe_override';
    when 'incident.reported'             then v_type := coalesce(p_event.payload ->> 'incident_type', 'manual')::public.incident_type;
    else raise exception 'ledger: event type % has no incident mapping', p_event.type using errcode = 'P0001';
  end case;

  v_sev := case
    when p_event.type = 'incident.reported' then coalesce(trunc(private.event_severity(p_event.payload))::smallint, 3)
    else case p_event.tier::text when 'critical' then 5 when 'warning' then 4 when 'caution' then 2 else 1 end
  end;

  v_desc := case p_event.type
    when 'safety.seatbelt_breach'        then 'Seatbelt not fastened while moving at ' || coalesce(p_event.payload ->> 'speed_kmh', '?') || ' km/h.'
    when 'guardian.hazard_near_operator' then 'Anomalous machine ' || coalesce(p_event.payload ->> 'machine_code', '?') || ' within ' || coalesce(p_event.payload ->> 'distance_m', '?') || ' m of the operator.'
    when 'sos.raised'                    then 'SOS raised by the operator.'
    when 'ppe.override_granted'          then 'PPE override granted: ' || coalesce(p_event.payload ->> 'reason', '')
    else coalesce(p_event.payload ->> 'description', '')
  end;

  v_reporter := case
    when p_event.type = 'ppe.override_granted' then 'supervisor'
    when p_event.source in ('detector.rule', 'detector.ewma', 'guardian') then 'detector'
    when p_event.source = 'user' then 'operator'
    else 'system' end;

  v_non_punitive := not private.event_is_harm(p_event)
                    and coalesce((p_event.payload ->> 'non_punitive')::boolean, v_type = 'near_miss');

  return jsonb_build_object(
    'incident_type', v_type::text,
    'severity', v_sev::text,
    'description', v_desc,
    'reporter_kind', v_reporter,
    'non_punitive', v_non_punitive,
    'lat', (p_event.payload ->> 'lat'),
    'lon', (p_event.payload ->> 'lon'),
    'context', private.ledger_numbers_to_text(p_event.payload));
end $$;

-- the gate on events: every event type, effective seal state from the same functions
create or replace function private.events_refuse_sealed_harm()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare v_sev numeric;
begin
  if new.type in ('incident.reported', 'incident.logged') and new.payload ? 'severity' then
    v_sev := private.event_severity(new.payload);
    if v_sev is not null and (v_sev = 'NaN' or v_sev <> trunc(v_sev) or v_sev < 1 or v_sev > 5) then
      raise exception 'validation' using errcode = 'P0001',
        hint = 'severity must be a whole number from 1 to 5 (a number or a numeric string).';
    end if;
  end if;
  if private.event_is_harm(new) and private.event_seal_requested(new) then
    raise exception 'validation' using errcode = 'P0001',
      hint = 'A harm report is never sealed (an injury, an SOS, severity 5 or a critical tier): p_non_punitive must be false and the type must not be near_miss. Near-miss sealing covers genuine near misses only, so the supervisor always sees a harm report.';
  end if;
  return new;
end $f$;
-- trigger events_refuse_sealed_harm (003h) already points at this function name
