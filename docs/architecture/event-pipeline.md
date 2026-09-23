# Event pipeline: the six demo flows, the alert budget, idempotency and failure modes

Status: Proposed with ADR-001. Tables and functions are defined in `data-model.md`; payload schemas in
`api-contracts.md`. Markers: **[V]** verified today, **[R]** research 10-15, **[A]** assumption,
**[U]** unverified.

## 0. The spine

```
pg_cron '1 seconds' ─► private.heartbeat()            (pg_try_advisory_xact_lock: never overlaps)
                         ├─ scenario_tick(current run): sim_now = sim_anchor + (now()-wall_anchor)*speed
                         │    for each frame with sim_offset ≤ sim_now and seq > cursor (in seq order):
                         │      apply_frame → telemetry_readings / operator_state / gps / weather / faults
                         │                  → machine_state upsert
                         │                  → detectors (rules, EWMA, Guardian)  → emit_event → raise_alert
                         │    cursor_seq := last applied; realtime.send('clock', site:{id})
                         ├─ escalations_due()   (wall clock, compare-and-set)
                         └─ requeue_stuck_dispatches()
events (after insert) ─► realtime.send(...) to op:{operator} / site:{site} / sup:{site}   (private topics)
dispatches (after insert, status='queued') ─► net.http_post → Edge Function `dispatch` → Telegram / Twilio
Telegram / Twilio webhooks ─► Edge Functions `telegram-webhook`, `twilio-voice` → private.alert_ack / emit_event
```

Rules that hold in every flow:
- **Simulated time** drives frames and detectors; **wall-clock time** drives acknowledgement timeouts
  and escalations, so a 60 s SOS is 60 real seconds at any scenario speed.
- Detectors never read `scenario_frames` ahead of `cursor_seq` and never read `private.injected_labels`.
- Every insert carries an idempotency key; every state change on `alerts` and `dispatches` is a
  compare-and-set (`update … where status = <expected> returning`).
- When a run has `dry_run_external = true`, `dispatch` records `dry_run` instead of calling providers
  (rehearsals do not burn Twilio trial credit).
- Catch-up after "jump to time": frames are applied, detectors run, but alerts created with
  `sim_ts` older than 30 s of sim time are recorded as `suppressed` (reason `catch_up`) so a jump
  does not fire a burst of calls.

## 1. Seatbelt breach (demo step 2)

```mermaid
sequenceDiagram
  participant C as pg_cron heartbeat
  participant DB as Postgres (tick + detectors)
  participant RT as Realtime
  participant OP as Ravi (cockpit, motion-locked)
  participant FM as Anita (console)
  participant D as dispatch fn
  participant TG as Telegram
  C->>DB: scenario_tick
  DB->>DB: apply frame #1812 {seatbelt:false, speed:6.2, pitch:17.4}
  DB->>DB: rule seatbelt_off_moving (belt false AND moving) → tier warning, critical if pitch/roll > zone max_slope
  DB->>DB: emit safety.seatbelt_breach (det:{run}:EXC-007:seatbelt_off_moving:1812)
  DB->>DB: ledger_append(seatbelt_breach, context snapshot)
  DB->>DB: raise_alert(seatbelt_off_moving) → open, needs_ack, escalate_at = now()+20s
  DB-->>RT: alert.raised → op:{ravi}, sup:{site}
  RT-->>OP: full-screen WARNING, vibration pattern, pre-generated Hindi clip (no touch needed)
  RT-->>FM: inbox row + ledger row
  alt belt fastened (frame #1830 seatbelt:true) or big-button ack
    DB->>DB: alert resolved (ack_via sensor/app); emit safety.seatbelt_resolved
  else no ack in 20 s (wall)
    C->>DB: escalations_due: CAS open→escalated
    DB->>D: dispatch(telegram, supervisor)   [no operator call: machine is moving]
    D->>TG: sendMessage "EXC-007 Ravi: seatbelt off on 17° slope, not acknowledged"
  end
  DB->>DB: Loop: lesson_assign(seatbelt_slopes, because=event) + replay_scenarios row
```
Acceptance: one breach produces exactly one event, one alert, one ledger entry, and appears on the
cockpit, inbox, ledger, map and Loop within 2 s of the frame's release [A target].

## 2. Guardian: anomalous machine near the operator, with motion lock (demo step 3)

```mermaid
sequenceDiagram
  participant DB as Postgres (tick + detectors)
  participant RT as Realtime
  participant OP as Ravi (on foot)
  participant D as dispatch fn
  participant TW as Twilio
  participant TG as Telegram
  DB->>DB: frames: EXC-014 hydraulic_temp_c 71 → 74 → 79 → 86 (drift injected by generator)
  DB->>DB: EWMA(λ=0.2) > UCL(3σ) for 2 consecutive samples → anomaly hydraulic_temp_drift
  DB->>DB: machine_state.health = fault; emit anomaly.detected (visibility site)
  DB->>DB: Guardian: ST_DWithin(ravi.location, EXC-014.location, 50 m) → 38 m
  DB->>DB: emit guardian.hazard_near_operator {distance_m:38, protocol:hydraulic_fault, wind_from_deg}
  DB->>DB: raise_alert(guardian_hazard, warning, escalate_at = now()+15s); critical if < 15 m
  DB-->>RT: map lights EXC-014; Warning card with the fixed protocol card (hi/en)
  Note over DB: at critical OR ack timeout → escalations_due
  DB->>DB: can_call_operator(ravi)? on_foot = true → yes
  DB->>D: dispatch(twilio_voice, operator) + dispatch(telegram, supervisor)
  D->>DB: re-check can_call_operator just before calling (state may have changed)
  D->>TW: POST Calls.json {To: secret DEMO_OPERATOR_PHONE, Twiml: Say hi-IN + Gather, StatusCallback, Timeout 25}
  TW-->>OP: phone rings (trial preamble first [R]), Hindi protocol, "press 1 to confirm"
  D->>TG: sendMessage to fleet manager + sendLocation
  OP->>TW: presses 1
  TW->>DB: twilio-voice (signature verified) → alert_ack(via twilio_keypress) → alert.acknowledged
```
**Motion-lock rule** (`private.can_call_operator(run_id, operator_id) → (allowed boolean, reason text)`):
- `on_foot = true` → allowed.
- In a cab (`in_cab_machine_id` not null) and that machine is parked (speed ≤ 0.5 km/h **and**
  parking brake engaged) → allowed.
- In a cab and the machine is moving → **not allowed** (`motion_lock`): the dispatch row is inserted as
  `suppressed` and `dispatch.suppressed {reason:'motion_lock'}` is emitted; the cockpit shows the
  full-screen alert with TTS instead. The supervisor Telegram message is never blocked.
- A call to the same person in the last 60 s → not allowed (`call_cooldown`).
The rule is evaluated when the dispatch is created **and** again inside `dispatch` right before
`calls.create`.

## 3. SOS with 60 s escalation

```mermaid
sequenceDiagram
  participant OP as Ravi
  participant DB as Postgres
  participant D as dispatch fn
  participant TG as Telegram (Anita)
  participant W as telegram-webhook fn
  participant C as pg_cron heartbeat
  participant TW as Twilio
  OP->>DB: hold 1.5 s → rpc sos_raise(request_id, lat, lon)
  DB->>DB: one txn: emit sos.raised (rpc:sos_raise:{rid}) + ledger_append(sos) + raise_alert(sos, critical, escalate_at = now()+60s)
  DB->>D: dispatch(telegram, supervisor)
  D->>TG: sendMessage + inline [Acknowledge] callback_data "ack:{alert_id}" (40 bytes ≤ 64 [R]) + sendLocation
  alt Anita taps Acknowledge within 60 s
    TG->>W: callback_query (X-Telegram-Bot-Api-Secret-Token checked)
    W->>DB: insert telegram_updates(update_id) on conflict → duplicate = 200 no-op
    W->>DB: alert_ack(alert_id, via telegram): CAS open→acknowledged
    W->>TG: answerCallbackQuery + editMessageText "Acknowledged by Anita 14:03:12"
  else no ack by escalate_at
    C->>DB: escalations_due: update alerts set status='escalating' where status='open' and escalate_at<=now() returning
    DB->>D: dispatch(twilio_voice, supervisor)
    D->>TW: call DEMO_SUPERVISOR_PHONE: "SOS from Ravi, EXC-007, Nagpur quarry, press 1"
    D->>DB: status escalated; emit alert.escalated
  end
```
Race: the ack and the escalation both use compare-and-set on `alerts.status`; exactly one wins. An ack
that arrives after escalation is still recorded (`escalated → acknowledged`) and stops further retries.
Timer precision: the heartbeat runs every second, so the call is placed 60-61 s after the SOS [A: pg_cron
1 s jitter to be measured in B12]. `sos_cancel` within 10 s (operator) resolves the alert and edits the
Telegram message. SOS is never deduplicated, suppressed or rate-capped; repeated SOS (> 3 per 10 min)
is flagged `abuse_suspected` for review, still delivered.

## 4. PPE warning and logged supervisor override (demo step 1)

```mermaid
sequenceDiagram
  participant OP as Ravi
  participant DB as Postgres
  participant FM as Anita
  OP->>DB: rpc task_start(task_id, request_id, eta?)
  DB->>DB: required PPE for task_type vs operator_state.ppe → vest missing
  DB->>DB: task.status = blocked_ppe; emit ppe.missing (caution) + task.start_blocked
  DB-->>OP: {status:'blocked', missing:['vest']} → Hindi prompt "पहले जैकेट पहनें"
  alt demo path: vest tag appears (frame ppe.vest=true)
    DB->>DB: emit ppe.restored
    OP->>DB: task_start again → started, ETA stored
  else override path
    OP->>FM: "Request override" (event ppe.missing is already in the inbox)
    FM->>DB: rpc ppe_override(task_id, reason ≥ 10 chars, request_id)  [role = fleet_manager]
    DB->>DB: ledger_append(ppe_override {who, why, when, missing}) → tasks.ppe_override_incident_id
    DB->>DB: emit ppe.override_granted
    OP->>DB: task_start → valid override (same task, ≤ 15 min old) → started
  end
```

## 5. Ledger tamper and verify (demo step 5)

1. Anita (or the director) runs **Publish checkpoint** → `ledger_publish_root('checkpoint')` → a
   Telegram dispatch "root 9f2c…, #1-#214, head a71b…" → `ledger_roots.telegram_message_id` stored.
2. **Verify** → `ledger_verify()` → ✓ 214 entries.
3. Tamper, level 1: in the Supabase SQL editor as the database owner, disable the mutation trigger,
   edit one description, re-enable. (Backup: `director` → `private.demo_tamper(seq, 'edit')`.)
4. **Verify** → ✗ "chain breaks at #187 (hash_mismatch)"; `ledger.tamper_detected` is emitted and a
   Telegram alert is queued.
5. Tamper, level 2 (`demo_tamper(seq, 'rehash')`: edit and recompute every later hash) → Verify ✓, but
   **root check** ✗: the recomputed root no longer equals the root in the Telegram message sent in
   step 1. The external witness is what proves it.

## 6. Ask Spotter with a photo

```mermaid
sequenceDiagram
  participant OP as Ravi
  participant ST as Storage (ask-photos)
  participant A as ask fn (user JWT, verify_jwt on)
  participant V as Vision (Groq qwen3.8-27b → Gemini)
  participant G as Groq gpt-oss (20b rewrite, 120b answer)
  participant VY as Voyage
  participant PC as Pinecone (us-east-1)
  OP->>ST: upload ask-photos/{uid}/{uuid}.jpg (owner-only policy, ≤ 4 MB)
  OP->>A: invoke ask {request_id, question:"यह रिसाव क्या है?", lang:'hi', photo_path}
  A->>A: role from profiles; rate cap 6 asks/min/user; path prefix must equal uid
  A->>V: signed URL (60 s) → structured observations; any text inside the image is data, never instructions
  A->>G: rewrite → English query + intent + safety_critical flag (gpt-oss-20b)
  A->>VY: voyage-multimodal-3.5 query embedding (text + image), 1024 dims
  A->>PC: sparse vector via pinecone-sparse-english-v0 (English query) + hybrid query top_k 20, filter audience ∋ role
  A->>VY: rerank-2.5-lite → top 5
  A->>A: read-only live tools (next task, machine status, active alerts, ETA) → ids live:*
  A->>G: gpt-oss-120b, strict JSON schema AskAnswer (non-streamed [R])
  A->>A: gate: cited_ids ⊆ retrieved ∪ live, non-empty; safety_critical ⇒ rule + citation + handover
  A-->>OP: 3 short steps + citations (+ proposed_action: log_incident draft, needs a tap to confirm)
  OP->>A: (confirm) rpc incident_log(...)  ← the model never writes by itself
```
Budgets: prompt ≤ 3,500 tokens (system 500, 5 chunks × 350, live 300, question + vision 300, history
400), output ≤ 400. Groq free is 8,000 TPM per model per organisation [R], so ~2 asks/min on 120b;
the 3rd goes to 20b (separate per-model pool [R]) and then to Gemini. Latency target p95 ≤ 8 s [A].
Hindi questions: the sparse model is English-only [V], so sparse retrieval uses the English rewrite;
dense retrieval uses the original + image (Voyage multimodal is multilingual [U: multilingual
quality for Hindi not benchmarked by us]).

## 7. Alert budget (EEMUA 191 / ISA-18.2 informed)

| Mechanism | Rule | Where |
|---|---|---|
| Dedupe | One active alert per `dedupe_key = kind:operator:machine` (partial unique index). A repeat inside the policy window increments `occurrences`/`last_seen`; no new `alert.raised`, no new dispatch; UI shows "×3" | `private.raise_alert` |
| Suppress lower tiers | If the operator has an active alert of a higher tier, a new lower-tier alert is stored as `suppressed` (`suppressed_by` set), visible to FM, silent to the operator. Re-evaluated when the higher alert resolves | `private.raise_alert` |
| Rate cap | Interrupting alerts (caution, warning) per operator ≤ `rate_cap_per_10min` (default 6; ISA-18.2 flood = 10 per 10 min [R]); excess → `suppressed (rate_cap)` + one summary to FM. Critical and SOS exempt | `private.raise_alert` |
| Info never interrupts | Info = on-screen only, no sound, no dispatch | policy |
| External caps | Telegram ≤ 1 message per alert per escalation level (edits allowed); Telegram ≤ 1 msg/s per chat [R]. Twilio ≤ 1 active call per recipient, 60 s cooldown, ≤ 3 calls per alert | `dispatch` + `can_call_operator` |
| Motion lock | No operator phone call while the machine moves | `can_call_operator` |
| Catch-up | Alerts from frames > 30 s behind sim_now during a jump are `suppressed (catch_up)` | `scenario_tick` |

Seed for `alert_policies` [A: tunable]:
| kind | tier | dedupe s | ack timeout s | escalate to | cap/10 min |
|---|---|---|---|---|---|
| seatbelt_off_moving | warning (critical on slope) | 120 | 20 | supervisor_telegram | 6 |
| guardian_hazard | warning (critical < 15 m) | 60 | 15 | operator_call + supervisor_telegram | exempt at critical |
| proximity_zone | caution/warning | 30 | 20 | supervisor_telegram | 6 |
| ppe_missing | caution | 300 | — | — | 6 |
| anomaly_machine | caution | 600 | — | — | 6 |
| idle_excess | info | 1800 | — | — | — |
| sos | critical | never | 60 | supervisor_telegram now, supervisor_call at 60 s | exempt |

## 8. Idempotency, boundary by boundary

| Boundary | Duplicate source | Guard |
|---|---|---|
| Frame apply | heartbeat retry, overlapping tick | advisory try-lock; `unique (run_id, frame_seq)` on telemetry; `cursor_seq` CAS |
| Detector events | re-applied frame | `det:` idempotency key, `on conflict do nothing` |
| Client RPCs | double tap, network retry | `request_id` → `rpc:` key; RPC returns the original result |
| Ledger | retried append | `incidents.idempotency_key unique`; append returns the existing row |
| Dispatch trigger → Edge Function | pg_net retry, requeue | CAS `queued → sending` inside `dispatch`; unique (alert, purpose, channel, role, attempt) |
| Twilio call | function retried after the call was created | `provider_ref` (CallSid) written before returning; retry sees it and stops |
| Telegram webhook | Telegram retries non-2xx [V] | `telegram_updates.update_id` primary key; always answer 200 fast |
| Twilio webhooks | Twilio retries | `tw:{CallSid}:{CallStatus}` key; `alert_ack` is a CAS |
| Escalation | two heartbeats | CAS on `alerts.status` |
| Director commands | double click | `dir:{request_id}` |

## 9. External calls: failure modes and fallbacks

| Call | Failure mode | Detection | Fallback |
|---|---|---|---|
| Telegram `sendMessage` / `sendLocation` | 429 (`retry_after`), 403 (supervisor never pressed Start), network | HTTP status | honour `retry_after` once; mark `failed`; the in-app FM inbox always has the alert; pre-demo checklist sends a test message |
| Telegram webhook | not set, wrong secret, Edge Function cold | `getWebhookInfo` in the pre-demo script | FM acknowledges in the console (same `alert_ack`) |
| Twilio `calls.create` | error 32100 (trial account calling an unverified number [R]), India geo permission off, credit exhausted | HTTP 4xx + code | Telegram message still sent; UI shows "call failed: reason"; backup video for the call step (spec §7) |
| Twilio call not answered | `no-answer`/`busy` via StatusCallback | status webhook | retry once after 60 s cooldown; then Telegram only |
| TwiML from Edge Function | XML rewritten or wrong content type [U] | B14 live test | inline `Twiml` parameter (no fetch needed for the first prompt) [V]; only the Gather `action` needs our URL |
| Groq chat | 429 TPM/RPM, 5xx, Preview model removed | status, `retry-after` [R] | 120b → 20b → Gemini Flash → deterministic refusal + top chunk titles |
| Groq vision | Preview model unavailable | 4xx/5xx | Gemini Flash; then icon-grid "what do you see?" |
| Voyage embed / rerank | 429/5xx, network | status | embed failure → sparse-only retrieval; rerank failure → Pinecone score order |
| Pinecone query / sparse inference | 429 (monthly quota [V]), 5xx | status | cached answers for the 20 eval questions; refusal with "ask your supervisor" |
| Open-Meteo archive | used only by the offline generator | — | generator falls back to seeded synthetic weather |
| Realtime | socket drop, JWT expiry | client status callback | connectivity chip; on rejoin, Broadcast replay (≤ 25 msgs, supabase-js ≥ 2.74 [V]) plus `my_snapshot` RPC refetch |
| pg_net | response tables are unlogged and lost on crash [V] | dispatch stuck in `queued`/`sending` | heartbeat re-queues after 20 s (max 2 attempts) |
| pg_cron | job stops (DB restart, bad schedule) | `cron.job_run_details` age check in the pre-demo script | director "manual tick" button calls `scenario_tick` directly |
| Storage upload | too large, wrong type | policy rejects | client compresses to ≤ 1,600 px before upload |
