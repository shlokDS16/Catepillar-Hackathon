# Event pipeline: the six demo flows, alert budget, idempotency, failure modes, STRIDE

Status: Proposed with ADR-001, **revision 3** (reconciliation after the G2 re-check: `G2-n` backend
review, `PA-n` program review, `N1-N5` re-check findings, `UI-n` UI contract gaps, D8/D9 decisions). Tables and functions: `data-model.md`. Payloads: `api-contracts.md`.
Markers: **[V]** verified, **[R]** research 10-15, **[A]** assumption, **[U]** unverified.

## 0. The spine: two pg_cron jobs (G2-1, N2, N4, N5)

```
pg_cron 'sos-escalator' 1 s ─► call private.escalate_step()      own connection and transaction; no advisory lock;
                                 due alerts FOR UPDATE SKIP LOCKED → CAS → escalation dispatches
pg_cron 'worker'        1 s ─► call private.worker_step()        a procedure that COMMITs between steps:
      step 1 ledger drain   ≤ 50 queue rows under lock 4210001 → incidents → incident.logged      COMMIT
      step 2 Loop queue     ≤ 20 items: lesson assignment, build_replay                          COMMIT
      step 3 scenario tick  try-lock 4210002 or skip; ≤ 200 due frames; per frame:
                              begin … exception → tick_errors (frame skipped, tick continues)
                              apply_frame → telemetry / operator_state (motion_locked, nearest) / gps /
                              weather / faults → machine_state → pure detectors → apply_findings
                              (anomalies, emit_event, raise_alert); cursor; tick_log; 'clock' + delta 'machines'  COMMIT
      step 4 (every 5th s)  dispatch requeue, housekeeping                                       COMMIT
      each step sits in its own exception block, so one failing step cannot stop the next
events (after insert) ─► realtime.send, one topic per audience (op:/site:/sup:/train:)
                      ─► if ledger = true: ledger_enqueue(key 'ledger:' || idempotency_key)   (single write path, N3)
                      ─► if lesson/replay: insert into private.loop_queue                     (no other work, N2)
dispatches (after insert or update of status to 'queued') ─► net.http_post(timeout 20 s) → `dispatch`
Telegram / Twilio  ─► `telegram-webhook`, `twilio-voice` → private.telegram_callback / private.alert_ack
```
The SOS path (`sos_raise` → `sos-escalator` → `dispatch`) shares no lock and no job with the worker, so a
slow or failing tick, Loop build or ledger drain cannot delay it. Bounded work per step is the guarantee;
per-role statement timeouts are the backstop (data-model §6).

Rules that hold in every flow:
- **Sim time** drives frames and detectors. **Wall time** drives ack timeouts, escalations, dedupe
  windows and rate caps (G2-8c), so a 60 s SOS is 60 real seconds at any speed.
- Detectors never read frames ahead of `cursor_seq` and never read `private.injected_labels`.
- Every insert has an idempotency key; every state change on `alerts` and `dispatches` is a
  compare-and-set.
- `dry_run_external` runs record `dry_run` instead of calling providers.
- **Catch-up (G2-5)** applies only when (a) the frame's `seq ≤ catchup_until_seq` (set by `jump_to`),
  or (b) the frame is older than `sim_now − speed × 5 s` of sim time, i.e. the tick is more than 5
  **wall** seconds behind at the current speed (a pg_cron stall). At 60× that threshold is 300 s of sim
  time, so a normal 1 s tick (60 s of sim) never triggers it. Catch-up alerts are stored as
  `suppressed (catch_up)`, with no dispatch; state and anomalies are still applied.

## 1. Seatbelt breach (demo step 2)

```mermaid
sequenceDiagram
  participant T as worker (tick step)
  participant DB as Postgres
  participant RT as Realtime
  participant OP as Ravi (cockpit, motion-locked)
  participant FM as Anita (console)
  participant E as sos-escalator
  participant D as dispatch fn
  participant TG as Telegram
  T->>DB: apply frame #1812 {seatbelt:false, speed:6.2, pitch:17.4}
  DB->>DB: detect_rules → seatbelt_off_moving, tier critical (pitch 17.4 > zone max 15)
  DB->>DB: emit safety.seatbelt_breach (det:{run}:EXC-007:seatbelt_off_moving:1812)
  Note over DB: event trigger enqueues the ledger entry (ledger:det:…) and a loop_queue row
  DB->>DB: raise_alert(hazard_key seatbelt:ravi:EXC-007) → open, escalate_at = now()+20 s
  DB-->>RT: op:{ravi}, sup:{site}
  RT-->>OP: full-screen, vibration, pre-generated Hindi clip (no touch needed)
  RT-->>FM: inbox row; ledger row 1-3 s later (worker step 1)
  alt belt fastened (frame seatbelt:true) or big-button ack
    DB->>DB: alert resolved (ack_via sensor/app), safety.seatbelt_resolved
  else no ack in 20 s wall
    E->>DB: CAS open→escalating, dispatch(telegram, supervisor, level 1)
    D->>TG: "EXC-007 Ravi: seatbelt off on 17° slope, not acknowledged"  (no operator call: moving)
  end
  Note over DB: worker step 2 (after commit): lesson seatbelt_slopes + build_replay (P0 replay type) → training.replay_ready
```
Acceptance: one breach → exactly one event, one alert, one ledger entry, one lesson assignment and one
replay. Event and alert visible within 2 s of release; ledger entry within 3 s; Loop card within 3 s [A].

## 2. Guardian: anomalous machine near the operator, with motion lock (demo step 3)

```mermaid
sequenceDiagram
  participant T as worker (tick step)
  participant DB as Postgres
  participant RT as Realtime
  participant OP as Ravi (on foot)
  participant E as sos-escalator
  participant D as dispatch fn
  participant TW as Twilio
  participant TG as Telegram
  T->>DB: frames: EXC-014 hydraulic_temp_c 71 → 74 → 79 → 86 (drift injected by the generator)
  DB->>DB: detect_ewma: > UCL (3σ) twice → anomaly hydraulic_temp_drift (with location)
  DB->>DB: Guardian: ST_DWithin(ravi, EXC-014, 50 m) → 38 m → guardian.hazard_near_operator
  DB->>DB: raise_alert(hazard_key guardian:ravi:EXC-014, warning, escalate_at = now()+15 s)
  Note over DB: loop_queue row → worker step 2 assigns the faulty_machine_nearby lesson (no replay in P0)
  DB-->>RT: map lights EXC-014; Warning card with the fixed protocol card
  T->>DB: later frame: distance 12 m (< 15 m) → same hazard_key, tier upgrade warning→critical (G2-8a)
  DB->>DB: alert tier := critical, tier_history += upgrade, emit alert.raised {upgraded_from:'warning'}
  DB->>DB: critical ⇒ dispatch now: can_call_operator(ravi) = allowed (on foot, state fresh)
  DB->>D: dispatch(twilio_voice, operator, level 1) + dispatch(telegram, supervisor, level 1)
  D->>DB: re-check can_call_operator + alert still open/escalating
  D->>TW: POST Calls.json {To: secret, Twiml: Say hi-IN + Gather(action = PUBLIC_URL/twilio-voice?d=…), StatusCallback, Timeout 25}
  TW-->>OP: phone rings (trial preamble first [R]), Hindi protocol, "press 1"
  D->>TG: sendMessage + sendLocation to the fleet manager
  OP->>TW: presses 1
  TW->>DB: twilio-voice: signature over PUBLIC_URL (G2-7) → private.alert_ack(via twilio_keypress)
```
If Ravi does not reach 15 m, the warning escalates at its 15 s ack timeout with the same dispatches.

**Motion-lock rule** `private.can_call_operator(run_id, operator_id) → (allowed, reason)` (G2-17):
| operator_state | Result |
|---|---|
| missing, or `ts` older than `state_stale_s` (10 s wall) | **deny** (`state_unknown`) |
| `on_foot = true` | allow |
| in a cab, that machine parked (speed ≤ 0.5 km/h **and** parking brake on) | allow |
| in a cab, machine moving | **deny** (`motion_lock`) |
| `on_foot` null/false and no cab | **deny** (`state_unknown`) |
| a call to this person in the last 60 s | deny (`call_cooldown`) |
Default is **deny** (fail-safe: never ring a phone that might be in a moving cab). The same function
writes `operator_state.motion_locked` and `call_allowed` on every frame, so the cockpit's glance mode and
the dispatcher always agree (UI-5). A denied operator call
is stored as `dispatch suppressed(reason)`; the cockpit shows the full-screen TTS alert; the supervisor's
Telegram is never blocked. Evaluated when the dispatch is created and again inside `dispatch`.

## 3. SOS with 60 s escalation (independent of ticks and the ledger; G2-1, G2-3)

```mermaid
sequenceDiagram
  participant OP as Ravi
  participant DB as Postgres
  participant D as dispatch fn
  participant TG as Telegram (Anita)
  participant W as telegram-webhook
  participant E as sos-escalator
  participant TW as Twilio
  OP->>DB: hold 1.5 s → rpc sos_raise(request_id, lat?, lon?)   [lat/lon may be null → machine, then site centre; UI-14]
  DB->>DB: one short txn: new alert kind sos (never deduplicated) + emit sos.raised (its trigger enqueues the ledger entry)
  DB->>D: dispatch(telegram, supervisor, level 0)
  D->>TG: sendMessage + inline [Acknowledge] callback_data "ack:{alert_id}" + sendLocation
  alt Anita taps Acknowledge within 60 s
    TG->>W: callback_query; constant-time secret-header check
    W->>DB: private.telegram_callback(update_id, chat_id, alert_id)  (dedupe + chat binding + ack in ONE txn; G2-11)
    W->>TG: answerCallbackQuery + editMessageText "Acknowledged by Anita 14:03:12"
  else no ack by escalate_at
    E->>DB: select … for update skip locked; CAS open→escalating; dispatch(twilio_voice, supervisor, level 1)
    D->>DB: re-check alert status = escalating (G2-10); if acknowledged → suppressed(acknowledged)
    D->>TW: call DEMO_SUPERVISOR_PHONE "SOS from Ravi, EXC-007, Nagpur quarry, press 1"
    D->>DB: status escalated, alert.escalated
  end
```
- `sos-escalator` is its own pg_cron job, connection and transaction; it reads only `alerts` and writes
  `alerts`, `dispatches`, `events`. A failing or slow tick cannot delay it, and it never waits on the ledger lock.
- `sos_raise` takes no advisory lock: the ledger entry is enqueued by the event trigger and written by
  worker step 1.
- Each SOS is its own alert (the dedupe index excludes `kind = 'sos'`), with its own Telegram message.
- Abuse control (PA-7): hold-to-arm, audit trail, `sos_cancel` within 10 s, and more than 3 SOS per
  operator in 10 min sets `abuse_suspected` on the alert (still delivered). The spec's "rate limit"
  wording should read "abuse control": an SOS is never dropped (proposed spec edit for the orchestrator).
- Timing: the call goes out 60-61 s after the SOS [A: measured in B12].

## 4. PPE warning and logged supervisor override (demo step 1)

```mermaid
sequenceDiagram
  participant OP as Ravi
  participant DB as Postgres
  participant FM as Anita
  OP->>DB: rpc task_start(task_id, request_id, eta, eta_factors)
  DB->>DB: required PPE for task_type vs operator_state.ppe → vest missing
  DB->>DB: task.status = blocked_ppe; emit ppe.missing (caution) + task.start_blocked
  DB-->>OP: {status:'blocked', missing:['vest']}
  alt demo path: vest tag appears (frame ppe.vest = true)
    DB->>DB: emit ppe.restored
    OP->>DB: task_start → started; cycles_at_start stored; progress now follows load cycles
  else override path
    FM->>DB: rpc ppe_override(task_id, reason ≥ 10 chars, request_id)  [fleet_manager]
    DB->>DB: ppe_overrides row + emit ppe.override_granted {who, why, when, missing} (ledger via the event)
    OP->>DB: task_start → valid override (same task, ≤ 15 min) → started
  end
```
Specified for the UI (UI-12): `task_start` is also the **resume** call (valid from `planned`, `paused`
and `blocked_ppe`; it re-checks PPE every time). An expired override returns `blocked` with
`override_expired` and emits `ppe.missing` again, which re-appears in Anita's inbox; there is no separate
re-notification.

## 5. Ledger tamper and verify (demo step 5; G2-4, N1, #4)

Claim on stage: **"tamper-evident, human-verifiable" (the checkpoint is externally witnessed in Telegram)**, and nothing stronger.
1. **Publish checkpoint** (director) → Anita's Telegram shows
   `SPOTTER-LEDGER v1 seq=1..214 n=214 root=<64 hex> head=<64 hex> at=14:02 IST`.
2. **Verify** → internal chain check ✓ ("the database agrees with itself").
3. **Witness compare:** Anita reads the range and root **from her own Telegram chat** and types the range
   (`1..214`) into the console; the console recomputes the root and head **from the ledger rows only** and
   shows them beside the line she pastes. Match ✓.
4. Naive tamper (SQL editor as owner, or `demo_tamper(seq,'edit')`) → Verify ✗ "chain breaks at #187
   (hash_mismatch)" → `ledger.tamper_detected` + Telegram alert.
5. Consistent tamper (`demo_tamper(seq,'rehash')` rewrites later hashes, `root_hex` and `head_hash`, under
   lock 4210001) → internal Verify ✓, **but the recomputed root for 1..214 no longer equals the root in
   Anita's Telegram message**. The console shows the two side by side with the first differing
   character highlighted.
Nothing in this check takes a message id, root or range from the database; the human supplies the
external value (N1). A database owner who also holds the bot token could post a forged line, which is
why the witness is the chat history as Anita saw it at 14:02, and why an owner-independent anchor
(OpenTimestamps / RFC 3161) is on the roadmap (data-model §4.5).

## 6. Ask Spotter with a photo (G2-6, G2-13, G2-18, D9)

```mermaid
sequenceDiagram
  participant OP as Ravi
  participant ST as Storage (ask-photos)
  participant A as ask fn
  participant PG as Groq prompt guard
  participant V as Vision (Groq qwen3.8-27b)
  participant G as Groq gpt-oss (20b rewrite, 120b answer)
  participant SG as Groq gpt-oss-safeguard-20b
  participant VY as Voyage
  participant PC as Pinecone
  OP->>ST: upload ask-photos/{uid}/{uuid}.jpg (owner-only policy, ≤ 4 MB)
  OP->>A: invoke ask {request_id, question, lang, photo_path}  (Authorization: user JWT + apikey)
  A->>A: authenticate the USER in code (anon/publishable-only → 401); per-user 6/min, 30/h; org breaker 20/min
  A->>PG: meta-llama/llama-prompt-guard-2-86m on the question (+ history) → injection/jailbreak score
  A->>V: signed URL (60 s) → strict JSON {category ∈ enum, confidence}; nothing else is kept
  A->>G: rewrite (20b): English query from the question + category label only
  A->>VY: voyage-multimodal-3.5 query embedding (text + image), 1024 dims
  A->>PC: sparse (pinecone-sparse-english-v0, English) + dense hybrid, top_k 20, audience ∋ role
  A->>VY: rerank-2.5-lite → top 5
  A->>A: live tools (P0: next task, active alerts) → ids live:*
  A->>G: 120b, strict JSON AskAnswer; chunks wrapped as <doc id=…> data, never instructions
  A->>A: deterministic gate (below)
  A->>SG: safety-critical answers only: policy check of the final answer
  A-->>OP: ≤ 3 steps + citations (+ proposed log_incident, needs a tap)
```
**Photo / prompt-injection defence (G2-13), layered:**
1. **Prompt guard (new, D-item 6):** `meta-llama/llama-prompt-guard-2-86m` (Groq, available on the
   account per the coordinator's live check) scores the question and history. Above the threshold
   (0.8 [A], tuned on the B19 fixtures) → refusal `injection_suspected`, logged. It also runs **once at
   ingestion** over every chunk (B18) and quarantines flagged chunks, so a poisoned document never enters
   the index. It is a classifier, not a guarantee; the layers below still apply.
2. Vision output is **untrusted and never citable**: reduced to one enum `category` plus a confidence.
   No free text from the image (including text printed in the photo) reaches any LLM call.
3. Citable sources are only `kb_chunks` ids retrieved in this request and `live:*` ids for live facts.
   `rule` may cite only a doc chunk and must appear **verbatim** (whitespace-normalised) in it; every step
   carries a valid citation; safety-critical ⇒ rule + doc citation + `handover_to_supervisor = true`.
   Failing any check → refusal.
4. **Safeguard (new):** for answers the rewrite flagged safety-critical, `openai/gpt-oss-safeguard-20b`
   (available on the account per the coordinator) evaluates the final answer against a short written
   policy ("never permit approaching a faulty machine, bypassing PPE, or operating after a fault; always
   hand over to the supervisor"). A violation → refusal `policy_violation`. Non-safety answers skip it
   (latency and TPM). [U] its output format and rate limits are confirmed in B19.
5. Injection fixtures in B19: instructions inside a chunk, inside a photo's printed text, inside the
   question; each must end grounded or refused, and the log says which layer stopped it.

**Providers: env-configurable chain (D9, updated by Shlok).**
- Default `LLM_CHAIN=groq_a,gemini,groq_b`: Groq account A (`GROQ_API_KEY`) → Gemini
  (`GOOGLE_GENERATIVE_AI_API_KEY`, verified live by the coordinator: `gemini-2.5-flash`,
  `gemini-3-flash-preview` available) → Groq account B (`GROQ_API_KEY_BACKUP`). The next provider is tried
  **only on 429 or 5xx**; any other 4xx is returned as an error (no chain walk).
- **Every request logs `provider_served`** (and the model) in `ask_logs` and in `AskResponse`.
- **AUP risk, accepted by Shlok:** using two Groq accounts for one app is what the Groq AUP describes as
  orchestrating usage across organisations to get around limits [R research 15]. That is why Gemini sits
  **before** account B: account B is the last resort, and the logs show how often it was used.
- Code talks to a provider-agnostic `ChatProvider` interface (`complete(json-schema, messages)`,
  `classify(text)`) with adapters `groq` (parameterised by key) and `gemini`; changing the order is an env
  change.
- Prompt guard and safeguard are Groq-only models: they run on account A, then account B on 429/5xx; if
  both fail, safety-critical answers **fail closed** (refusal).
- Budgets: answer ≤ 3,500 prompt tokens on 120b; rewrite ≈ 600 tokens on 20b; safeguard ≈ 800 tokens,
  safety-critical answers only; prompt guard on short inputs. Each model has its own per-org limits [R].
- Photos never go to Gemini (free-tier content is used to improve products [V]); the vision fallback is
  the deterministic icon grid.
- B20 (eval) is cut to after review 1; when it runs, it runs outside rehearsal windows and records the
  model per row. Voyage limits without a payment method are [U]. Latency p95 ≤ 8 s [A]
  (≈ +0.3 s prompt guard, +1 s safeguard on safety-critical answers).

## 7. Alert budget (EEMUA 191 / ISA-18.2 informed; G2-8)

Definitions: `hazard_key = {hazard_group}:{operator}:{subject}`; "active" = open, acknowledged or
escalating. All windows are **wall-clock**.
| Mechanism | Rule |
|---|---|
| Dedupe | Only alerts with the **same hazard_key** merge (partial unique index; SOS excluded). Same or lower tier → `occurrences + 1`, `last_seen`, no new dispatch. |
| **Upgrade** | Same hazard_key, **higher tier** → the alert is upgraded in place (`tier_history`), `alert.raised {upgraded_from}` is emitted, and the new tier's dispatch rules run immediately (critical ⇒ external now). An upgrade is never merged away. |
| Flap guard | A hazard that resolves and recurs within `dedupe_window_s` reopens the same alert (counter), instead of a new one. |
| Suppression | Only **within the same hazard_group and subject**, and only by an **open (unacknowledged)** alert of a higher tier. Different hazards are never suppressed by each other; an acknowledged alert suppresses nothing. |
| Rate cap | Applies only to **info and caution** kinds (`rate_capped = true`): ≤ 6 per operator per 10 wall-minutes; the excess is stored `suppressed(rate_cap)` and one `alert_flood:{operator}` summary alert is raised for FM (it has a hazard_key, so it deduplicates, and its dispatch has a subject id; G2-8d). Warning, critical and SOS are never capped. |
| Catch-up | §0: only on `jump_to` or a > 5 s wall stall, scaled by speed. |
| External caps | Telegram: one message per alert per escalation level, then edits; ≤ 1 msg/s per chat [R]. Twilio: one active call per recipient, 60 s cooldown, ≤ 2 attempts per dispatch. |
| Motion lock | §2. |

Seed (`ALERT_POLICIES`, generated into `alert_policies`) [A: tunable]:
| kind | hazard_group | tier | dedupe s | ack timeout s | escalate to | capped |
|---|---|---|---|---|---|---|
| seatbelt_off_moving | seatbelt | warning, critical on slope | 120 | 20 | supervisor_telegram | no |
| guardian_hazard | guardian | warning, critical < 15 m | 60 | 15 | operator_call, supervisor_telegram | no |
| proximity_zone | proximity | caution/warning | 30 | 20 | supervisor_telegram | caution only |
| ppe_missing | ppe | caution | 300 | — | — | yes |
| anomaly_machine | machine_health | caution | 600 | — | — | yes |
| idle_excess | idle | info/caution | 1800 | — | — | yes |
| sos | sos | critical | none | 60 | supervisor_telegram at once, supervisor_call at 60 s | no |
| ledger_tamper | ledger | critical | 600 | — | supervisor_telegram | no |
| alert_flood | flood | caution | 600 | — | supervisor_telegram | no |

## 8. Idempotency, boundary by boundary

| Boundary | Duplicate source | Guard |
|---|---|---|
| Frame apply | job retry, director `manual_tick` | try-lock 4210002 (also taken by `manual_tick`, N5); `unique (run_id, frame_seq)`; `cursor_seq` advanced in the same txn |
| Detector events | re-applied frame | `det:` key, `on conflict do nothing` |
| Client RPCs | double tap, retry | `rpc:{fn}:{request_id}`; the RPC returns the original result |
| Ledger | retried enqueue / drain; RPC + event both writing (N3) | one write path: only the event trigger enqueues, key `ledger:{event key}`; `ledger_queue.idempotency_key unique`; `incidents.idempotency_key unique`; drain marks written in the same subtransaction |
| Loop | re-queued event | `loop_queue.event_id` primary key; `lesson_assignments` unique (operator, lesson, event); `replay_scenarios.source_event_id` unique |
| Dispatch kick | pg_net retry, requeue | CAS `queued → sending` inside `dispatch`; attempts counter on one row; unique (subject, purpose, channel, role, level) |
| Twilio call | function retried after the call exists | `provider_ref` saved right after `calls.create`; rows with a `provider_ref` are polled, never re-called |
| Escalation call after ack | ack during `escalating` | `dispatch` re-checks alert status before calling (G2-10) |
| Telegram webhook | retries on non-2xx [V] | `telegram_callback` = dedupe + ack in one txn; failure rolls back the dedupe row (G2-11) |
| Twilio webhooks | retries | `tw:` key; `alert_ack` is a CAS |
| Escalation | concurrent job runs | `for update skip locked` + CAS |
| Director | double click | `dir:{request_id}` |

## 9. External calls: failure modes and fallbacks

| Call | Failure mode | Fallback |
|---|---|---|
| Telegram send | 429 `retry_after`, 403 (bot not started) | retry once honouring `retry_after`; FM console inbox always has the alert; pre-flight test message |
| Telegram webhook | not set, wrong secret, cold start | FM acknowledges in the console (same CAS) |
| Telegram checkpoint message | not delivered | checkpoint shows "not published" and cannot be used as a witness; re-publish before the tamper step; screenshot backup |
| Twilio `calls.create` | 32100 unverified number [R], geo permission, credit | Telegram still sent; UI shows the reason; backup video of the call step |
| Twilio no answer | StatusCallback `no-answer`/`busy` | one retry after 60 s, then Telegram only |
| Twilio signature | URL mismatch | signed URL is `PUBLIC_FUNCTIONS_URL + '/twilio-voice' + exact query we sent` (G2-7), never `req.url`; tested against Twilio's documented algorithm [V twilio.com/docs/usage/security] |
| Groq chat | 429, 5xx | next provider in `LLM_CHAIN` (default Groq A → Gemini text → Groq B); all exhausted → refusal + top chunk titles; `provider_served` logged (D9) |
| Groq vision | Preview model gone | icon grid (no Gemini for photos) |
| Groq prompt guard / safeguard | 429, 5xx | fail closed for safety-critical answers (refusal); fail open for the prompt guard on non-safety questions, logged |
| Voyage embed / rerank | 429/5xx | sparse-only retrieval / Pinecone order |
| Pinecone | monthly quota 429 [V], 5xx | refusal with "ask your supervisor" |
| Realtime | drop, JWT expiry | connectivity chip; Broadcast replay (≤ 25, supabase-js ≥ 2.74 [V]) + `my_snapshot` |
| pg_net | unlogged tables lost on crash [V], timeout | requeue job (§data-model 3.3) |
| pg_cron | job failing | `cron.job_run_details` + `tick_log` checked by `demo-check`; director `manual_tick` |
| scenario tick overrun | > `max_frames_per_tick` due | remaining frames next tick; lag visible in `tick_log.lag_sim_ms`; catch-up rule (b) prevents alert bursts |

## 10. STRIDE (spec §7b; PA-7)

| Threat | Asset / entry point | Control in this design | Residual |
|---|---|---|---|
| **S**poofing | Edge Functions `ask`, `director` | user JWT authenticated in code (not `verify_jwt` + publishable key, G2-6); `director` also needs role FM + `DEMO_DRIVER_SECRET` (constant-time) | stolen session until expiry |
| S | Telegram / Twilio webhooks | secret header (constant-time) / HMAC-SHA1 signature over the public URL; Telegram chat id bound to the supervisor | bot token or auth token leak |
| S | Device login | Supabase Auth sessions: JWT expiry 1 h (default [A]), refresh tokens; demo accounts with strong passwords; "time-box sessions" is a paid Auth setting [U] | shared demo laptop |
| **T**ampering | Ledger | canonical hash chain; append-only grants + triggers; Merkle checkpoint sent to the fleet manager's Telegram and compared by a human against a root recomputed from the rows ("tamper-evident, human-verifiable" (the checkpoint is externally witnessed in Telegram)) | a party holding both DB ownership and the bot token; entries after the last checkpoint; OpenTimestamps/RFC 3161 on the roadmap |
| T | Events, alerts | writes only via security-definer RPCs; append-only events | DB owner |
| **R**epudiation | SOS, PPE override, acks | who/why/when in the ledger; `ack_via`, `ack_by`; dispatch log with provider ids | — |
| **I**nformation disclosure | Phone numbers, GPS trail, photos | numbers only in Edge Function secrets; RLS per role; photos owner-only, never sent to Gemini; near-miss rows pseudonymised for FM | Groq processes photos (vendor terms) |
| I | Realtime | private topics, one topic per audience, RLS on `realtime.messages`; public access off | policies cached per connection [V] |
| **D**enial of service | Groq TPM per account, Gemini free quota (D9), Twilio credit | per-user and org-wide ask limits; dry-run for rehearsals; SOS abuse flag | a judge hammering Ask |
| D | Database | size budget §7 of data-model; statement timeouts on the tick | Free-plan compute |
| **E**levation of privilege | RPCs | role check in every RPC; `search_path = ''`; secret key only in Edge Functions | — |
| E | AI-initiated writes | the model only proposes `log_incident`; a human tap calls the RPC | — |
| E | Prompt injection (docs, photos) | prompt guard on questions and at ingestion; chunks wrapped as data; vision reduced to an enum; verbatim-rule check; safeguard policy check; refusal | novel jailbreaks |

Owner of the STRIDE slide: backend-lead (content from this table), assigned in backend-tasks.
