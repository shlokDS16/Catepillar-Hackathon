-- 005c: the fleet-manager branch of operator_pairings_read (005b) was not site-scoped: any FM read every site's pairings.
drop policy if exists operator_pairings_read on public.operator_pairings;
create policy operator_pairings_read on public.operator_pairings for select to authenticated using (
  operator_id = (select private.my_operator_id())
  or ((select private.is_fm()) and exists (select 1 from public.operators o
        where o.id = operator_pairings.operator_id and o.site_id = (select private.my_site_id())))
);
