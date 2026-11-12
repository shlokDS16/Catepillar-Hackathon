-- Migration 006 — B10b, the Loop builder and Replay on the server (backend-tasks B10b; data-model §2.8;
-- api-contracts §5; event-pipeline §0 step 2; UI-18, UI-19, UI-20).
--
--   1. attempts   replay_attempts gets request_id (idempotent submit) and result (the debrief that was returned)
--   2. content    authored seed: protocol card `seatbelt_slopes`, lessons `seatbelt_slopes` and
--                 `faulty_machine_nearby`, replay template for `safety.seatbelt_breach`
--   3. scoring    private.replay_pair_credit, private.replay_score (pure; mirrors apps/web/src/replay/
--                 fixture-scoring.ts `scoreReplay` operation for operation, in float8, so the two agree exactly)
--   4. builder    private.build_replay(event_id): the event record + the scenario's frames → the four-phase
--                 ReplayScenario (no answer key) in replay_scenarios.scenario_json and the key in .answer_key
--   5. loop       private.step_loop(limit) (worker step 2): drains private.loop_queue, assigns the lesson, builds
--                 the replay; each piece in its own exception block, a failure is written on the queue row and
--                 never reaches the event, the alert or the ledger (N2)
--   6. RPCs       public.replay_get, public.replay_submit (operator, own replays, idempotent on request_id)
--
-- Privacy: a replay is the operator's own. replay_get / replay_submit require the caller to be that operator AND
-- private.event_visible() to hold for the source event; build_replay refuses a sealed event. The answer key
-- lives in replay_scenarios.answer_key (column not granted) and reaches a client only inside replay_submit's
-- result, after the attempt is stored.
--
-- Contract additions (additive, packages/shared 2.1.0): reenactment.event_ms and machine_track[].seatbelt_fastened.

-- ── 1. attempts ──────────────────────────────────────────────────────────────────────────────────
alter table public.replay_attempts add column if not exists request_id uuid;
alter table public.replay_attempts add column if not exists result jsonb;
create unique index if not exists replay_attempts_request_uidx on public.replay_attempts (replay_id, request_id)
  where request_id is not null;

-- ── 2. authored content (reviewed_by stays null: a safety officer has not signed these off) ───────
insert into public.protocol_cards (id, fault_type, version, title, steps, pictogram, upwind_hint, source_refs) values
  ('seatbelt_slopes', 'safety.seatbelt_breach', 1,
   '{"en": "Seatbelt on slopes", "hi": "ढलान पर सीटबेल्ट"}',
   '[{"en": "Seatbelt on before the machine moves; never on a slope without it.", "hi": "मशीन चलने से पहले सीटबेल्ट; ढलान पर कभी बिना नहीं।"},
     {"en": "If it is off while moving: stop the machine safely and park it on level ground.", "hi": "चलते समय खुली हो तो मशीन सुरक्षित रोकें और समतल जगह पर पार्क करें।"},
     {"en": "Fasten the belt and tug it to check that it holds.", "hi": "बेल्ट लगाएँ और खींचकर जाँचें कि वह टिकी है।"},
     {"en": "Tell your supervisor, then resume.", "hi": "सुपरवाइज़र को बताएँ, फिर काम शुरू करें।"}]',
   'belt', false, '{}')
on conflict (id) do update set fault_type = excluded.fault_type, title = excluded.title, steps = excluded.steps,
  pictogram = excluded.pictogram, version = excluded.version;

insert into public.lessons (code, content, topic_event_types, version) values
  ('seatbelt_slopes',
   '{"code": "seatbelt_slopes", "title": {"en": "Seatbelt on slopes", "hi": "ढलान पर सीटबेल्ट"}, "duration_s": 90,
     "cards": [
       {"id": "k1", "kind": "rule", "title": {"en": "The rule", "hi": "नियम"},
        "body": {"en": "Fasten the seatbelt before the machine moves. Never drive a slope without it.", "hi": "मशीन चलने से पहले सीटबेल्ट लगाएँ। ढलान पर कभी बिना बेल्ट न चलें।"},
        "pictogram": "belt", "image_path": null, "audio_id": null},
       {"id": "k2", "kind": "why", "title": {"en": "Why", "hi": "क्यों"},
        "body": {"en": "On a slope a machine can tip. The belt keeps you in the protected cab.", "hi": "ढलान पर मशीन पलट सकती है। बेल्ट आपको सुरक्षित केबिन में रखती है।"},
        "pictogram": "rollover", "image_path": null, "audio_id": null},
       {"id": "k3", "kind": "how", "title": {"en": "How", "hi": "कैसे"},
        "body": {"en": "Click it, tug it, then move. If it is off while moving, stop and park first.", "hi": "क्लिक करें, खींचकर देखें, फिर चलें। चलते समय खुली हो तो पहले रोकें और पार्क करें।"},
        "pictogram": "check", "image_path": null, "audio_id": null},
       {"id": "k4", "kind": "check", "title": {"en": "Check", "hi": "जाँच"},
        "body": {"en": "Look at the belt light before every start.", "hi": "हर बार चालू करने से पहले बेल्ट की लाइट देखें।"},
        "pictogram": "yes", "image_path": null, "audio_id": null}],
     "quiz": [
       {"id": "q1", "prompt": {"en": "The belt is off and you are on a slope. What first?", "hi": "बेल्ट खुली है और आप ढलान पर हैं। पहले क्या?"},
        "choices": [{"id": "stop", "label": {"en": "Stop safely", "hi": "सुरक्षित रोकें"}, "pictogram": "stop"},
                    {"id": "go", "label": {"en": "Finish the pass", "hi": "चक्कर पूरा करें"}, "pictogram": "go"}],
        "correct_id": "stop", "why": {"en": "Stopping removes the risk at once.", "hi": "रोकने से जोखिम तुरंत खत्म होता है।"}},
       {"id": "q2", "prompt": {"en": "When must the belt be on?", "hi": "बेल्ट कब लगी होनी चाहिए?"},
        "choices": [{"id": "before", "label": {"en": "Before moving", "hi": "चलने से पहले"}, "pictogram": "belt"},
                    {"id": "slope", "label": {"en": "Only on slopes", "hi": "सिर्फ ढलान पर"}, "pictogram": "slope"}],
        "correct_id": "before", "why": {"en": "Always before the machine moves.", "hi": "हमेशा मशीन चलने से पहले।"}},
       {"id": "q3", "prompt": {"en": "How do you check the belt?", "hi": "बेल्ट कैसे जाँचें?"},
        "choices": [{"id": "tug", "label": {"en": "Tug it", "hi": "खींचकर देखें"}, "pictogram": "check"},
                    {"id": "look", "label": {"en": "Assume it is fine", "hi": "मान लें ठीक है"}, "pictogram": "no"}],
        "correct_id": "tug", "why": {"en": "A tug shows that it holds.", "hi": "खींचने से पता चलता है कि वह टिकी है।"}}],
     "video_path": null, "source_refs": []}',
   array['safety.seatbelt_breach'], 1),
  ('faulty_machine_nearby',
   '{"code": "faulty_machine_nearby", "title": {"en": "A faulty machine nearby", "hi": "पास में खराब मशीन"}, "duration_s": 90,
     "cards": [
       {"id": "k1", "kind": "rule", "title": {"en": "The rule", "hi": "नियम"},
        "body": {"en": "Keep clear of a machine with an active fault. Stay out of its swing and travel path.", "hi": "सक्रिय खराबी वाली मशीन से दूर रहें। उसके घूमने और चलने के रास्ते से बाहर रहें।"},
        "pictogram": "distance", "image_path": null, "audio_id": null},
       {"id": "k2", "kind": "why", "title": {"en": "Why", "hi": "क्यों"},
        "body": {"en": "A faulty machine can lose steering or brakes without warning.", "hi": "खराब मशीन की स्टीयरिंग या ब्रेक बिना चेतावनी जा सकते हैं।"},
        "pictogram": "warning", "image_path": null, "audio_id": null},
       {"id": "k3", "kind": "how", "title": {"en": "How", "hi": "कैसे"},
        "body": {"en": "Step away, make yourself seen, and tell your supervisor.", "hi": "दूर हटें, खुद को दिखाएँ और सुपरवाइज़र को बताएँ।"},
        "pictogram": "report", "image_path": null, "audio_id": null}],
     "quiz": [
       {"id": "q1", "prompt": {"en": "A machine nearby shows a fault. What do you do?", "hi": "पास की मशीन में खराबी दिख रही है। आप क्या करेंगे?"},
        "choices": [{"id": "away", "label": {"en": "Step away", "hi": "दूर हटें"}, "pictogram": "distance"},
                    {"id": "near", "label": {"en": "Walk past it", "hi": "उसके पास से निकलें"}, "pictogram": "go"}],
        "correct_id": "away", "why": {"en": "Distance is the first protection.", "hi": "दूरी पहली सुरक्षा है।"}},
       {"id": "q2", "prompt": {"en": "Who do you tell?", "hi": "किसे बताएँ?"},
        "choices": [{"id": "sup", "label": {"en": "Supervisor", "hi": "सुपरवाइज़र"}, "pictogram": "report"},
                    {"id": "none", "label": {"en": "No one", "hi": "किसी को नहीं"}, "pictogram": "no"}],
        "correct_id": "sup", "why": {"en": "They can stop and tag the machine.", "hi": "वे मशीन रोककर टैग कर सकते हैं।"}},
       {"id": "q3", "prompt": {"en": "Where do you stay?", "hi": "आप कहाँ रहें?"},
        "choices": [{"id": "out", "label": {"en": "Outside its path", "hi": "उसके रास्ते से बाहर"}, "pictogram": "yes"},
                    {"id": "in", "label": {"en": "Near the cab", "hi": "केबिन के पास"}, "pictogram": "no"}],
        "correct_id": "out", "why": {"en": "Out of the path means out of harm.", "hi": "रास्ते से बाहर यानी खतरे से बाहर।"}}],
     "video_path": null, "source_refs": []}',
   array['safety.proximity'], 1)
on conflict (code) do update set content = excluded.content, topic_event_types = excluded.topic_event_types,
  version = excluded.version;

-- evidence_spec = {max_open, cards[{id, type, relevant, title, why}]}. The three relevant cards come first in
-- ideal_open_order. decide_steps carry the answer key (best, axis, weight, why) next to what the client sees.
-- An "order" step lists its choices scrambled, so the display order does not give the answer away.
insert into public.replay_templates (event_type, version, brief, evidence_spec, ideal_open_order, decide_steps,
                                     correct_protocol_order, protocol_card_id) values
  ('safety.seatbelt_breach', 1,
   '{"title": {"en": "What happened", "hi": "क्या हुआ"},
     "summary": {"en": "Seatbelt off on a {slope_deg}° slope", "hi": "{slope_deg}° ढलान पर सीटबेल्ट खुली"},
     "situation": {"en": "At {time} {machine} moved at {speed_kmh} km/h on {zone} with the seatbelt off.",
                   "hi": "{time} पर {machine} {zone} पर {speed_kmh} किमी/घंटा चली, सीटबेल्ट खुली थी।"},
     "goal": {"en": "Find what mattered, then decide.", "hi": "जो मायने रखता है उसे ढूँढें, फिर निर्णय लें।"},
     "time_budget_s": 60, "audio_id": null}',
   '{"max_open": 4, "cards": [
      {"id": "c_trend", "type": "telemetry_trend", "relevant": true, "title": {"en": "Speed, slope and seatbelt", "hi": "गति, ढलान और सीटबेल्ट"},
       "why": {"en": "The machine was moving on a steep slope while the seatbelt read off.", "hi": "मशीन तेज़ ढलान पर चल रही थी और सीटबेल्ट खुली दिख रही थी।"}},
      {"id": "c_map", "type": "map_snapshot", "relevant": true, "title": {"en": "Where it happened", "hi": "कहाँ हुआ"},
       "why": {"en": "The map shows the slope zone where it happened.", "hi": "नक्शा वह ढलान क्षेत्र दिखाता है जहाँ यह हुआ।"}},
      {"id": "c_card", "type": "protocol_card", "relevant": true, "title": {"en": "Protocol card", "hi": "प्रोटोकॉल कार्ड"},
       "why": {"en": "The protocol card sets the seatbelt rule for slopes.", "hi": "प्रोटोकॉल कार्ड ढलान पर सीटबेल्ट का नियम बताता है।"}},
      {"id": "c_wind", "type": "wind", "relevant": false, "title": {"en": "Wind", "hi": "हवा"},
       "why": {"en": "Wind did not cause this.", "hi": "हवा इसका कारण नहीं थी।"}},
      {"id": "c_fault", "type": "fault_code", "relevant": false, "title": {"en": "Fault codes", "hi": "खराबी कोड"},
       "why": {"en": "Fault codes are unrelated to the seatbelt.", "hi": "खराबी कोड का सीटबेल्ट से संबंध नहीं।"}},
      {"id": "c_weather", "type": "weather", "relevant": false, "title": {"en": "Weather", "hi": "मौसम"},
       "why": {"en": "Heat did not cause this.", "hi": "गर्मी कारण नहीं थी।"}},
      {"id": "c_shift", "type": "shift_hours", "relevant": false, "title": {"en": "Hours on shift", "hi": "शिफ्ट के घंटे"},
       "why": {"en": "Hours on shift were not the cause.", "hi": "शिफ्ट के घंटे कारण नहीं थे।"}}]}',
   array['c_trend', 'c_map', 'c_card'],
   '[{"step": 1, "kind": "single", "time_limit_s": 15, "audio_id": null, "axis": "safety", "weight": 1,
      "prompt": {"en": "The machine is moving on the slope with the seatbelt off. First action?", "hi": "मशीन ढलान पर बिना सीटबेल्ट चल रही है। पहला कदम?"},
      "choices": [{"id": "stop", "label": {"en": "Stop the machine safely", "hi": "मशीन सुरक्षित रोकें"}, "pictogram": "stop"},
                  {"id": "continue", "label": {"en": "Finish the pass first", "hi": "पहले चक्कर पूरा करें"}, "pictogram": "go"},
                  {"id": "radio", "label": {"en": "Radio the supervisor first", "hi": "पहले सुपरवाइज़र को रेडियो करें"}, "pictogram": "radio"}],
      "best": ["stop"], "why": {"en": "Stop first, before anything else.", "hi": "सबसे पहले रोकें।"}},
     {"step": 2, "kind": "single", "time_limit_s": 15, "audio_id": null, "axis": "safety", "weight": 1,
      "prompt": {"en": "Before the machine moves again?", "hi": "मशीन फिर चलने से पहले?"},
      "choices": [{"id": "belt", "label": {"en": "Fasten the seatbelt and tug it", "hi": "सीटबेल्ट लगाएँ और खींचकर देखें"}, "pictogram": "belt"},
                  {"id": "slow", "label": {"en": "Move slowly without it", "hi": "बिना बेल्ट धीरे चलें"}, "pictogram": "slope"},
                  {"id": "escort", "label": {"en": "Ask a colleague to walk alongside", "hi": "साथी को साथ चलने को कहें"}, "pictogram": "walk"}],
      "best": ["belt"], "why": {"en": "Fasten the seatbelt before moving again.", "hi": "फिर से चलने से पहले सीटबेल्ट लगाएँ।"}},
     {"step": 3, "kind": "order", "time_limit_s": 25, "audio_id": null, "axis": "procedure", "weight": 1,
      "prompt": {"en": "Put the protocol in order", "hi": "प्रोटोकॉल का क्रम लगाएँ"},
      "choices": [{"id": "report", "label": {"en": "Tell the supervisor", "hi": "सुपरवाइज़र को बताएँ"}, "pictogram": "report"},
                  {"id": "resume", "label": {"en": "Resume work", "hi": "काम फिर शुरू करें"}, "pictogram": "go"},
                  {"id": "park", "label": {"en": "Park on level ground", "hi": "समतल जगह पर पार्क करें"}, "pictogram": "park"},
                  {"id": "belt", "label": {"en": "Fasten and tug the belt", "hi": "बेल्ट लगाएँ और खींचें"}, "pictogram": "belt"}],
      "best": ["park", "belt", "report", "resume"], "why": {"en": "Park, fasten, report, then resume.", "hi": "पार्क करें, बेल्ट लगाएँ, रिपोर्ट करें, फिर शुरू करें।"}}]',
   array['park', 'belt', 'report', 'resume'], 'seatbelt_slopes')
on conflict (event_type) do update set version = excluded.version, brief = excluded.brief,
  evidence_spec = excluded.evidence_spec, ideal_open_order = excluded.ideal_open_order,
  decide_steps = excluded.decide_steps, correct_protocol_order = excluded.correct_protocol_order,
  protocol_card_id = excluded.protocol_card_id;

-- ── 3. scoring (pure) ────────────────────────────────────────────────────────────────────────────
-- Kendall-style pair credit, as pairCredit() in fixture-scoring.ts: the share of the reference's ordered pairs that
-- `given` also has in the same order. An id missing from `given` earns nothing; no pairs at all scores 1.
create or replace function private.replay_pair_credit(p_ref text[], p_given text[])
returns float8 language plpgsql immutable set search_path = '' as $$
declare n int := coalesce(array_length(p_ref, 1), 0); total int := 0; ok int := 0; a int; b int; ia int; ib int;
begin
  for a in 1 .. n loop
    for b in a + 1 .. n loop
      total := total + 1;
      ia := array_position(p_given, p_ref[a]);
      ib := array_position(p_given, p_ref[b]);
      if ia is not null and ib is not null and ia < ib then ok := ok + 1; end if;
    end loop;
  end loop;
  if total = 0 then return 1::float8; end if;
  return ok::float8 / total::float8;
end $$;

-- data-model §2.8 weights (canonical; written down there too) and the exact arithmetic of scoreReplay():
--   * only the first max_open DISTINCT opened ids count (UI-20); unknown ids count as irrelevant
--   * safety      = sum(weight x credit) / sum(weight) over safety-axis steps, x100 (100 when there are none)
--   * procedure   = 1/2 protocol + 1/2 investigation; protocol = mean credit of the "order" steps (1 when none);
--                   investigation = 1/2 net relevance + 1/2 pair credit against `ideal`;
--                   net relevance = clamp01((relevant opened - irrelevant opened) / relevant cards) (1 when none)
--   * efficiency  = steps answered within time_limit_s / steps, x100 (a timed-out step is absent and not within)
--   * credit      = "order" step: pair credit against `best` (0 if empty); other steps: 1 only for the exact set
--   * every score is round1(x) = round(x * 1000) / 10 on a float8, which is what the web code computes
create or replace function private.replay_score(p_scenario jsonb, p_key jsonb, p_open text[], p_choices jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_max int := nullif(p_scenario #>> '{investigate,max_open}', '')::int;
  v_opened text[] := '{}'; v_id text;
  v_rel text[]; v_size int; v_rel_open int := 0; v_net float8; v_inv float8; v_ideal text[];
  v_rows jsonb := '[]'; v_review jsonb := '[]';
  def jsonb; k jsonb; g jsonb; v_step int; v_kind text; v_limit float8; v_best text[]; v_chosen text[];
  v_correct boolean; v_within boolean; v_credit float8; v_weight float8; v_axis text; v_why jsonb;
  v_saf_w float8 := 0; v_saf_s float8 := 0; v_ord_n int := 0; v_ord_s float8 := 0; v_within_n int := 0; v_n int := 0;
  v_protocol float8; v_safety float8; v_proc float8; v_eff float8; v_en text; v_hi text;
begin
  -- opened: distinct, in order, then the first max_open
  foreach v_id in array coalesce(p_open, '{}') loop
    if v_id is not null and not (v_id = any (v_opened)) then v_opened := v_opened || v_id; end if;
  end loop;
  if v_max is not null then v_opened := v_opened[1:greatest(v_max, 0)]; end if;

  select coalesce(array_agg(distinct c ->> 'card_id'), '{}') into v_rel
    from jsonb_array_elements(coalesce(p_key -> 'cards', '[]')) c where (c ->> 'relevant')::boolean is true;
  v_size := coalesce(array_length(v_rel, 1), 0);
  foreach v_id in array v_opened loop
    if v_id = any (v_rel) then v_rel_open := v_rel_open + 1; end if;
  end loop;
  if v_size = 0 then v_net := 1;
  else v_net := least(1::float8, greatest(0::float8,
         (v_rel_open - (coalesce(array_length(v_opened, 1), 0) - v_rel_open))::float8 / v_size::float8)); end if;
  select coalesce(array_agg(x), '{}') into v_ideal from jsonb_array_elements_text(coalesce(p_key -> 'ideal', '[]')) x;
  v_inv := (v_net + private.replay_pair_credit(v_ideal, v_opened)) / 2::float8;

  for def in select d from jsonb_array_elements(coalesce(p_scenario #> '{decide,steps}', '[]')) d loop
    v_n := v_n + 1;
    v_step := (def ->> 'step')::int; v_kind := def ->> 'kind'; v_limit := (def ->> 'time_limit_s')::float8;
    select s into k from jsonb_array_elements(coalesce(p_key -> 'steps', '[]')) s where (s ->> 'step')::int = v_step limit 1;
    select coalesce(array_agg(x), '{}') into v_best from jsonb_array_elements_text(coalesce(k -> 'best', '[]')) x;
    select c into g from jsonb_array_elements(coalesce(p_choices, '[]')) c where (c ->> 'step')::int = v_step limit 1;
    if g is null then v_chosen := '{}';
    else select coalesce(array_agg(x), '{}') into v_chosen from jsonb_array_elements_text(coalesce(g -> 'choice_ids', '[]')) x; end if;
    v_chosen := coalesce(v_chosen, '{}');
    v_weight := coalesce((k ->> 'weight')::float8, 1); v_axis := coalesce(k ->> 'axis', 'safety');

    if v_kind = 'order' then
      v_correct := cardinality(v_chosen) > 0 and cardinality(v_chosen) = cardinality(v_best) and v_chosen = v_best;
    else
      v_correct := cardinality(v_chosen) > 0 and cardinality(v_chosen) = cardinality(v_best) and v_best <@ v_chosen;
    end if;
    v_within := g is not null and (g ->> 'ms')::float8 <= v_limit * 1000;
    if v_kind = 'order' then
      v_credit := case when cardinality(v_chosen) > 0 then private.replay_pair_credit(v_best, v_chosen) else 0::float8 end;
      v_ord_n := v_ord_n + 1; v_ord_s := v_ord_s + v_credit;
    else
      v_credit := case when v_correct then 1::float8 else 0::float8 end;
    end if;
    if v_axis = 'safety' then v_saf_w := v_saf_w + v_weight; v_saf_s := v_saf_s + v_weight * v_credit; end if;
    if v_within then v_within_n := v_within_n + 1; end if;

    if cardinality(v_chosen) = 0 then
      v_en := btrim('Time ran out. ' || coalesce(k #>> '{why,en}', ''));
      v_hi := k #>> '{why,hi}';
      v_why := jsonb_build_object('en', v_en);
      if v_hi is not null and v_hi <> '' then v_why := v_why || jsonb_build_object('hi', 'समय समाप्त। ' || v_hi); end if;
    else
      v_why := coalesce(k -> 'why', jsonb_build_object('en', ''));
    end if;
    v_review := v_review || jsonb_build_object('step', v_step, 'chosen', to_jsonb(v_chosen), 'best', to_jsonb(v_best), 'why', v_why);
  end loop;

  v_protocol := case when v_ord_n = 0 then 1::float8 else v_ord_s / v_ord_n::float8 end;
  v_safety := case when v_saf_w = 0 then 100::float8
                   else floor((v_saf_s / v_saf_w) * 1000::float8 + 0.5::float8) / 10::float8 end;
  v_proc := floor(((v_protocol + v_inv) / 2::float8) * 1000::float8 + 0.5::float8) / 10::float8;
  v_eff := case when v_n = 0 then 100::float8
                else floor((v_within_n::float8 / v_n::float8) * 1000::float8 + 0.5::float8) / 10::float8 end;

  return jsonb_build_object(
    'scores', jsonb_build_object('safety', v_safety, 'procedure', v_proc, 'efficiency', v_eff),
    'process_trace', jsonb_build_object('opened', to_jsonb(v_opened), 'ideal', coalesce(p_key -> 'ideal', '[]'),
                                        'relevant', coalesce(p_key -> 'cards', '[]')),
    'review', v_review,
    'rule', coalesce(p_key -> 'rule', 'null'::jsonb),
    'lesson_code', coalesce(p_key -> 'lesson_code', 'null'::jsonb));
end $$;

-- ── 4. builder ───────────────────────────────────────────────────────────────────────────────────
-- Fills the named {slots} of an I18nText (en, hi, ta) from a jsonb object; absent slots stay as written.
create or replace function private.fill_slots(p_text jsonb, p_slots jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare lang text; s text; k text; v text; r jsonb := '{}';
begin
  for lang in select jsonb_object_keys(p_text) loop
    s := p_text ->> lang;
    for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_slots -> lang, p_slots -> 'en', '{}')) loop
      s := replace(s, '{' || k || '}', coalesce(v, ''));
    end loop;
    r := r || jsonb_build_object(lang, s);
  end loop;
  return r;
end $$;

create or replace function private.build_replay(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; tpl public.replay_templates; pc public.protocol_cards; sc public.scenarios; mc public.machines;
  v_existing uuid; v_id uuid := gen_random_uuid(); v_tz text; v_site_loc extensions.geography; v_lesson text;
  v_off bigint; v_w0 bigint := 0; v_w1 bigint := 0; v_event_ms int := 0; v_dur int := 0;
  r record; rn int; cnt int; stride int; t int;
  v_lat float8; v_lon float8; v_spd float8; v_pit float8; v_blt boolean; v_ev_lat float8; v_ev_lon float8;
  v_track jsonb := '[]'; v_trail jsonb := '[]'; v_wind jsonb := '[]';
  s_speed jsonb := '[]'; s_pitch jsonb := '[]'; s_belt jsonb := '[]';
  v_cards jsonb := '[]'; v_key_cards jsonb := '[]'; spec jsonb; card jsonb; v_type text;
  v_wx jsonb; v_zone_id uuid; v_zone_name text; v_slope float8; v_speed_at float8; v_center jsonb;
  v_zones jsonb; v_faults jsonb; v_hours float8; v_start timestamptz; v_local_h int; v_band text;
  v_slots jsonb; v_steps_client jsonb; v_steps_key jsonb; v_resp int; v_key jsonb; v_scenario jsonb; v_rule jsonb;
begin
  select rs.id into v_existing from public.replay_scenarios rs where rs.source_event_id = p_event_id;
  if v_existing is not null then return v_existing; end if;

  select * into ev from public.events e where e.id = p_event_id;
  if ev.id is null then raise exception 'build_replay: event % not found', p_event_id using errcode = 'P0001'; end if;
  if private.event_is_sealed(ev) then
    raise exception 'build_replay: a sealed near miss never becomes a replay' using errcode = 'P0001';
  end if;
  select * into tpl from public.replay_templates t where t.event_type = ev.type;
  if tpl.event_type is null then raise exception 'build_replay: no replay template for %', ev.type using errcode = 'P0001'; end if;
  if ev.operator_id is null or ev.machine_id is null then
    raise exception 'build_replay: event % has no operator or machine', ev.id using errcode = 'P0001';
  end if;
  select * into pc from public.protocol_cards c where c.id = tpl.protocol_card_id;
  select * into mc from public.machines m where m.id = ev.machine_id;
  select s.timezone, s.location into v_tz, v_site_loc from public.sites s where s.id = ev.site_id;
  select et.lesson_code into v_lesson from public.event_types et where et.type = ev.type;

  -- the scenario and the event's place on its timeline
  if ev.run_id is not null then
    select s2.* into sc from public.scenario_runs r2 join public.scenarios s2 on s2.id = r2.scenario_id where r2.id = ev.run_id;
  end if;
  if sc.id is not null then
    select f.sim_offset_ms into v_off from public.scenario_frames f
      where f.scenario_id = sc.id and f.seq = nullif(ev.payload ->> 'frame_seq', '')::int;
    if v_off is null and ev.sim_ts is not null then
      v_off := round(extract(epoch from (ev.sim_ts - sc.shift_start_sim)) * 1000)::bigint;
    end if;
  end if;
  if v_off is not null then
    v_w0 := greatest(0, v_off - 600000);              -- 10 simulated minutes before …
    v_w1 := v_off + 120000;                           -- … to 2 after
    v_event_ms := (v_off - v_w0)::int; v_dur := (v_w1 - v_w0)::int;
  end if;

  -- machine telemetry: track (with the belt), and the trend series; lat/lon carried forward across a dropout
  if v_off is not null then
    select count(*) into cnt from public.scenario_frames f
      where f.scenario_id = sc.id and f.kind = 'telemetry' and f.machine_id = ev.machine_id and f.sim_offset_ms between v_w0 and v_w1;
    stride := greatest(1, ceil(cnt / 590.0)::int); rn := 0;
    for r in select f.sim_offset_ms - v_w0 as t_ms, f.payload as p from public.scenario_frames f
              where f.scenario_id = sc.id and f.kind = 'telemetry' and f.machine_id = ev.machine_id
                and f.sim_offset_ms between v_w0 and v_w1 order by f.sim_offset_ms loop
      rn := rn + 1; t := r.t_ms::int;
      v_lat := coalesce(nullif(r.p ->> 'lat', '')::float8, v_lat); v_lon := coalesce(nullif(r.p ->> 'lon', '')::float8, v_lon);
      v_spd := nullif(r.p ->> 'speed_kmh', '')::float8; v_pit := nullif(r.p ->> 'pitch_deg', '')::float8;
      v_blt := nullif(r.p ->> 'seatbelt_fastened', '')::boolean;
      if t <= v_event_ms and v_lat is not null then v_ev_lat := v_lat; v_ev_lon := v_lon; end if;
      if (rn - 1) % stride = 0 or t = v_event_ms then
        if v_lat is not null then
          v_track := v_track || jsonb_build_object('t_ms', t, 'lat', v_lat, 'lon', v_lon, 'speed_kmh', coalesce(v_spd, 0),
                                                   'pitch_deg', coalesce(v_pit, 0), 'seatbelt_fastened', v_blt);
        end if;
        if v_spd is not null then s_speed := s_speed || jsonb_build_object('t_ms', t, 'v', v_spd); end if;
        if v_pit is not null then s_pitch := s_pitch || jsonb_build_object('t_ms', t, 'v', v_pit); end if;
        if v_blt is not null then s_belt := s_belt || jsonb_build_object('t_ms', t, 'v', case when v_blt then 1 else 0 end); end if;
      end if;
    end loop;
    -- the operator's own trail (gps frames); the cab trail when the operator has none
    select count(*) into cnt from public.scenario_frames f
      where f.scenario_id = sc.id and f.kind = 'gps' and f.operator_id = ev.operator_id and f.sim_offset_ms between v_w0 and v_w1;
    stride := greatest(1, ceil(cnt / 590.0)::int); rn := 0;
    for r in select f.sim_offset_ms - v_w0 as t_ms, f.payload as p from public.scenario_frames f
              where f.scenario_id = sc.id and f.kind = 'gps' and f.operator_id = ev.operator_id
                and f.sim_offset_ms between v_w0 and v_w1 order by f.sim_offset_ms loop
      rn := rn + 1;
      if (rn - 1) % stride = 0 and (r.p ->> 'lat') is not null and (r.p ->> 'lon') is not null then
        v_trail := v_trail || jsonb_build_object('t_ms', r.t_ms::int, 'lat', (r.p ->> 'lat')::float8, 'lon', (r.p ->> 'lon')::float8);
      end if;
    end loop;
    if jsonb_array_length(v_trail) = 0 then
      v_trail := (select coalesce(jsonb_agg(jsonb_build_object('t_ms', (x ->> 't_ms')::int, 'lat', x -> 'lat', 'lon', x -> 'lon')), '[]')
                    from jsonb_array_elements(v_track) x);
    end if;
    -- wind over the window, from the weather frames (the last one before the window opens is its t = 0)
    select coalesce(jsonb_agg(jsonb_build_object('t_ms', greatest(0, w.off - v_w0)::int, 'from_deg', w.fd, 'kmh', w.kmh) order by w.off), '[]')
      into v_wind
      from (select f.sim_offset_ms as off, (f.payload ->> 'wind_from_deg')::float8 as fd, (f.payload ->> 'wind_kmh')::float8 as kmh
              from public.scenario_frames f
             where f.scenario_id = sc.id and f.kind = 'weather' and f.sim_offset_ms between v_w0 and v_w1
               and f.payload ->> 'wind_from_deg' is not null and f.payload ->> 'wind_kmh' is not null
            union all
            (select f.sim_offset_ms, (f.payload ->> 'wind_from_deg')::float8, (f.payload ->> 'wind_kmh')::float8
               from public.scenario_frames f
              where f.scenario_id = sc.id and f.kind = 'weather' and f.sim_offset_ms < v_w0
                and f.payload ->> 'wind_from_deg' is not null and f.payload ->> 'wind_kmh' is not null
              order by f.sim_offset_ms desc limit 1)) w;
    select f.payload into v_wx from public.scenario_frames f
      where f.scenario_id = sc.id and f.kind = 'weather' and f.sim_offset_ms <= v_off order by f.sim_offset_ms desc limit 1;
    -- the event's frame: speed, slope
    select nullif(f.payload ->> 'speed_kmh', '')::float8, greatest(abs(coalesce(nullif(f.payload ->> 'pitch_deg', '')::float8, 0)),
           abs(coalesce(nullif(f.payload ->> 'roll_deg', '')::float8, 0)))
      into v_speed_at, v_slope from public.scenario_frames f where f.scenario_id = sc.id and f.seq = nullif(ev.payload ->> 'frame_seq', '')::int;
  end if;
  v_speed_at := coalesce(v_speed_at, nullif(ev.payload ->> 'speed_kmh', '')::float8, 0);
  v_slope := coalesce(v_slope, greatest(abs(coalesce(nullif(ev.payload ->> 'pitch_deg', '')::float8, 0)),
                                        abs(coalesce(nullif(ev.payload ->> 'roll_deg', '')::float8, 0))), 0);

  -- centre of the map: the machine at the event, else the site
  if v_ev_lat is null and jsonb_array_length(v_track) > 0 then
    v_ev_lat := (v_track -> 0 ->> 'lat')::float8; v_ev_lon := (v_track -> 0 ->> 'lon')::float8;
  end if;
  if v_ev_lat is null then
    v_ev_lat := extensions.st_y(v_site_loc::extensions.geometry); v_ev_lon := extensions.st_x(v_site_loc::extensions.geometry);
  end if;
  v_center := jsonb_build_object('lat', v_ev_lat, 'lon', v_ev_lon);

  select z.id, z.name into v_zone_id, v_zone_name from public.zones z where z.id = nullif(ev.payload ->> 'zone_id', '')::uuid;

  -- shift hours (the operator's shift on this run, else the scenario's start) and the circadian band
  if ev.sim_ts is not null then
    select coalesce(s.actual_start, s.scheduled_start) into v_start from public.shifts s
      where s.run_id = ev.run_id and s.operator_id = ev.operator_id and coalesce(s.actual_start, s.scheduled_start) <= ev.sim_ts
      order by coalesce(s.actual_start, s.scheduled_start) desc limit 1;
    v_start := coalesce(v_start, sc.shift_start_sim, ev.sim_ts);
    v_hours := greatest(0, round((extract(epoch from (ev.sim_ts - v_start)) / 3600.0)::numeric, 1)::float8);
    v_local_h := extract(hour from (ev.sim_ts at time zone coalesce(v_tz, 'UTC')))::int;
  else
    v_hours := 0; v_local_h := 12;
  end if;
  v_band := case when v_local_h in (13, 14) then 'post_lunch_dip' when v_local_h between 0 and 4 then 'night_trough' else 'normal' end;

  -- evidence cards, in the template's order; a card whose data does not exist is left out, never invented
  for spec in select x from jsonb_array_elements(tpl.evidence_spec -> 'cards') x loop
    v_type := spec ->> 'type'; card := null;
    if v_type = 'telemetry_trend' then
      card := jsonb_build_object('series', jsonb_build_array(
        jsonb_build_object('metric', 'speed_kmh', 'points', s_speed), jsonb_build_object('metric', 'pitch_deg', 'points', s_pitch),
        jsonb_build_object('metric', 'seatbelt', 'points', s_belt)));
    elsif v_type = 'map_snapshot' then
      select coalesce(jsonb_agg(zj), '[]') into v_zones from (
        select jsonb_build_object('id', z.id, 'name', z.name, 'zone_type', z.zone_type,
                 'polygon', (select jsonb_agg(jsonb_build_object('lat', extensions.st_y(d.geom), 'lon', extensions.st_x(d.geom)) order by d.path)
                               from extensions.st_dumppoints(extensions.st_exteriorring(z.boundary::extensions.geometry)) d)) as zj
          from public.zones z
         where z.site_id = ev.site_id
           and extensions.st_dwithin(z.boundary, extensions.st_setsrid(extensions.st_makepoint(v_ev_lon, v_ev_lat), 4326)::extensions.geography, 300)
         order by extensions.st_distance(z.boundary, extensions.st_setsrid(extensions.st_makepoint(v_ev_lon, v_ev_lat), 4326)::extensions.geography)
         limit 12) q;
      card := jsonb_build_object('center', v_center, 'zoom', 16, 'zones', v_zones, 'trail', v_trail,
                                 'machine_track', (select coalesce(jsonb_agg(jsonb_build_object('t_ms', (x ->> 't_ms')::int, 'lat', x -> 'lat', 'lon', x -> 'lon')), '[]')
                                                     from jsonb_array_elements(v_track) x));
    elsif v_type = 'wind' then
      if v_wx is not null and v_wx ->> 'wind_from_deg' is not null and v_wx ->> 'wind_kmh' is not null then
        card := jsonb_build_object('from_deg', (v_wx ->> 'wind_from_deg')::float8, 'kmh', (v_wx ->> 'wind_kmh')::float8,
                                   'gust_kmh', nullif(v_wx ->> 'wind_gust_kmh', '')::float8);
      end if;
    elsif v_type = 'fault_code' then
      select coalesce(jsonb_agg(fj order by fo), '[]') into v_faults from (
        select distinct on (ck) ck, fo, act, fj from (
          select concat_ws('/', f.payload ->> 'code_type', f.payload ->> 'spn', f.payload ->> 'fmi', f.payload ->> 'cid', f.payload ->> 'mid', f.payload ->> 'eid') as ck,
                 f.sim_offset_ms as fo, coalesce((f.payload ->> 'active')::boolean, true) as act,
                 jsonb_build_object('code_type', coalesce(f.payload ->> 'code_type', 'j1939_spn_fmi'),
                   'code', case coalesce(f.payload ->> 'code_type', 'j1939_spn_fmi')
                             when 'j1939_spn_fmi' then 'SPN ' || coalesce(f.payload ->> 'spn', '?') || ' FMI ' || coalesce(f.payload ->> 'fmi', '?')
                             when 'cat_cid_fmi' then 'CID ' || coalesce(f.payload ->> 'cid', '?') || ' FMI ' || coalesce(f.payload ->> 'fmi', '?')
                             else 'EID ' || coalesce(f.payload ->> 'eid', '?') end,
                   'severity', f.payload ->> 'severity',
                   'description', jsonb_build_object('en', initcap(replace(split_part(coalesce(f.payload ->> 'description_key', 'fault'), '.', 2), '_', ' ')))) as fj
            from public.scenario_frames f
           where sc.id is not null and f.scenario_id = sc.id and f.kind = 'fault' and f.machine_id = ev.machine_id and f.sim_offset_ms <= v_off) a
         order by ck, fo desc) b where act;
      card := jsonb_build_object('codes', v_faults);
    elsif v_type = 'protocol_card' then
      card := jsonb_build_object('card_id', tpl.protocol_card_id);
    elsif v_type = 'weather' then
      if v_wx is not null and v_wx ->> 'temperature_c' is not null then
        card := jsonb_build_object('temperature_c', (v_wx ->> 'temperature_c')::float8, 'wbgt_c', nullif(v_wx ->> 'wbgt_c', '')::float8);
      end if;
    elsif v_type = 'shift_hours' then
      card := jsonb_build_object('hours_on_shift', v_hours, 'circadian_band', v_band);
    end if;
    if card is not null then
      v_cards := v_cards || (jsonb_build_object('type', v_type, 'id', spec ->> 'id', 'title', spec -> 'title') || card);
      v_key_cards := v_key_cards || jsonb_build_object('card_id', spec ->> 'id', 'relevant', (spec ->> 'relevant')::boolean, 'why', spec -> 'why');
    end if;
  end loop;
  if jsonb_array_length(v_cards) < 3 then
    raise exception 'build_replay: only % evidence cards could be built (3 needed)', jsonb_array_length(v_cards) using errcode = 'P0001';
  end if;

  -- decide steps: what the client sees / the key
  select jsonb_agg(jsonb_build_object('step', (s ->> 'step')::int, 'prompt', s -> 'prompt', 'audio_id', s -> 'audio_id',
                                      'time_limit_s', (s ->> 'time_limit_s')::int, 'kind', s ->> 'kind', 'choices', s -> 'choices') order by (s ->> 'step')::int),
         jsonb_agg(jsonb_build_object('step', (s ->> 'step')::int, 'best', s -> 'best', 'axis', s ->> 'axis',
                                      'weight', (s ->> 'weight')::float8, 'why', s -> 'why') order by (s ->> 'step')::int)
    into v_steps_client, v_steps_key from jsonb_array_elements(tpl.decide_steps) s;

  -- the operator's real response: the event to the alert's acknowledgement
  select greatest(0, round(extract(epoch from (a.ack_at - ev.recorded_at)) * 1000))::int into v_resp
    from public.alerts a where a.origin_event_id = ev.id and a.ack_at is not null order by a.ack_at limit 1;

  v_rule := jsonb_build_object('card_id', pc.id, 'audio_id', null, 'text', pc.steps -> 0);   -- quoted from the fixed card, never generated
  v_slots := jsonb_build_object(
    'en', jsonb_build_object('machine', mc.code, 'speed_kmh', round(v_speed_at)::int, 'slope_deg', round(v_slope)::int,
            'time', to_char(ev.sim_ts at time zone coalesce(v_tz, 'UTC'), 'HH24:MI'), 'zone', coalesce(v_zone_name, 'the slope')),
    'hi', jsonb_build_object('machine', mc.code, 'speed_kmh', round(v_speed_at)::int, 'slope_deg', round(v_slope)::int,
            'time', to_char(ev.sim_ts at time zone coalesce(v_tz, 'UTC'), 'HH24:MI'), 'zone', coalesce(v_zone_name, 'ढलान')));

  v_scenario := jsonb_build_object(
    'id', v_id, 'event_id', ev.id, 'event_type', ev.type,
    'occurred_sim_ts', to_char(coalesce(ev.sim_ts, ev.recorded_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'machine_code', mc.code,
    'summary', private.fill_slots(tpl.brief -> 'summary', v_slots),
    'brief', jsonb_build_object('title', tpl.brief -> 'title', 'situation', private.fill_slots(tpl.brief -> 'situation', v_slots),
               'goal', tpl.brief -> 'goal', 'time_budget_s', (tpl.brief ->> 'time_budget_s')::int, 'audio_id', tpl.brief -> 'audio_id'),
    'investigate', jsonb_build_object('cards', v_cards, 'max_open', nullif(tpl.evidence_spec ->> 'max_open', '')::int),
    'decide', jsonb_build_object('steps', v_steps_client),
    'reenactment', jsonb_build_object('duration_ms', v_dur, 'event_ms', v_event_ms, 'trail', v_trail,
                     'machine_track', v_track, 'wind', v_wind, 'real_response_ms', v_resp));

  v_key := jsonb_build_object(
    'cards', v_key_cards,
    'ideal', (select coalesce(jsonb_agg(i), '[]') from unnest(tpl.ideal_open_order) i
               where exists (select 1 from jsonb_array_elements(v_key_cards) k where k ->> 'card_id' = i)),
    'steps', v_steps_key, 'rule', v_rule, 'lesson_code', to_jsonb(v_lesson));

  insert into public.replay_scenarios (id, source_event_id, operator_id, template_version, scenario_json, answer_key)
    values (v_id, ev.id, ev.operator_id, tpl.version, v_scenario, v_key)
    on conflict (source_event_id) do nothing;
  get diagnostics rn = row_count;
  if rn = 0 then
    select rs.id into v_existing from public.replay_scenarios rs where rs.source_event_id = ev.id;
    return v_existing;
  end if;

  perform private.emit_event('training.replay_ready', jsonb_build_object('replay_id', v_id, 'source_event_id', ev.id),
    'replay_ready:' || ev.id::text, 'system', ev.site_id, p_run_id => ev.run_id, p_machine_id => ev.machine_id,
    p_operator_id => ev.operator_id, p_causation_id => ev.id);
  return v_id;
end $$;

-- ── 5. step_loop: worker step 2 ──────────────────────────────────────────────────────────────────
-- ≤ p_limit queue rows per call. Lesson assignment and replay build each run in their own exception block; a
-- failure is written on the queue row (error) and goes no further: the event, its alert and its ledger entry were
-- committed long before and are not touched. A row with an error is not retried by itself.
create or replace function private.step_loop(p_limit int default 20)
returns int language plpgsql security definer set search_path = '' as $$
declare q record; ev public.events; v_lesson text; l public.lessons; v_assign uuid; v_err text; v_done int := 0; v_replay boolean;
begin
  for q in select lq.event_id from private.loop_queue lq where lq.done_at is null and lq.error is null
            order by lq.enqueued_at limit greatest(p_limit, 0) for update skip locked loop
    v_err := null; v_assign := null;
    select * into ev from public.events e where e.id = q.event_id;
    if ev.id is null then
      update private.loop_queue set error = 'event not found' where event_id = q.event_id;
      v_done := v_done + 1; continue;
    end if;
    select et.lesson_code, et.replay into v_lesson, v_replay from public.event_types et where et.type = ev.type;

    begin
      if v_lesson is not null and ev.operator_id is not null then
        select * into l from public.lessons x where x.code = v_lesson;
        if l.id is null then raise exception 'lesson % does not exist', v_lesson using errcode = 'P0001'; end if;
        insert into public.lesson_assignments (operator_id, lesson_id, because_event_id)
          values (ev.operator_id, l.id, ev.id) on conflict do nothing returning id into v_assign;
        if v_assign is not null then
          perform private.emit_event('training.lesson_assigned',
            jsonb_build_object('assignment_id', v_assign, 'lesson_code', v_lesson, 'because_event_id', ev.id),
            'lesson_assigned:' || v_assign::text, 'system', ev.site_id, p_run_id => ev.run_id, p_machine_id => ev.machine_id,
            p_operator_id => ev.operator_id, p_causation_id => ev.id);
        end if;
      end if;
    exception when others then
      v_err := 'lesson: ' || sqlstate || ' ' || sqlerrm;
    end;

    begin
      if coalesce(v_replay, false) then perform private.build_replay(ev.id); end if;
    exception when others then
      v_err := coalesce(v_err || '; ', '') || 'replay: ' || sqlstate || ' ' || sqlerrm;
    end;

    update private.loop_queue set done_at = case when v_err is null then now() end, error = v_err where event_id = q.event_id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- ── 6. RPCs ──────────────────────────────────────────────────────────────────────────────────────
-- The caller's own replay, or an error: `forbidden` for a non-operator, `not_found` for anything not theirs
-- (another operator's replay and a missing one answer the same, so ids cannot be probed).
create or replace function private.replay_for_caller(p_replay_id uuid)
returns public.replay_scenarios language plpgsql stable security definer set search_path = '' as $$
declare v_op uuid := private.my_operator_id(); rs public.replay_scenarios; ev public.events;
begin
  if v_op is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into rs from public.replay_scenarios x where x.id = p_replay_id and x.operator_id = v_op;
  if rs.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into ev from public.events e where e.id = rs.source_event_id;
  if ev.id is null or not private.event_visible(ev, private.app_role(), private.my_site_id(), v_op) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return rs;
end $$;

create or replace function public.replay_get(p_replay_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare rs public.replay_scenarios;
begin
  rs := private.replay_for_caller(p_replay_id);
  return rs.scenario_json;                          -- the answer key is a different column and never read here
end $$;

create or replace function public.replay_submit(p_replay_id uuid, p_request_id uuid, p_open_order text[], p_choices jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rs public.replay_scenarios; v_prev jsonb; v_res jsonb; v_attempt uuid; c jsonb; ev public.events;
begin
  rs := private.replay_for_caller(p_replay_id);
  if p_request_id is null then raise exception 'validation' using errcode = 'P0001'; end if;
  select a.result into v_prev from public.replay_attempts a where a.replay_id = rs.id and a.request_id = p_request_id;
  if v_prev is not null then return v_prev; end if;   -- a repeated request returns the stored debrief, scores unchanged

  if p_choices is null or jsonb_typeof(p_choices) <> 'array' then raise exception 'validation' using errcode = 'P0001'; end if;
  for c in select x from jsonb_array_elements(p_choices) x loop
    if jsonb_typeof(c) <> 'object' or jsonb_typeof(c -> 'step') <> 'number' or jsonb_typeof(c -> 'ms') <> 'number'
       or jsonb_typeof(c -> 'choice_ids') <> 'array' or jsonb_array_length(c -> 'choice_ids') = 0 or (c ->> 'ms')::numeric < 0 then
      raise exception 'validation' using errcode = 'P0001';
    end if;
  end loop;

  v_res := private.replay_score(rs.scenario_json, rs.answer_key, coalesce(p_open_order, '{}'), p_choices);
  insert into public.replay_attempts (replay_id, operator_id, completed_at, open_order, choices, safety_score, procedure_score,
                                      efficiency_score, process_trace, request_id, result)
    values (rs.id, rs.operator_id, now(), coalesce(p_open_order, '{}'), p_choices,
            (v_res #>> '{scores,safety}')::numeric, (v_res #>> '{scores,procedure}')::numeric, (v_res #>> '{scores,efficiency}')::numeric,
            v_res -> 'process_trace', p_request_id, v_res)
    on conflict (replay_id, request_id) where request_id is not null do nothing
    returning id into v_attempt;
  if v_attempt is null then      -- lost a race with the same request: return what won
    select a.result into v_prev from public.replay_attempts a where a.replay_id = rs.id and a.request_id = p_request_id;
    return v_prev;
  end if;

  select * into ev from public.events e where e.id = rs.source_event_id;
  perform private.emit_event('training.replay_completed',
    jsonb_build_object('replay_id', rs.id, 'attempt_id', v_attempt, 'scores', v_res -> 'scores'),   -- the same object as the response (UI-19)
    'replay_completed:' || v_attempt::text, 'user', ev.site_id, p_run_id => ev.run_id, p_machine_id => ev.machine_id,
    p_operator_id => rs.operator_id, p_causation_id => ev.id);
  return v_res;
end $$;

revoke execute on function public.replay_get(uuid), public.replay_submit(uuid, uuid, text[], jsonb) from public, anon;
grant execute on function public.replay_get(uuid), public.replay_submit(uuid, uuid, text[], jsonb) to authenticated, service_role;

comment on function private.replay_score(jsonb, jsonb, text[], jsonb) is
  'Pure scorer behind replay_submit; mirrors apps/web/src/replay/fixture-scoring.ts scoreReplay in float8 so the two agree exactly (parity test: scripts/replay-parity.test.ts). Weights: data-model §2.8.';
comment on function private.build_replay(uuid) is
  'The Loop builder (B10b): event record + scenario frames → the four-phase ReplayScenario in replay_scenarios.scenario_json, the answer key in .answer_key (column not granted). Idempotent per source event; refuses a sealed event; leaves out a card whose data does not exist.';
comment on function private.step_loop(int) is
  'Worker step 2 (event-pipeline §0, N2): ≤ p_limit loop_queue rows; lesson assignment and build_replay each in their own exception block; a failure is written on the queue row and never reaches the event, the alert or the ledger.';
