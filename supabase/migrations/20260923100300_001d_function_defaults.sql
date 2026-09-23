-- 001d (B2): Supabase ships `alter default privileges for role postgres in schema public grant all on functions
-- to anon, authenticated, service_role`; per-schema defaults add to the global ones, so the global revoke in
-- 001c left new public functions callable by clients (caught by tests/003_privileges.sql). Remove that grant.
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
