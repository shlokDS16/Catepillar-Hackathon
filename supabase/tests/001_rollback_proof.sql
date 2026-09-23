-- Proves that 000_smoke.sql's table was rolled back: the runner never leaks test state.
do $$
begin
  assert not exists (select 1 from pg_tables where schemaname = 'private' and tablename = 'sqltest_scratch'),
    'sqltest must roll back every file';
end $$;
