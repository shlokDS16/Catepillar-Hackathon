-- 001c (B2 review fixes): least privilege for everything created from now on, and two corrections.
-- Migration 001 is already applied to the shared project, so fixes land here rather than by editing 001.

-- 1. Default privileges for objects the `postgres` role creates later (B4 tables, B15 RPCs): clients get
--    nothing unless a later migration grants it. A per-schema default cannot remove the built-in PUBLIC
--    execute right on functions, so the function default is set globally (no `in schema`).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- 2. Objects that 001 already created: sequences, the trigger function and the frames table.
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.app_role(), private.my_operator_id(), private.my_site_id(), private.is_staff(), private.is_fm()
  to authenticated, service_role;
revoke select on public.scenario_frames from authenticated;   -- data-model §2.3: no client access (the worker reads frames as owner)

-- 3. telemetry (run_id, frame_seq): a plain unique constraint, so `on conflict (run_id, frame_seq)` works in B9.
--    NULL run_ids (historical rows) never collide, so the rule is unchanged.
drop index if exists public.telemetry_run_frame_uidx;
alter table public.telemetry_readings drop constraint if exists telemetry_run_frame_key;
alter table public.telemetry_readings add constraint telemetry_run_frame_key unique (run_id, frame_seq);

-- 4. Why the RLS helpers are security definer: they read `profiles` on behalf of a policy on another table,
--    and must not themselves be subject to the `profiles` policy (which would recurse) or its row limits.
comment on function private.app_role() is 'RLS helper: role of the signed-in user (security definer so the profiles policy does not recurse).';
comment on function private.my_operator_id() is 'RLS helper: operator id of the signed-in user (security definer, see app_role).';
comment on function private.my_site_id() is 'RLS helper: site id of the signed-in user (security definer, see app_role).';

-- 5. Privacy (data-model §2.10): the pseudonym must not be joinable back to a name by the fleet manager.
--    Clients read `operators` column by column (no `pseudonym`); only the near_miss_list RPC (B15,
--    security definer) returns pseudonyms. Track F selects explicit columns on `operators` (`select=*` is refused).
revoke select on public.operators from authenticated;
grant select (id, employee_code, display_name, skill_level, experience_hours, preferred_language, site_id, contact_ref)
  on public.operators to authenticated;

-- 6. Rows of a run always carry a frame number (a null frame_seq never bypasses the unique constraint).
alter table public.telemetry_readings drop constraint if exists telemetry_run_frame_pair;
alter table public.telemetry_readings add constraint telemetry_run_frame_pair check ((run_id is null) = (frame_seq is null));

-- 7. One profile per operator.
create unique index if not exists profiles_operator_uidx on public.profiles (operator_id) where operator_id is not null;

-- 8. operator_pairings: every signed-in role may read who is paired with which machine (data-model §2.1).
drop policy if exists operator_pairings_read on public.operator_pairings;
drop policy if exists operator_pairings_read_all on public.operator_pairings;
create policy operator_pairings_read_all on public.operator_pairings for select to authenticated using (true);
