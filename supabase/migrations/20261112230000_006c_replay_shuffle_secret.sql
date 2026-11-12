-- Migration 006c: the 006b shuffle leaked the answer key (006b is on main and stays as applied).
--   1. Its order derived from md5(replay id : step : salt : choice id), all known to the client, so the "random"
--      order could be recomputed. The order is stored in scenario_json, so it needs no seed at all: finish_replay now
--      shuffles with random() (unpredictable) and stores the result.
--   2. Its rejection loop never let the best choice sit first (single steps) and never let the mirror of the best
--      order appear, so "the first option is never right" was learnable. Now only an exact match of the full best
--      order is rejected, and only for `order` steps; a single step's best choice is first about 1/n of the time.
-- Replays built by 006b are re-shuffled below. The card rules (empty cards pruned, relevant-first / ideal order
-- rejected) are unchanged.

create or replace function private.finish_replay(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rs public.replay_scenarios; sj jsonb; k jsonb; v_cards jsonb; cand jsonb; v_rel text[]; v_ideal text[]; v_ids text[];
  v_flags boolean[]; nr int; n int; salt int; ok boolean; v_steps jsonb := '[]'; st jsonb; ch jsonb; best text[]; kind text; ids text[];
  kst jsonb; v_keep text[];
begin
  select * into rs from public.replay_scenarios where id = p_id;
  sj := rs.scenario_json; k := rs.answer_key;

  select coalesce(jsonb_agg(c order by o), '[]') into v_cards
    from jsonb_array_elements(sj #> '{investigate,cards}') with ordinality t(c, o)
   where not (c ->> 'type' = 'telemetry_trend' and not exists (select 1 from jsonb_array_elements(c -> 'series') s where jsonb_array_length(s -> 'points') > 0))
     and not (c ->> 'type' = 'fault_code' and jsonb_array_length(c -> 'codes') = 0);
  if jsonb_array_length(v_cards) < 3 then
    raise exception 'finish_replay: only % evidence cards left (3 needed)', jsonb_array_length(v_cards) using errcode = 'P0001';
  end if;
  select array_agg(c ->> 'id') into v_keep from jsonb_array_elements(v_cards) c;
  k := jsonb_set(k, '{cards}', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(k -> 'cards') x where x ->> 'card_id' = any (v_keep)));
  k := jsonb_set(k, '{ideal}', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(k -> 'ideal') x where x = any (v_keep)));
  select coalesce(array_agg(x ->> 'card_id'), '{}') into v_rel from jsonb_array_elements(k -> 'cards') x where (x ->> 'relevant')::boolean;
  select coalesce(array_agg(x), '{}') into v_ideal from jsonb_array_elements_text(k -> 'ideal') x;
  nr := cardinality(v_rel); n := jsonb_array_length(v_cards);

  -- cards: a random order; reject relevance-sorted (either end) and `ideal` order
  cand := v_cards;
  for salt in 0 .. 200 loop
    select coalesce(jsonb_agg(c order by random()), '[]') into cand from jsonb_array_elements(v_cards) c;
    select array_agg((c ->> 'id') = any (v_rel) order by o), array_agg(c ->> 'id' order by o) into v_flags, v_ids
      from jsonb_array_elements(cand) with ordinality t(c, o);
    ok := true;
    if nr > 0 and nr < n then
      if (select bool_and(f) from unnest(v_flags[1:nr]) f) then ok := false; end if;
      if (select bool_and(f) from unnest(v_flags[n - nr + 1:n]) f) then ok := false; end if;
    end if;
    if (select coalesce(array_agg(i order by o), '{}') from unnest(v_ids) with ordinality u(i, o) where i = any (v_rel)) = v_ideal and nr > 1 then ok := false; end if;
    exit when ok;
  end loop;
  sj := jsonb_set(sj, '{investigate,cards}', cand);

  -- choices: random; only the exact best order of an `order` step is rejected
  for st in select x from jsonb_array_elements(sj #> '{decide,steps}') x loop
    select s into kst from jsonb_array_elements(k -> 'steps') s where (s ->> 'step')::int = (st ->> 'step')::int;
    select coalesce(array_agg(b), '{}') into best from jsonb_array_elements_text(coalesce(kst -> 'best', '[]')) b;
    kind := st ->> 'kind'; ch := st -> 'choices';
    for salt in 0 .. 200 loop
      select jsonb_agg(c order by random()) into ch from jsonb_array_elements(st -> 'choices') c;
      select array_agg(c ->> 'id' order by o) into ids from jsonb_array_elements(ch) with ordinality t(c, o);
      ok := not (kind = 'order' and ids = best);
      exit when ok;
    end loop;
    v_steps := v_steps || jsonb_set(st, '{choices}', ch);
  end loop;
  sj := jsonb_set(sj, '{decide,steps}', v_steps);

  update public.replay_scenarios set scenario_json = sj, answer_key = k where id = p_id;
end $$;
revoke execute on function private.finish_replay(uuid) from public, anon, authenticated;

-- re-shuffle what 006b built (an attempt stores choice ids, so the order is free to change)
do $$
declare r record;
begin
  for r in select id from public.replay_scenarios loop
    perform private.finish_replay(r.id);
  end loop;
end $$;

comment on function private.finish_replay(uuid) is
  '006c: prunes empty cards and stores a random() shuffle (nothing derivable from the id). Rejects relevance-sorted and ideal-ordered cards, and the exact best order of an order step; a single step''s best choice is first about 1/n of the time.';
