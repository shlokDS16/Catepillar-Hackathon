import sys
p = sys.argv[1]
s = open(p, encoding="utf8").read()

def rep(old, new):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new)

# fan-out rows checked as owner, by topic and payload id
rep("""-- supervisor-only event (for the RLS matrix below)
select private.emit_event('alert.suppressed',""", """-- fan-out: one broadcast row per audience topic, carrying the event id (checked as owner, before any role switch)
do $$
declare e_id uuid; sup_id uuid;
begin
  if (select exists (select 1 from pg_inherits where inhparent = 'realtime.messages'::regclass)) then
    select id into e_id from public.events where type = 'safety.seatbelt_breach' and run_id = pg_temp.id('run');
    assert (select array_agg(topic order by topic) from realtime.messages where extension = 'broadcast' and payload ->> 'id' = e_id::text)
      = array['op:' || pg_temp.id('op_ravi'), 'sup:' || pg_temp.id('site'), 'train:' || pg_temp.id('site')], 'seatbelt fans out to op, sup, train';
  end if;
end $$;

-- supervisor-only event (for the RLS matrix below)
select private.emit_event('alert.suppressed',""")

rep("""-- alerts: two SOS rows coexist; a second open alert with the same non-SOS hazard key is refused""",
"""do $$
declare sup_id uuid;
begin
  if (select exists (select 1 from pg_inherits where inhparent = 'realtime.messages'::regclass)) then
    select id into sup_id from public.events where idempotency_key = 'sys:test:supp:1';
    assert (select array_agg(topic) from realtime.messages where extension = 'broadcast' and payload ->> 'id' = sup_id::text)
      = array['sup:' || pg_temp.id('site')], 'supervisor-only event fans out to sup only';
  end if;
end $$;

-- alerts: two SOS rows coexist; a second open alert with the same non-SOS hazard key is refused""")

# loud guard: a WARNING is printed by the runner (db.ts warnings: true)
rep("""    raise warning 'realtime.messages has no partition: Realtime topic assertions skipped (run scripts/b0/realtime-wake.ts)';""",
    """    raise warning 'realtime.messages has no partition: Realtime topic assertions SKIPPED (run scripts/b0/realtime-wake.ts)';""")

# scope counts to this test's rows
rep("""  assert (select count(*) from private.ledger_queue) = 1 and (select count(*) from private.loop_queue) = 1, 'plain event queues nothing';""",
    """  assert (select count(*) from private.ledger_queue where event_id in (select id from public.events where run_id = pg_temp.id('run'))) = 1
     and (select count(*) from private.loop_queue where event_id in (select id from public.events where run_id = pg_temp.id('run'))) = 1, 'plain event queues nothing';""")
rep("""  assert (select count(*) from public.alerts where kind = 'sos') = 2, 'two SOS alerts coexist';""",
    """  assert (select count(*) from public.alerts where kind = 'sos' and run_id = pg_temp.id('run')) = 2, 'two SOS alerts coexist';""")
rep("""  assert (select count(*) from public.events where type = 'safety.seatbelt_breach') = 1, 'OP sees own seatbelt event';
  assert (select count(*) from public.events where type = 'alert.suppressed') = 0, 'OP does not see supervisor-only events';
  assert (select count(*) from public.alerts) = 3, 'OP sees own alerts';
  assert (select count(*) from public.dispatches) = 0, 'OP sees no dispatches';""",
"""  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'safety.seatbelt_breach') = 1, 'OP sees own seatbelt event';
  assert (select count(*) from public.events where run_id = pg_temp.id('run') and type = 'alert.suppressed') = 0, 'OP does not see supervisor-only events';
  assert (select count(*) from public.alerts where run_id = pg_temp.id('run')) = 3, 'OP sees own alerts';
  assert (select count(*) from public.dispatches where alert_id = pg_temp.id('sos1')) = 0, 'OP sees no dispatches';""")
rep("""  assert (select count(*) from public.events) = 3, 'FM sees every site event';
  assert (select count(*) from public.dispatches) = 1, 'FM sees dispatches';""",
"""  assert (select count(*) from public.events where run_id = pg_temp.id('run')) = 3, 'FM sees every site event';
  assert (select count(*) from public.dispatches where alert_id = pg_temp.id('sos1')) = 1, 'FM sees dispatches';""")
rep("""  assert (select count(*) from public.events) = 1, 'TR sees trainer-audience events only';""",
    """  assert (select count(*) from public.events where run_id = pg_temp.id('run')) = 1, 'TR sees trainer-audience events only';""")

# the dispatch kick: a no-op status update must not re-kick, a requeue must
rep("""  assert (select status from public.dispatches where alert_id = pg_temp.id('sos1')) = 'queued', 'dispatch queued (vault secrets present)';
end $$;""", """  assert (select status from public.dispatches where alert_id = pg_temp.id('sos1')) = 'queued', 'dispatch queued (vault secrets present)';
end $$;
-- kick count: insert = 1 request; a no-op update keeps it at 1; sending → queued (requeue) adds 1
do $$
declare before_n int; d_id uuid;
begin
  select id into d_id from public.dispatches where alert_id = pg_temp.id('sos1');
  select count(*) into before_n from net.http_request_queue;
  update public.dispatches set status = 'queued' where id = d_id;
  assert (select count(*) from net.http_request_queue) = before_n, 'a no-op status update must not re-kick';
  update public.dispatches set status = 'sending', sending_at = now() where id = d_id;
  update public.dispatches set status = 'queued', attempts = attempts + 1 where id = d_id;
  assert (select count(*) from net.http_request_queue) = before_n + 1, 'a requeue kicks once';
end $$;""")

open(p, "w", encoding="utf8", newline="\n").write(s)
print("004 patched")
