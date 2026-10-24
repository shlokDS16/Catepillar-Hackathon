-- Migration 004c — replaces private.can_call_operator.
--
-- 004b carried a hand-written version of this function whose cooldown block referenced columns
-- that do not exist (operator_state.last_call_at, app_config.call_cooldown_s). Every frame that
-- refreshed a cab occupant's lock raised, and 006 caught it: 6 errors in 10 frames. 004b is
-- applied and therefore immutable, so the correction lands here.
--
-- This is the function exactly as 004 defined it, with one change: the cab's machine_state is
-- aged out on the same staleness bound as the operator's row. Without it a machine that went
-- offline an hour ago while parked still authorised a voice call and unlocked the cockpit —
-- the MAJOR the backend review raised.

create or replace function private.can_call_operator(p_run_id uuid, p_operator_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare os public.operator_state%rowtype; ms public.machine_state%rowtype; cfg public.app_config%rowtype;
        v_state text; v_locked boolean; v_allowed boolean; v_reason text;
begin
  select * into cfg from public.app_config where id;
  select * into os from public.operator_state o
    where o.run_id is not distinct from p_run_id and o.operator_id = p_operator_id;

  if not found or os.updated_at < now() - make_interval(secs => coalesce(cfg.state_stale_s, 10)) then
    return jsonb_build_object('allowed', false, 'reason', 'state_unknown',
                              'motion_locked', true, 'state', 'state_unknown');
  end if;

  if coalesce(os.on_foot, false) then
    v_state := 'on_foot';
  elsif os.in_cab_machine_id is not null then
    select * into ms from public.machine_state m
      where m.run_id is not distinct from p_run_id and m.machine_id = os.in_cab_machine_id;
    -- Staleness is measured on updated_at (wall clock), never ts (simulated): at 60x a sim
    -- timestamp runs an hour ahead of the wall and would call a dead feed fresh. A cab we have
    -- stopped hearing from is a cab we know nothing about, so it denies like any other unknown.
    if not found or ms.updated_at < now() - make_interval(secs => coalesce(cfg.state_stale_s, 10)) then
      v_state := 'state_unknown';                                    -- a cab we know nothing about: deny
    elsif coalesce(ms.speed_kmh, 999) <= coalesce(cfg.motion_speed_kmh, 0.5) and coalesce(ms.parking_brake, false) then
      v_state := 'parked';
    else
      v_state := 'moving';
    end if;
  else
    v_state := 'state_unknown';
  end if;

  v_locked := v_state not in ('on_foot', 'parked');
  v_allowed := not v_locked;
  v_reason := case v_state when 'moving' then 'motion_lock' when 'state_unknown' then 'state_unknown' end;

  -- Twilio's own rule (event-pipeline §7 external caps): one call per recipient per 60 s.
  if v_allowed and exists (
      select 1 from public.dispatches d
      join public.alerts a on a.id = d.alert_id
      where d.channel = 'twilio_voice' and d.recipient_role = 'operator'
        and a.operator_id = p_operator_id
        and d.status <> 'suppressed'
        and d.created_at > now() - interval '60 seconds') then
    v_allowed := false; v_reason := 'call_cooldown';
  end if;

  return jsonb_build_object('allowed', v_allowed, 'reason', v_reason,
                            'motion_locked', v_locked, 'state', v_state);
end $$;
