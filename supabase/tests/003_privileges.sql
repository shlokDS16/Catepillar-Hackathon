-- B2 (001c): the exit criteria as catalog assertions, plus the privilege rules for every public table.
-- Runs inside begin … rollback (scripts/sqltest.ts).

-- every public table has RLS enabled (B2 exit criterion)
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert bad is null, 'tables without RLS: ' || coalesce(bad, '');
end $$;

-- anon has no privilege on any public table, view or sequence; authenticated has select only (no writes)
do $$
declare r record;
begin
  for r in select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'S')
  loop
    assert not has_table_privilege('anon', 'public.' || quote_ident(r.relname), 'SELECT'), 'anon can select ' || r.relname;
    if r.relkind in ('r', 'v') then
      assert not has_table_privilege('authenticated', 'public.' || quote_ident(r.relname), 'INSERT, UPDATE, DELETE'),
        'authenticated can write ' || r.relname;
    else
      assert not has_sequence_privilege('authenticated', 'public.' || quote_ident(r.relname), 'USAGE'), 'authenticated can use sequence ' || r.relname;
    end if;
  end loop;
  assert not has_table_privilege('authenticated', 'public.scenario_frames', 'SELECT'), 'frames must not be granted to clients';
end $$;

-- default privileges: a table or function created later by postgres is closed to clients until granted
do $$
declare probe_fn text;
begin
  create table public.zz_priv_probe (id int);
  assert not has_table_privilege('authenticated', 'public.zz_priv_probe', 'SELECT'), 'new table open to authenticated';
  assert not has_table_privilege('anon', 'public.zz_priv_probe', 'SELECT'), 'new table open to anon';
  create function public.zz_priv_probe_fn() returns int language sql as 'select 1';
  assert not has_function_privilege('anon', 'public.zz_priv_probe_fn()', 'EXECUTE'), 'new function executable by anon';
  assert not has_function_privilege('authenticated', 'public.zz_priv_probe_fn()', 'EXECUTE'), 'new function executable by authenticated';
  drop function public.zz_priv_probe_fn();
  drop table public.zz_priv_probe;
end $$;

-- private: only the five RLS helpers are callable by authenticated
do $$
declare r record; allowed text[] := array['app_role', 'my_operator_id', 'my_site_id', 'is_staff', 'is_fm'];
begin
  for r in select p.proname, p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'
  loop
    if r.proname = any (allowed) then
      assert has_function_privilege('authenticated', r.oid, 'EXECUTE'), 'helper not callable: ' || r.proname;
    else
      assert not has_function_privilege('authenticated', r.oid, 'EXECUTE'), 'private function callable by authenticated: ' || r.proname;
      assert not has_function_privilege('anon', r.oid, 'EXECUTE'), 'private function callable by anon: ' || r.proname;
    end if;
  end loop;
  assert not has_table_privilege('authenticated', 'private.tick_log', 'SELECT'), 'tick_log visible to authenticated';
end $$;

-- the telemetry uniqueness is a constraint usable by `on conflict`
do $$
begin
  assert exists (select 1 from pg_constraint where conname = 'telemetry_run_frame_key' and contype = 'u'), 'telemetry unique constraint missing';
end $$;
