-- 003h: (1) an injury is never sealed; (2) lesson seeds match the web fixtures (animated diagram pictograms).
--
-- 1. SAFETY (F11 review). Near-miss mode (PA-8, data-model §2.10) seals a report so that the fleet manager
--    never sees who filed it. That protection is for near misses only. A harm-to-a-person report must reach
--    the supervisor: severity 5 (the injury level), first_aid (the injury type) and sos (a person in distress) can never be non_punitive.
--    The public.incident_log RPC does not exist yet (B15); it will emit incident.reported through
--    private.emit_event, so the rule is enforced where every such row is born: a BEFORE INSERT trigger on
--    public.events (covers emit_event and any other writer), plus a NOT VALID check on public.incidents
--    (new rows only; ledger rows already written are untouched and their hashes unchanged).
--    The error is the contract error: message `validation` (errcode P0001) with a clear hint.
--    Other paths that can seal: private.ledger_fields_from_event (non_punitive = payload flag, default
--    type = near_miss) and private.event_is_sealed (payload flag on incident.reported, safety.*,
--    guardian.*, sos.raised, ppe.override_granted): both read the event payload, so the trigger closes them.
--    Detector events (seatbelt, guardian) carry no non_punitive flag and are never sealed.
-- 2. SEEDS. Data only; reviewed_by stays null (no safety officer has signed these off). Content = the
--    packages/shared fixtures lessonContent and swingLessonContent; audio_id and source_refs stay empty
--    until B23 and a safety officer.

create or replace function private.incident_type_never_sealed(p_type text)
returns boolean language sql immutable set search_path = '' as $f$
  select p_type in ('first_aid', 'sos');
$f$;

create or replace function private.events_refuse_sealed_harm()
returns trigger language plpgsql set search_path = '' as $f$
declare v_type text; v_sev text;
begin
  v_type := case new.type
              when 'sos.raised' then 'sos'
              when 'incident.reported' then new.payload ->> 'incident_type'
              when 'incident.logged' then new.payload ->> 'incident_type' end;
  v_sev := case when new.type in ('incident.reported', 'incident.logged') then new.payload ->> 'severity' end;
  -- severity 5 is the injury level (F11 web sheet): never sealed whatever the type
  if ((v_type is not null and private.incident_type_never_sealed(v_type)) or v_sev = '5')
     and coalesce((new.payload ->> 'non_punitive')::boolean, false) then
    raise exception 'validation' using errcode = 'P0001',
      hint = 'An injury (first_aid), an SOS or any severity 5 report is never sealed: p_non_punitive must be false. Near-miss sealing covers near_miss only, so the supervisor always sees a harm report.';
  end if;
  return new;
end $f$;
drop trigger if exists events_refuse_sealed_harm on public.events;
create trigger events_refuse_sealed_harm before insert on public.events
  for each row execute function private.events_refuse_sealed_harm();

alter table public.incidents drop constraint if exists incidents_harm_never_sealed;
alter table public.incidents add constraint incidents_harm_never_sealed
  check (not (non_punitive and (incident_type::text in ('first_aid', 'sos') or severity = 5))) not valid;

-- ── 2. lesson seeds ─────────────────────────────────────────────────────────────────────────────────
insert into public.lessons (code, content, topic_event_types, version) values
  ('seatbelt_slopes', $j${"code":"seatbelt_slopes","title":{"en":"Seatbelt on slopes","hi":"ढलान पर सीटबेल्ट"},"duration_s":90,"cards":[{"id":"k1","kind":"rule","title":{"en":"The rule","hi":"नियम"},"body":{"en":"Fasten before moving.","hi":"चलने से पहले लगाएँ।"},"pictogram":"belt","image_path":null,"audio_id":null},{"id":"k2","kind":"why","title":{"en":"Why","hi":"क्यों"},"body":{"en":"On a slope a machine can roll over. Without a belt you are thrown out.","hi":"ढलान पर मशीन पलट सकती है। बिना बेल्ट आप बाहर गिर जाते हैं।"},"pictogram":"rollover","image_path":null,"audio_id":null},{"id":"k3","kind":"example","title":{"en":"With and without","hi":"बेल्ट के साथ और बिना"},"body":{"en":"Same slope, same rollover. Only the belt is different.","hi":"वही ढलान, वही पलटना। फ़र्क़ सिर्फ़ बेल्ट का है।"},"pictogram":"belt_compare","image_path":null,"audio_id":null},{"id":"k4","kind":"check","title":{"en":"Check","hi":"जाँच"},"body":{"en":"Click, tug, go.","hi":"क्लिक, खींचो, चलो।"},"pictogram":"check","image_path":null,"audio_id":null}],"quiz":[{"id":"q1","prompt":{"en":"The machine is on a slope and your seatbelt is off. What do you do?","hi":"मशीन ढलान पर है और आपकी सीटबेल्ट खुली है। आप क्या करेंगे?"},"choices":[{"id":"a","label":{"en":"Stop and fasten the belt","hi":"रुकें और सीटबेल्ट लगाएँ"},"pictogram":"belt"},{"id":"b","label":{"en":"Keep going to flat ground","hi":"समतल जगह तक चलते रहें"},"pictogram":"info"}],"correct_id":"a","why":{"en":"On a slope the machine can tip. The belt keeps you in the seat, so fasten it first.","hi":"ढलान पर मशीन पलट सकती है। सीटबेल्ट आपको सीट पर रखती है, इसलिए पहले उसे लगाएँ।"}},{"id":"q2","prompt":{"en":"When do you fasten the seatbelt?","hi":"सीटबेल्ट कब लगानी है?"},"choices":[{"id":"a","label":{"en":"When I reach the slope","hi":"जब ढलान पर पहुँचूँ"},"pictogram":"info"},{"id":"b","label":{"en":"Before the machine moves","hi":"मशीन चलने से पहले"},"pictogram":"belt"}],"correct_id":"b","why":{"en":"The belt goes on before the first move. You may not get time to do it on the slope.","hi":"पहली हरकत से पहले बेल्ट लगती है। ढलान पर इसका समय नहीं मिलता।"}},{"id":"q3","prompt":{"en":"Your seatbelt will not click. What now?","hi":"आपकी सीटबेल्ट नहीं लग रही। अब क्या करें?"},"choices":[{"id":"a","label":{"en":"Work carefully without it","hi":"सावधानी से बिना बेल्ट के काम करें"},"pictogram":"info"},{"id":"b","label":{"en":"Stop and tell my supervisor","hi":"रुकें और सुपरवाइज़र को बताएँ"},"pictogram":"sos"}],"correct_id":"b","why":{"en":"A belt that will not click is a fault. Do not use the machine until it is fixed.","hi":"जो बेल्ट नहीं लगती वह ख़राबी है। ठीक होने तक मशीन न चलाएँ।"}}],"video_path":null,"source_refs":[]}$j$::jsonb, array['safety.seatbelt_breach'], 1)
on conflict (code) do update set content = excluded.content, topic_event_types = excluded.topic_event_types;

insert into public.lessons (code, content, topic_event_types, version) values
  ('faulty_machine_nearby', $j${"code":"faulty_machine_nearby","title":{"en":"Stay out of the swing","hi":"घूमने के घेरे से बाहर रहें"},"duration_s":90,"cards":[{"id":"k1","kind":"rule","title":{"en":"The rule","hi":"नियम"},"body":{"en":"Stay out of a machine's swing ring. If the operator cannot see you, you are not safe.","hi":"मशीन के घूमने के घेरे से बाहर रहें। ऑपरेटर को आप न दिखें तो आप सुरक्षित नहीं हैं।"},"pictogram":"blindspot","image_path":null,"audio_id":null},{"id":"k2","kind":"how","title":{"en":"Step away","hi":"दूर हटें"},"body":{"en":"Move out of the ring, make yourself seen, and tell your supervisor.","hi":"घेरे से बाहर जाएँ, खुद को दिखाएँ और सुपरवाइज़र को बताएँ।"},"pictogram":"proximity","image_path":null,"audio_id":null},{"id":"k3","kind":"check","title":{"en":"Check","hi":"जाँच"},"body":{"en":"Before you walk near a machine, look for its ring.","hi":"मशीन के पास चलने से पहले उसका घेरा देखें।"},"pictogram":"check","image_path":null,"audio_id":null}],"quiz":[{"id":"q1","prompt":{"en":"A machine nearby is swinging. Where do you stand?","hi":"पास की मशीन घूम रही है। आप कहाँ खड़े हों?"},"choices":[{"id":"out","label":{"en":"Outside the ring","hi":"घेरे के बाहर"},"pictogram":"proximity"},{"id":"in","label":{"en":"Near the cab","hi":"केबिन के पास"},"pictogram":"info"}],"correct_id":"out","why":{"en":"The back and the arm sweep the whole ring. Outside it you are out of harm.","hi":"पिछला हिस्सा और बाजू पूरे घेरे में घूमते हैं। बाहर आप सुरक्षित हैं।"}},{"id":"q2","prompt":{"en":"Can the operator see you behind the machine?","hi":"क्या ऑपरेटर आपको मशीन के पीछे देख सकता है?"},"choices":[{"id":"yes","label":{"en":"Yes, always","hi":"हाँ, हमेशा"},"pictogram":"info"},{"id":"no","label":{"en":"Not in a blind spot","hi":"अंधे क्षेत्र में नहीं"},"pictogram":"proximity"}],"correct_id":"no","why":{"en":"Behind and beside the cab are blind spots. Do not count on being seen.","hi":"केबिन के पीछे और बगल में अंधे क्षेत्र होते हैं। दिखने पर भरोसा न करें।"}},{"id":"q3","prompt":{"en":"Who do you tell about a machine with a fault?","hi":"ख़राब मशीन के बारे में किसे बताएँ?"},"choices":[{"id":"sup","label":{"en":"My supervisor","hi":"सुपरवाइज़र को"},"pictogram":"sos"},{"id":"none","label":{"en":"No one","hi":"किसी को नहीं"},"pictogram":"info"}],"correct_id":"sup","why":{"en":"They can stop and tag the machine.","hi":"वे मशीन रोककर टैग कर सकते हैं।"}}],"video_path":null,"source_refs":[]}$j$::jsonb, array['safety.proximity'], 1)
on conflict (code) do update set content = excluded.content, topic_event_types = excluded.topic_event_types;
