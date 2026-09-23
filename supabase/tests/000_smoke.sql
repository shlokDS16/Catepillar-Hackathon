-- B0 smoke: the extensions, schema and Vault rows every later migration relies on are present.
-- Runs inside begin … rollback (scripts/sqltest.ts).
do $$
begin
  assert (select count(*) from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault')) = 3,
    'pg_cron, pg_net and supabase_vault must be installed';
  assert exists (select 1 from pg_namespace where nspname = 'private'), 'schema private must exist';
  assert (select count(*) from vault.secrets
          where name in ('supabase_secret_key', 'telegram_supervisor_chat_id', 'site_emergency_tel')) = 3,
    'the three B0 Vault secrets must exist';
  assert current_setting('cron.database_name') = 'postgres', 'pg_cron must run in the postgres database';
end $$;

-- Rollback proof: this table must never survive the run (checked by 001_rollback_proof.sql).
create table private.sqltest_scratch (x int);
insert into private.sqltest_scratch values (1);
