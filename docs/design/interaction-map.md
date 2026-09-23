# Interaction map (the single source for navigation, actions and states)

- Status: design plan **v2** (ui-ux-lead, 2026-09-23). v2 codes against **api-contracts revision 3**: UI gaps UI-1 to UI-15 are closed, and UI-16 is partly closed (see api-contracts §10). It adds the D10 training redesign and the human-verified ledger witness.
- Update this file with every new interaction (ui-framework §10). Visual tokens are in visual-language.md, screen content in screens.md, tasks in frontend-tasks.md.
- **⚠C** marks a remaining question for Track B (frontend-tasks §5).

## 0. Canonical vocabulary (one name per thing; no synonyms anywhere in the UI)

| Kind | Canonical names (English source strings) |
|---|---|
| Safety states | CLEAR · CAUTION · WARNING · CRITICAL · NO SIGNAL |
| Work states (hero word) | READY · WORKING · PAUSED · BLOCKED · DONE · FAULT |
| Operator actions | Start task · Resume · Pause · Complete · Acknowledge · SOS (hold) · Cancel SOS · Log incident · Listen · Ask · Practise · Start · Open (evidence) · Decide now · Confirm order · Play / Pause / Restart (re-enactment) · Next · Done |
| Fleet-manager actions | Acknowledge · Grant override · Verify ledger · Compare with Telegram · Show on map |
| Replay phases | BRIEF · INVESTIGATE · DECIDE · DEBRIEF |
| Words we never use | "OK" / "Cancel" as a confirm pair (use the verb + "Back"); "Dismiss" on a safety alert; "Submit" |

## 1. Navigation

### 1.1 Operator (5 items, icon + label always; bottom bar below 1024 px, left rail from 1024 px)
| Item | Route | Holds | Badge |
|---|---|---|---|
| Home | `/op` | Hero card, Loop card, conditions, today's tasks | — |
| Task | `/op/task` | Current or next task, Start/Resume/Pause/Complete, PPE block, why | — |
| Safety | `/op/safety` | Active alerts, checks, Log incident | count of alerts that need Acknowledge |
| Map | `/op/map` | Site map, trail, machines by health, Guardian | — |
| Training | `/op/training` | Assignments ("Because of today"), completed practice | "1 new" on `training.replay_ready` / `lesson_assigned` |

Sub-screens (each with a back control; leaving a replay mid-run asks first, T10):
- `/op/training/replay/[id]`: one route, whose phase is internal state (Brief → Investigate → Decide → Debrief). No URL per phase, so the browser Back cannot skip into a later phase.
- `/op/training/lesson/[code]`.
- First launch: `/start`.

Cross-links (the only ones; no loops): hero → Task · Guardian takeover → Map · Loop card → Replay · Debrief → Lesson.

### 1.2 Fleet manager (4 items, left rail, Detailed mode)
Inbox `/fm` · Fleet Map `/fm/map` · Analytics `/fm/analytics` (evidence card) · Ledger `/fm/ledger`.

### 1.3 Director (hidden)
`/director`: FM session + director secret (typed once per tab, kept in `sessionStorage`). See §4.9.

## 2. Persistent chrome (unchanged from v1 except where noted)

- **Phone:** status strip 80 px [Safety chip][Connectivity chip]; title row [title] … [Language][Ask]; bottom nav 80 px; **SOS** fixed bottom-right at 108 px.
- **From 1024 px:** one top strip, a left rail, SOS bottom-right.
- **Z-order:** content 0 · chrome 10 · sheets 20 · motion lock 25 · alert takeover 30 · **SOS 40** · SOS status 45.

| Element | Shows | Tap | Rules |
|---|---|---|---|
| **SOS** | Red plate, "SOS" + localised "Help"; "SOS ACTIVE" while one is open | Hold 1.5 s (A10); while active a tap opens the SOS sheet | Operator only. Visible in motion lock, over takeovers and during a replay |
| **Safety chip** | Highest active tier: colour + pictogram + word, "×3" when `occurrences` > 1 | Opens Safety | NO SIGNAL after 10 s offline; a stale CLEAR is never shown |
| **Connectivity chip** | LIVE · SIM 10:42 ×60 / RECONNECTING… / NO SIGNAL · synced 10:42 / FIXTURE | Opens the sync sheet | Clock from `ClockTick.sim_now`. Countdowns use the offset from `server_now` |
| **Language** | English / हिन्दी / தமிழ் | Language sheet (A01) + "Switch user" | Cookie locale (the language RPC was rejected for P0, UI-16) |
| **Ask** | Question-bubble icon + "Ask" | Ask sheet (A17) | Hidden in motion lock, first launch and inside a replay (so the answer key cannot be looked up mid-run) |

## 3. Button states (shared)

| State | Visual |
|---|---|
| Default | Primary = ink plate with a white label (at most one per view); secondary = 2 px ink outline. Min 80 px (48 px in FM Detailed from 1024 px) |
| Hover | Desktop only: underline |
| Pressed | Darkens, 2 px inset top rule, 80 ms |
| Focus | 3 px ink outline with a 3 px paper offset |
| Disabled | Dashed `--ink-3` border **plus a reason line** |
| Loading | The label stays; a 3 px indeterminate bar after 300 ms; `aria-busy` |
| Success | Tick + past tense for 1.2 s |
| Error | Ink ✕ + one line + "Try again" (never red) |
| Offline | Disabled + "Needs signal" (SOS excepted) |
| Requires confirmation | A confirm sheet with the question, the verb button and "Back" |

Idempotency: one `request_id` per intent, reused on retry.

## 4. Action contracts
Format: **Purpose · Visible · On press · Success · Failure · Duplicate · Undo** (§3 states apply unless noted).

### 4.1 First launch and preferences
**A01 Choose language.**
- Purpose: set the UI and audio language.
- Visible: first launch step 1, and the Language chip.
- On press: select a plate; its name plays aloud (this also unlocks audio). Then set the `NEXT_LOCALE` cookie and `router.refresh()`.
- Success: re-render in under 1 s. Undo: choose again.

**A02 Choose role / Switch user.**
- Purpose: sign in as a demo persona (Ravi / Anita).
- On press: `functions.invoke("demo-login", {persona})` → `{token_hash}` → `supabase.auth.verifyOtp({token_hash, type:"email"})` → `my_snapshot` → `/op` or `/fm`.
- Failure: "Could not sign in. Try again."
- Duplicate: button locked while loading. Undo: Switch user.
- The director secret needed by `demo-login` lives in the deploy's server env. ⚠C: confirm it is called from a Next route handler, never from the browser.

**A03 Pair machine.**
- Purpose: link the operator to today's machine.
- Visible: first launch step 3 (operators), **skipped** when `paired_machine_id` is already set (it shows "Your machine: EXC-007 ✓" instead).
- On press: a code field (large, uppercase; the suggested code is shown as a chip) → [Pair] → `rpc pair_machine {p_machine_code, p_request_id}`.
- Success: "Paired · EXC-007 · Cat 320". Failure: `not_found` → "No machine EXC-070 on this site"; network → Try again.
- Undo: pair again (P1: unpair).

**A04 Give consent.**
- On press: `rpc consent_set {p_version: PRIVACY.consent_version, p_granted:true}`.
- The copy says "kept for 90 days" (`PRIVACY.retention_days`).
- "Not now" blocks entry, with "Spotter needs this to keep you safe. Talk to your supervisor."

**A05 Simple / Detailed.** A segmented control on Home and Task. The choice is kept in `localStorage`; there is no server call.

### 4.2 Task
**A06 Start task / Resume.**
- Visible: status `planned | paused | blocked_ppe`, not motion-locked.
- On press: `rpc task_start {p_task_id, p_request_id, p_eta_p50_min, p_eta_p90_min, p_eta_factors: EtaFactor[], p_eta_model_version}`. The same call resumes a paused task, and it re-checks PPE every time (UI-12).
- Success `started` → WORKING. `blocked` → the PPE block plate (§7).
- Failure: `blocked` with `override_expired` → "Override expired" on the plate (`ppe.missing` is re-emitted to the Inbox automatically); `not_paired` → go to A03; `invalid_state` → refetch; network → Try again.
- Undo: Pause.

**A07 Pause.** `rpc task_pause`. No confirmation; Resume undoes it.

**A08 Complete.**
- Requires confirmation: "Complete Excavation? 72 % done, 41 min so far." (the % comes from `task.progress`, UI-1).
- On confirm: `rpc task_complete`. There is no undo, which is why it asks first.

### 4.3 Alerts and SOS
**A09 Acknowledge (operator).**
- Visible: Warning or Critical takeover with `needs_ack`, and not `motion_locked`. Size 108 px.
- On press: `rpc alert_ack`. **No optimistic update.**
- Success: the takeover collapses into the chip; audio and vibration stop.
- Failure or offline: "Not sent. Your supervisor will be alerted anyway."

**A10 SOS (hold to send).**
- On press: hold 1.5 s (ticks at 0.5 s and 1.0 s; keyboard: hold Space/Enter). Then `rpc sos_raise {p_request_id, p_lat, p_lon, p_note:null}`. The location is the device/operator location **or null**; the server falls back to the machine, then the site (UI-14).
- Success (`SosRaiseOut`): the SOS sheet shows "SOS SENT 14:03:12" and "Location: from machine" (`location_source`). A countdown to `escalate_at` is computed with `server_now`. A dispatch line comes from `dispatch.*` on `op:` (UI-10): "Telegram to Anita: sent ✓" → "Calling Anita…" / "Anita acknowledged 14:03:20". The ledger number arrives via `incident.logged`.
- Failure or offline: "Not sent. No signal." + **Call supervisor** (`tel:` to `site.emergency_tel`, UI-11) + retry every 5 s with the same request_id.
- Duplicate: while an SOS is open, the button opens the sheet and never raises again. Undo: A11.

**A11 Cancel SOS.** Available for 10 s after sending: `rpc sos_cancel`. After that the button is removed.

**A12 Listen.** Replays the pre-generated clip (alerts, protocol cards, lesson cards). It is hidden if the clip is missing.

### 4.4 Incidents
**A13 Log incident.**
- One sheet: type (Near miss · First aid · Damage · Other) → how serious (Low / Serious / Injury → 1/3/5) → an optional note → [Log incident].
- On press: `rpc incident_log {…, p_description: note or null, p_non_punitive: type == near_miss}`. A null description gets the type label server-side (UI-15).
- Success: `IncidentLogOut {event_id}` → "Sent · recording in the ledger…", then on `incident.logged` → "Recorded #216 · a71b…".
- Failure: the draft is kept + Try again. Offline: disabled, draft kept.
- Undo: none (append-only).

### 4.5 Training: Replay (D10, four phases) and micro-lessons

**Replay state machine** (client-side; the answer key never reaches the client before submit):
```
LOADING ─replay_get─► BRIEF ─Start─► INVESTIGATE ─(Decide now | budget 0)─► DECIDE step 1..n ─(last step)─► SUBMITTING ─► DEBRIEF
   any phase ── live Warning/Critical ──► PAUSED (every timer frozen) ── alert handled + Resume ──► same phase
   any phase before DEBRIEF ── Back ──► confirm "Leave practice? Your answers will be lost." [Leave] [Back]
```

**T1 Practise.**
- Purpose: open the replay built from my own event.
- Visible: an assignment in `my_snapshot.assignments` with `replay_id` (the Loop card on Home and on Training). It appears live on `training.replay_ready`.
- On press: `rpc replay_get {p_replay_id}` → `ReplayScenario` → BRIEF.
- Failure: "Could not load the practice. Try again." Offline: disabled. Duplicate: loading lock.

**T2 Start (Brief → Investigate).**
- The Brief shows `brief.title`, `situation`, `goal`, and "You have {time_budget_s} s to look at the evidence". The situation audio plays once.
- **The Brief is not timed** (the 10 s in the spec is its target length, not a limit): a low-literacy operator must be able to hear it through before the clock starts.
- On press: the Investigate timer starts.

**T3 Open evidence card.**
- Purpose: look at one piece of evidence. Opening is scored as process: which cards, and in what order.
- Visible: the Investigate grid (3-7 closed card plates: type pictogram + `title`).
- On press: the card opens as a sheet with its content (screens.md S5b). The **first** open appends the card id to `open_order` and stamps the plate "①". Closing and reopening is free and does not re-record.
- `max_open` set: a counter "3 of 4 opened". At the limit, the unopened plates are disabled with the reason "Limit reached".
- Relevance is never hinted before the Debrief.

**T4 Decide now.**
- Purpose: end Investigate early.
- Visible: Investigate, after at least 1 card is opened (before that it is disabled with the reason "Open at least one card").
- On press: DECIDE step 1. No confirmation: the timer would end the phase anyway.

**T5 Choose (Decide step, `kind: "single"`).**
- Visible: each step, with its prompt, 2-5 choice plates (pictogram + label) and the step countdown.
- On press: the plate shows as selected (inverted ink) and the step locks. After 400 ms it advances and records `{step, choice_ids:[id], ms}`.
- No correctness feedback here (Solve-style); it comes in the Debrief. No undo within a step.

**T6 Confirm order (`kind: "order"`, arrange protocol actions).**
- A tap on a choice assigns the next number (1, 2, 3…). A tap on the **last** numbered choice removes its number, so the sequence can be corrected from the end.
- [Confirm order] is enabled when every choice is numbered. On press it records `{step, choice_ids:[in order], ms}` and advances.

**Timer behaviour (Investigate and every Decide step):**
- **Display:** a full-width ink bar that drains linearly, plus the seconds left as a `--t-figure` number. The bar is ink, **never a safety colour**: urgency in training must not look like a live alarm. No vibration and no alarm sound. From 5 s, the number is announced to screen readers once per second (`aria-live="polite"`) and a soft tick plays in the audio channel.
- **Clock:** the client's monotonic clock (`performance.now()`). The server does not time the phases; `ms` is measured from when the step is shown to when it is locked.
- **Pauses:** the timer freezes when the page is hidden (`visibilitychange`) and while a live alert has taken over. It resumes only on an explicit [Resume], so a live alert never costs the operator training time.
- **Timeout:** at 0 a "Time's up" plate shows for 800 ms. In Investigate the flow moves to DECIDE with the cards opened so far. In a Decide step the step is **omitted from `p_choices`** (the contract needs at least one `choice_ids`), and scoring treats it as not answered in time (⚠C UI-18: confirm).
- **Reduced motion:** the bar updates once per second.

**T7 Submit (automatic).**
- After the last step: `rpc replay_submit {p_replay_id, p_request_id, p_open_order, p_choices}` → `ReplayDebriefResult` → DEBRIEF. There is no Submit button.
- Failure: "Score not saved. Try again." (the answers are kept; the same request_id is reused). Offline: waits and retries every 5 s with "Waiting for signal".

**T8 Re-enactment playback (Debrief).**
- Purpose: watch my own event, rebuilt from `reenactment` (trail, machine track with speed and pitch, wind) at 10×.
- Controls (all 80 px):
  - **Play / Pause** (one toggle);
  - a **scrubber** (80 px hit height) with two markers: ⚑ the event moment and ⏱ "you responded" at `real_response_ms`;
  - **Restart**;
  - a fixed "10×" label (no speed menu; the reduction pass).
- Readouts under the map: sim time, speed, pitch, and seatbelt as an ink pictogram.
- Behaviour: it autoplays once when the Debrief opens (no autoplay with reduced motion) and stops at the end on the final frame, with no loop. Dragging the scrubber pauses it. Keyboard: Space = play/pause, ←/→ = ±1 s of sim time.
- Playback length = `duration_ms / 10`. A live alert pauses it.

**T9 Debrief next steps.**
- "Lesson: Seatbelt on slopes" (primary, when `lesson_code` is set) → `/op/training/lesson/[code]`.
- "Practise again" (secondary): a new attempt from the Brief with a new request_id, reusing the cached scenario.
- "← Training".

**T10 Leave replay.** Back or a nav tap before the Debrief opens a confirm sheet: "Leave practice? Your answers will be lost." [Leave] [Back]. After the Debrief, no confirmation.

**T11 Lesson card: Next / Listen.**
- Purpose: go through 3-5 illustrated cards (`LessonContent.cards`: kind label RULE / WHY / HOW / EXAMPLE / CHECK, a title, a body, and a pictogram or image).
- Each card's Hindi (or English) audio plays when the card opens; A12 replays it.
- [Next] (primary) and "← Back" (secondary, from card 2). Swiping is allowed as well, never instead of the buttons. Progress shows as "2 / 4".
- Audio: ⚠C UI-17, below.

**T12 Quiz answer (instant feedback).**
- 3 questions with 2-4 icon choices each. A tap locks the choice and reveals the result at once: the chosen plate shows ✓ (filled ink) or ✕ (outlined), the correct choice is marked ✓, and `why` shows with its audio. `correct_id` is sent to the client: lessons are practice, not assessment.
- [Next] after the reveal.
- After question 3: "2 of 3" → `rpc lesson_complete {p_assignment_id, p_quiz_score: 67, p_request_id}` → "Done ✓" and back to Training.
- Failure: "Not saved. Try again." There is no quiz retry in P0.

### 4.6 Ask Spotter
**A17 Ask.**
- A question (typed, or one of 3 suggestions based on the current alert or task), an optional photo (compressed to ≤ 1,600 px, uploaded to `ask-photos/{uid}/{uuid}.jpg`), then [Ask] → `functions.invoke("ask", AskRequest)`.
- `answered`: numbered steps, each with its citation marks (`steps[].cited_ids`); a RULE plate quoting `rule.text` with its source; "Talk to your supervisor" when `handover_to_supervisor`; and a photo chip "Looks like: hydraulic leak · 72 %" (`photo.category`, `confidence`).
- `refused`, by `refusal_reason`:
  - `no_evidence`, `rule_not_verbatim`, `citation_invalid` → "No answer in the manuals. Ask your supervisor.";
  - `rate_limited` → "Too many questions. Wait a minute.";
  - `provider_down` → "Spotter is unavailable. Ask your supervisor.";
  - `injection_suspected`, `policy_violation` → "Spotter can't answer that. Ask your supervisor."
- `degraded`: the answer plus the meta line "Backup model".
- Offline: disabled.

**A18 Review and log.** Shown only when `proposed_action` is set. It opens A13 prefilled; the operator confirms. The model never writes by itself.

### 4.7 Fleet manager
**A20 Acknowledge.** As A09, from an Inbox row.

**A21 Grant override.** See §7.

**A22 Verify ledger.**
- `rpc ledger_verify {p_from:1, p_to:null}` → `LedgerVerifyOut`.
- ok: a CLEAR plate "Chain intact · {checked} entries · head a71b…".
- Not ok: a CRITICAL plate "Chain breaks at #{first_bad_seq} ({reason})", the row highlighted, and expected vs stored hashes shown.
- The plate says "The database agrees with itself". That is the *internal* check only.

**A23 Compare with Telegram (human-verified witness; N1).**
- Purpose: check the ledger against the checkpoint Anita received **outside** the database.
- Visible: always on Ledger.
- Sequence:
  1. "Open the SPOTTER-LEDGER message in your Telegram."
  2. **Paste the line** into a monospace field. It is parsed live with `WITNESS_LINE`, which fills **From** and **To** (both editable number fields; she can also type the range from the message by hand) and shows the published root and head, labelled "From your Telegram".
  3. [Compare] → `rpc ledger_recompute {p_first_seq, p_last_seq}` → `LedgerRecomputeOut`.
  4. Two aligned rows per hash (root, then head): "From your Telegram" above "Recomputed from ledger rows now", 64 hex characters grouped by 4.
- Match (root, head and `leaf_count = n`): a CLEAR plate "Matches your Telegram checkpoint · {n} entries".
- Mismatch: a CRITICAL plate "Does not match. The ledger changed after this checkpoint." The **first differing 4-character group is boxed** in ink, and an arrow marks the exact first character.
- No line pasted (range typed only): the recomputed values show with the note "Paste the Telegram line to compare".
- Failure: `validation` (first > last, or out of range) → a message on the field; network → Try again. Duplicate: locked while loading. Undo: n/a (read only).
- **Nothing on the "From your Telegram" side comes from the database.** A footer states the claim exactly: "Externally witnessed, human-verifiable."

**A24 Show on map.** Navigation to the machine, with the alert ring highlighted.

### 4.8 Deliberately not a button
No Dismiss on Warning or Critical. No operator "Request override" (`ppe.missing` already reaches the Inbox). No settings screen. No refresh. No Submit in Replay. No speed menu on the re-enactment.

### 4.9 Director (demo only; states: default / loading / done / error)
Each button sends one `DirectorCommand`:
- New run (`review1`, speed, **rehearsal** on/off) · Play · Pause · Speed 1× / 10× / 60× · Jump to beat 1-5;
- Inject: vest on · seatbelt off · seatbelt on;
- Publish checkpoint · Tamper #N (edit) · Tamper #N (rehash);
- Dry run on/off, shown as a large state label;
- Purge rehearsals (requires confirmation).

Every response `message` is appended to a log.

## 5. Alert tiers

| Tier | Screen | Vibration | Audio | Needs Acknowledge | Escalation (server) |
|---|---|---|---|---|---|
| **Info** | A row in the Home/Safety feed | none | none | no | none |
| **Caution** | A yellow banner under the strip (80 px) → Safety; clears itself | [200] once | none | no | none |
| **Warning** | An orange takeover over the content (the chrome and SOS stay): pictogram, WARNING, cause, protocol card (`ProtocolCard`), countdown to `escalate_at`, [Acknowledge] [Listen], "Show on map" for Guardian | [400,200,400] every 5 s | TTS at once, repeated every 10 s (at most 6) | yes | Timeout → Telegram to the supervisor; an operator call only when `call_allowed` |
| **Critical** | The same takeover in red, full screen including the strip (SOS on top), with the dispatch line | [800,200,800,200,800] every 4 s | TTS at once, repeated every 10 s | yes | External escalation fires **at once** |

- **Tier upgrade:** an alert raised with `upgraded_from` (for example Guardian warning → critical under 15 m) swaps colour instantly, plays the 480 ms border stamp once, and restarts audio and vibration at the new tier.
- **Lifecycle:** `open` → shown · `acknowledged` → the takeover closes and the chip keeps the colour · `escalating`/`escalated` → the dispatch line · `resolved` → the chip drops · `suppressed` → operator never sees it; the FM sees "Suppressed (n)".
- **FM-only kinds:** `alert_flood` (a summary row) and `ledger_tamper` (critical, from `ledger.tamper_detected`).
- **Concurrency:** only the highest tier shows as a takeover; others show as "+1 more"; Criticals stack.
- **Countdown:** `escalate_at` minus server time (`server_now` offset, UI-4).
- **Autoplay:** audio unlocks at A01. If it is still blocked: "Sound blocked, tap Listen".
- **Unknown event types:** rendered as a generic row (`type` + tier).

## 6. Motion-lock view

- **Source of truth:** `operator_state.motion_locked`, computed by the same SQL function as the call rule, and live via `operator.motion_lock_changed` (UI-5). `reason: state_unknown` counts as locked. The client adds a **3 s display hold before unlocking** (it never affects calls, which are decided server-side).
- **Layout:** the hero card at full screen inside the 8 px ink/paper stripe frame, the connectivity chip in the corner, **SOS** bottom-right, and one line: "Stop the machine to use Spotter". Nothing else is shown.
- **Input:** every touch is ignored except the SOS hold.
- **Alerts:** a Warning or Critical takeover shows **without** Acknowledge. In its place: "Fix it: fasten seatbelt, or stop to respond". It resolves by sensor (`alert.resolved via sensor`) or escalates to the supervisor's Telegram (no operator call while locked). When the machine stops, the Acknowledge button appears at once.
- **Replay** can't be open while locked (the lock covers it). An in-progress replay pauses.

## 7. PPE warning and logged supervisor override

```
Operator (Task)                                          Fleet manager (Inbox)
A06 Start → task_start → {blocked, missing:[vest]}
BLOCKED plate: blue mandatory sign "Wear vest"
  + TTS + "Supervisor notified"                     ←   ppe.missing row: CAUTION · Ravi · vest · Excavation
Start disabled: "Needs vest"                             [Grant override]
path A (demo): ppe.restored → "Vest detected ✓"
  → Start → started                                      path B: A21 sheet "Let Ravi start without: vest"
                                                           reason 10-500 chars (counter) + 2 quick reasons
                                                           [Grant 15-min override] [Back]
                                                           → rpc ppe_override → {override_id, valid_until}
                                                           → "Recorded in ledger · valid until 14:17"
ppe.override_granted → "Override by Anita · until 14:17"
  → Start → started
expired → task_start returns blocked + override_expired → "Override expired", and ppe.missing re-appears in the Inbox
```

A21:
- Visible: an Inbox row of kind `ppe_missing` whose task is `blocked_ppe`.
- Failure: `forbidden` / `invalid_state` / `validation` messages, or network + Try again.
- Duplicate: request_id.
- Undo: none. The sheet says "Recorded permanently. Expires in 15 minutes."
- The ledger number arrives via `incident.logged`.

## 8. Offline matrix (P0)

| Thing | Offline behaviour |
|---|---|
| Chips | NO SIGNAL states (§2) |
| Hero, tasks, map | Render from the cached `my_snapshot` with an "as of" stamp |
| SOS | Retries + `tel:` `site.emergency_tel` |
| Actions (Start, Pause, Complete, Acknowledge, Log incident, Ask, Practise, Pair) | Disabled with "Needs signal" |
| A replay already loaded | Can be played through; the submit waits and retries |
| A lesson already loaded | Cards and quiz work; `lesson_complete` retries |
| Reconnect | Rejoin → Broadcast replay (≤ 25) → `my_snapshot` |
