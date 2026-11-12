-- Migration 007d: the second half of the 007c TOCTOU fix. alert_dispatch_pending read the alert without a lock, so
-- a tier it read before a concurrent upgrade could stamp dispatched_tier with a stale value and skip the critical's
-- immediate dispatch. It now locks the row (FOR UPDATE, which re-reads the latest committed version) before it
-- decides, so the dispatch for the CURRENT tier is always planned after the lock. Dry run only.
create or replace function private.alert_dispatch_pending(p_alert_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; pol public.alert_policies%rowtype; v_tokens text[]; v_level int;
begin
  select * into a from public.alerts x
    where x.id = p_alert_id and x.status in ('open', 'escalating') and x.dispatched_tier is distinct from x.tier
    for update;
  if not found then return 0; end if;
  select * into pol from public.alert_policies p where p.kind = a.kind;
  v_tokens := case
    when cardinality(pol.notify_now) > 0 then case when a.dispatched_tier is null then pol.notify_now else '{}'::text[] end
    when a.tier = 'critical' then pol.escalate_to
    else '{}'::text[] end;
  v_level := private.alert_dispatch(a.id, v_tokens,
               case when a.kind = 'alert_flood' then 'flood_summary' else 'alert' end);
  update public.alerts set dispatched_tier = a.tier, escalation_level = greatest(escalation_level, greatest(v_level, 0))::smallint
    where id = a.id;
  return case when v_level >= 0 then 1 else 0 end;
end $$;
revoke execute on function private.alert_dispatch_pending(uuid) from public, anon, authenticated;
