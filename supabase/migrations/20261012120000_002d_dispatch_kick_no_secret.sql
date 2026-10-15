-- Migration 002d — fixes for the three findings the backend review raised against 002c.
-- 002/002b/002c are already applied to the shared project, so everything here is additive.
--
--  1. BLOCKER: the dispatch kick parked the Vault `supabase_secret_key` in the pg_net request
--     queue, which every signed-in role can read on this project. 002c tried to revoke that access
--     and could not: `net.http_request_queue` carries a PUBLIC grant made by `supabase_admin`
--     (relacl `=arwdDxtm/supabase_admin`), and a revoke issued by `postgres` is silently ignored
--     because `postgres` is not the grantor — measured, the ACL is byte-identical afterwards, and
--     002c's `exception when others` hid it. We cannot close the queue, so nothing secret may go
--     through it: the kick now sends the dispatch id alone, with no credential of any kind.
--  2. MAJOR: 002c revoked insert on `events` from `service_role` without granting it the only
--     write path, leaving the dispatch Edge Function unable to emit `dispatch.*` events.
--  3. MAJOR: `dispatches.site_id not null` refused site-less rows (the ledger-checkpoint cron has
--     no site), and 002c's backfill for `flood_summary` read the wrong table.

-- ── 1. The kick carries no secret ──────────────────────────────────────────────────────────────
create or replace function private.dispatch_kick()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'public_functions_url';
  if v_url is null then
    update public.dispatches set status = 'failed', error = jsonb_build_object('reason', 'vault secret public_functions_url missing') where id = new.id;
    return new;
  end if;
  -- No apikey, no bearer, no shared secret: anything placed here is world-readable (see header).
  -- The dispatch function authenticates the WORK, not the caller — it reads the row with its own
  -- service key and proceeds only while status = 'queued', which also makes a replayed id a no-op.
  perform net.http_post(
    url := v_url || '/dispatch',
    body := jsonb_build_object('dispatch_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 20000);
  return new;
end $$;

comment on function private.dispatch_kick() is
  'Outbox kick. Carries no credential: net.http_request_queue is readable by every signed-in role on this project (PUBLIC grant owned by supabase_admin, not revocable by postgres), so the request body and headers must be assumed public. B15''s dispatch function must load the dispatch row with its own service key, act only on status = ''queued'', and be idempotent per (subject_key, purpose, channel, role, level).';

-- ── 2. service_role keeps a write path to events (emit_event is the only one; 002c closed insert) ──
grant execute on function private.emit_event(text, jsonb, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, public.alert_tier, uuid, uuid) to service_role;

-- ── 3. Site-less dispatches are legitimate (ledger checkpoint has no site) ─────────────────────
alter table public.dispatches alter column site_id drop not null;
comment on column public.dispatches.site_id is
  'Site that scopes this row for the fleet manager. Null for org-wide dispatches such as the ledger checkpoint, which no FM policy matches and only service_role reads.';
