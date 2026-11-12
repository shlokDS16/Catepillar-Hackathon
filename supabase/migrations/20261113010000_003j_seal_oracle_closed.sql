-- 003j: no client can use the seal predicate as an oracle (security review of 003i).
--
-- Finding: private.event_is_sealed(public.events) is SECURITY DEFINER, reads public.incidents by
-- e.payload->>'incident_id', and 003e/003i granted EXECUTE to `authenticated` (the RLS policy needed it).
-- A caller able to reach it could pass a crafted events row and learn whether an incident they cannot read is
-- harm (first_aid, sos, severity >= 5). Exploitability on the live project: the `private` schema is not exposed
-- through PostgREST (db_schema = public,graphql_public) and no public function takes an events row, so there
-- was no client path; this migration removes the grant anyway (defence in depth).
--
-- Fix:
--   private.event_is_sealed        internal again: EXECUTE revoked from authenticated (service_role keeps it);
--                                  only definers (emit_event, events_after_insert, build_replay, ...) call it.
--   private.event_visible          the one function RLS (events_read), my_snapshot and replay_for_caller call.
--                                  Now SECURITY DEFINER and narrow: it ignores every column of the row it is
--                                  handed except `id` and evaluates the STORED row, so a crafted row cannot steer
--                                  the incident lookup (an id that is not a stored event answers false); and for
--                                  a client session (SET ROLE authenticated, as PostgREST does) role, site and operator are the
--                                  caller's own, whatever the arguments say. Outside one (service role,
--                                  sqltest as postgres) the arguments are honoured as before.
-- Behaviour of every sealed/harm rule is unchanged (013, 005, 004, 011 unchanged).

revoke execute on function private.event_is_sealed(public.events) from public, anon, authenticated;
grant execute on function private.event_is_sealed(public.events) to service_role;

create or replace function private.event_visible(e public.events, p_role public.app_role, p_site uuid, p_operator uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare s public.events; v_role public.app_role := p_role; v_site uuid := p_site; v_op uuid := p_operator;
begin
  select * into s from public.events x where x.id = e.id;       -- the stored row, never the argument's columns
  if s.id is null then return false; end if;
  if current_setting('role', true) = 'authenticated' then             -- a client session can only ask about itself
    v_role := private.app_role(); v_site := private.my_site_id(); v_op := private.my_operator_id();
  end if;
  if private.event_is_sealed(s) then
    return v_op is not null and 'operator' = any (s.audiences) and s.operator_id = v_op;
  end if;
  return ('site' = any (s.audiences) and s.site_id = v_site)
      or ('operator' = any (s.audiences) and s.operator_id = v_op)
      or (v_role = 'fleet_manager' and 'supervisor' = any (s.audiences) and s.site_id = v_site)
      or (v_role = 'trainer' and 'trainer' = any (s.audiences) and s.site_id = v_site);
end $$;
revoke execute on function private.event_visible(public.events, public.app_role, uuid, uuid) from public, anon;
grant execute on function private.event_visible(public.events, public.app_role, uuid, uuid) to authenticated, service_role;
