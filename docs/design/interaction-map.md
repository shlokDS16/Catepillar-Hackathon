# Interaction map (the single source for navigation, actions and states)

- Status: design plan v1 (ui-ux-lead, 2026-09-23). Update this file with every new interaction (ui-framework §10).
- Contract names are from docs/architecture/api-contracts.md v1.0.0 (Proposed). The backend-lead is revising the contracts in parallel. Mismatches found so far are marked **⚠C** and listed in frontend-tasks.md §5.
- Visual tokens are in visual-language.md, and screen content is in screens.md.

## 0. Canonical vocabulary (one name per thing; no synonyms anywhere in the UI)

| Kind | Canonical names (English source strings; i18n keys in brackets) |
|---|---|
| Safety states | CLEAR `state.clear` · CAUTION `state.caution` · WARNING `state.warning` · CRITICAL `state.critical` · NO SIGNAL `state.nosignal` |
| Work states (hero word) | READY · WORKING · PAUSED · BLOCKED · DONE · FAULT |
| Operator actions | Start task · Resume · Pause · Complete · Acknowledge · SOS (hold) · Cancel SOS · Log incident · Listen · Practise · Ask |
| Fleet-manager actions | Acknowledge · Grant override · Verify ledger · Compare with Telegram · Show on map |
| Words we never use | "OK", "Cancel" as a confirm pair (use the verb plus "Back"); "Dismiss" on a safety alert; "Submit" |

## 1. Navigation

### 1.1 Operator (5 items, icon + label always, bottom bar under 1024 px, left rail from 1024 px)
| Item | Route | Holds (hierarchy) | Badge |
|---|---|---|---|
| Home | `/op` | Hero card (L1-L3), Loop card (L4), today's tasks (L2-L3), conditions (L3) | none |
| Task | `/op/task` | Current or next task: progress, ETA + why, Start/Pause/Complete, PPE block | none |
| Safety | `/op/safety` | Active alerts, checks (seatbelt, PPE, proximity, conditions), my incidents, Log incident | count of alerts that need Acknowledge (ink badge, no colour) |
| Map | `/op/map` | Site map, my trail, machines by health, Guardian rings and protocol card | none |
| Training | `/op/training` | "Because of today" assignment, Replay, lessons | "1 new" when a lesson is assigned |

Sub-screens (with a back button to the parent, 80 px): `/op/training/replay/[id]`, `/op/training/lesson/[code]`. First launch: `/start` (outside the shell).
The hero card links to Task, and a Guardian takeover links to Map. Those are the only cross-links, so there are no navigation loops.

### 1.2 Fleet manager (4 items, left rail, Detailed mode by default)
| Item | Route | Holds |
|---|---|---|
| Inbox | `/fm` | Alerts from `sup:{site}` (SOS, Guardian, seatbelt, PPE missing, anomalies) with the dispatch log. The anomaly filter replaces a separate "anomaly table" (reduction) |
| Fleet Map | `/fm/map` | The same Map component, site scope: all machines by health, all operators, zones |
| Analytics | `/fm/analytics` | Evidence card (P0) plus one chart. The task-time analytics chart is P1 |
| Ledger | `/fm/ledger` | Incident chain, Verify ledger, checkpoints with Compare with Telegram |

### 1.3 Director (hidden, demo only)
`/director`: not linked from any nav. Needs the fleet-manager session **and** the director secret, which is typed once per tab and kept in `sessionStorage`. See §4.9.

## 2. Persistent chrome (on every shell screen; it survives navigation, sheets and alerts)

Layout, phone (< 640 px): a **status strip** at the top, 80 px high: [Safety chip, grows] [Connectivity chip]. A **title row** below it: [screen title] … [Language] [Ask]. The **bottom nav** is 80 px. **SOS** is fixed bottom-right, 108 px, sitting 16 px above the nav.
From 1024 px: a single top strip [Safety chip][Connectivity chip] … [Language][Ask], the left rail nav, and SOS fixed bottom-right of the viewport.
Z-order: content 0 · chrome 10 · sheets 20 · motion lock 25 · alert takeover 30 · **SOS 40 (always on top)** · SOS status 45.

| Element | Shows | Tap | Rules |
|---|---|---|---|
| **SOS** | Red plate, "SOS" word (display font) + localised "Help" label; "SOS ACTIVE" while one is open | Hold 1.5 s (A10). While an SOS is open, a tap opens the SOS status sheet | Exempt from every reduction pass. Visible in motion lock, over alert takeovers, on first launch after consent. Operator only; fleet managers do not get SOS |
| **Safety chip** | The highest active tier for me: plate colour + pictogram + word ("WARNING · Seatbelt"); CLEAR when none; "×3" when `occurrences` > 1 | Opens Safety | Mirrors the hero safety field 1:1. Suppressed alerts never show. Offline for more than 10 s: NO SIGNAL plate + "last: CLEAR 10:42". A stale CLEAR is never shown as CLEAR |
| **Connectivity chip** | LIVE · SIM 10:42 ×60 / RECONNECTING… / NO SIGNAL · synced 10:42 | Opens a small sheet: last sync time, what still works offline | Always visible. "SIM" is our honesty label: the clock is the scenario clock |
| **Language** | The active language in its own script: English / हिन्दी / தமிழ் | Opens the language sheet (A01) | One tap from anywhere (shared devices at shift handover) |
| **Ask** | Question-bubble icon + "Ask" | Opens Ask Spotter: a full-height sheet on phones, a 420 px side panel from 1024 px (A17) | Hidden in motion lock and during the first launch |

## 3. Button states (shared by every action)

| State | Visual | Notes |
|---|---|---|
| Default | Primary: ink plate, white label. Secondary: 2 px ink outline on surface. Min `--hit` (80 px); `--hit-dense` 48 px in Detailed mode from 1024 px | At most **one primary button per view** |
| Hover (desktop only) | Label underline | Never carries information |
| Pressed | Surface darkens (ink → #000, outline → `--surface-sunk`), 2 px inset top rule, 80 ms | |
| Focus | 3 px ink outline with a 3 px paper offset (paper outline on dark plates) | Keyboard path matches visual order |
| Disabled | Dashed 2 px `--ink-3` border, `--ink-3` label, **plus a reason line under it** ("Needs vest", "Offline") | A control is never disabled without a stated reason |
| Loading | The label stays; a 3 px indeterminate bar along the bottom edge appears after 300 ms; `aria-busy`; not pressable | |
| Success | Tick + past-tense label ("Started") for 1.2 s, then the next state | Screen readers announce it through `aria-live="polite"` |
| Error | Ink ✕ pictogram + one-line reason + "Try again" under the button; the button is re-enabled | Never red (red means danger) |
| Offline | Disabled style + reason "Needs signal" | SOS is the exception (A10) |
| Requires confirmation | The press opens a confirm sheet: question + primary verb button + "Back" | Only for irreversible actions (Complete, Grant override) |

Idempotency: every action press creates one `request_id` (UUID). A retry of the same intent reuses it, so a double tap or a network retry can never do the action twice.

## 4. Action contracts

Format: **Purpose · Visible when · On press · Success · Failure · Duplicate prevention · Undo · State exceptions** (the states in §3 apply unless listed).

### 4.1 First launch and preferences
**A01 Choose language.** Purpose: set the UI and alert-audio language. Visible: first-launch step 1; the Language chip everywhere. On press: select a plate (English / हिन्दी / தமிழ்); the language name plays aloud (pre-recorded, unlocks audio for later alerts); "Continue" (first launch) or an immediate switch (chip sheet): set the `NEXT_LOCALE` cookie, then `router.refresh()`. Success: the whole UI re-renders in the new script in under 1 s; the sheet closes. Failure: none possible locally. Duplicate: n/a. Undo: choose again. ⚠C: no RPC stores `profiles.language`, so P0 keeps it in the cookie.
**A02 Choose role / Switch user.** Purpose: sign in as the seeded demo persona (Ravi, operator; Anita, fleet manager). Visible: first-launch step 2; "Switch user" at the bottom of the language sheet. On press: sign in → `my_snapshot` → route to `/op` or `/fm`. Failure: "Could not sign in. Try again." Duplicate: disabled while loading. Undo: Switch user. ⚠C: how the client signs in without exposing the demo passwords is undecided (frontend-tasks §5 #9).
**A03 Confirm machine.** Purpose: the operator confirms today's machine. Visible: first-launch step 3 (operators only). Shows "Your machine today: EXC-007 · Cat 320" from `my_snapshot.machine`. On press "This is my machine": continue. "Not my machine" shows "Tell your supervisor" and still continues (P0). ⚠C: there is no pairing RPC, so this step is display-only in P0.
**A04 Give consent.** Purpose: DPDP consent to location, machine and safety data. Visible: last first-launch step. On press "I agree": `rpc consent_set {p_version, p_granted:true, p_request_id}` → Home. "Not now": a plate says "Spotter needs this to keep you safe. Talk to your supervisor." and blocks entry. Failure: error + retry. Duplicate: request_id. Undo: P1 (a "My data" view).
**A05 Simple / Detailed.** Purpose: show only `core` fields, or `core` + `detail`. Visible: a segmented control in the Home and Task title rows (fleet-manager screens are always Detailed). On press: toggle; saved in `localStorage` per user. No server call and no failure states.

### 4.2 Task
**A06 Start task / Resume.** Purpose: begin or resume the task and store its ETA. Visible: Task screen, status `planned | paused | blocked_ppe`, not motion-locked. On press: `rpc task_start {p_task_id, p_request_id, p_eta_p50_min, p_eta_p90_min, p_eta_model_version}`. Success `status:"started"`: the button becomes Pause, the hero word WORKING, and `task.started` updates every view. `status:"blocked"`: **not an error**. The PPE block plate opens (§7). Failure: `invalid_state` → "This task changed. Updating…" + snapshot refetch; `override_expired` → the PPE block plate again; network → error + Try again (same request_id). Duplicate: loading lock + request_id. Undo: Pause. Label: "Start task" when planned, "Resume" when paused. ⚠C: is `task_start` valid from `paused`? Unspecified.
**A07 Pause.** Purpose: stop the clock on the task (break, hazard, handover). Visible: task `in_progress`. On press: `rpc task_pause {p_task_id, p_request_id}` → hero word PAUSED, button becomes Resume. No confirmation (Resume undoes it). Failure / duplicate: as A06.
**A08 Complete.** Purpose: close the task and record its actual time. Visible: task `in_progress` or `paused`. **Requires confirmation**: the sheet says "Complete Excavation? 72 % done, 41 min so far." [Complete] [Back]. On confirm: `rpc task_complete` → hero word DONE, the next planned task becomes current. Undo: none (no reopen in the contract), which is why it asks first. Failure / duplicate: as A06.

### 4.3 Alerts and SOS
**A09 Acknowledge (operator).** Purpose: tell the system "I have seen this", which stops the escalation timer. Visible: on a Warning or Critical takeover when `needs_ack`, and **not** in motion lock (§6). Size `--hit-sos`. On press: `rpc alert_ack {p_alert_id, p_request_id}`. **No optimistic update:** the takeover stays until `AlertAckOut` returns. Success: the takeover collapses into the Safety chip (the colour stays while the condition lasts) and the alert row reads "Acknowledged 10:43"; audio and vibration stop. Failure: "Not sent. Your supervisor will be alerted anyway." + Try again. Offline: the same message, button disabled. Duplicate: loading lock + request_id; an already-acknowledged alert returns its status. Undo: none (and none needed).
**A10 SOS (hold to send).** Purpose: call for help now. Visible: always (operator), including motion lock and over takeovers. On press: hold for 1.5 s. A square border fill runs around the plate (linear), with vibration ticks at 0.5 s and 1.0 s. Releasing early does nothing except show "Hold to send". At 1.5 s: vibrate [100,50,100], then `rpc sos_raise {p_request_id, p_lat, p_lon, p_note:null}` (location from `operator_state.location`, else `machine.location` ⚠C). Success: the SOS status sheet (full screen, red): "SOS SENT 14:03:12", the dispatch line from `dispatch.*` events ("Telegram to Anita: sent ✓"), and "Calling your supervisor in 58 s unless acknowledged" (countdown to `escalate_at`). Then "Anita acknowledged 14:03:20", or "Calling Anita…". Failure or offline: "Not sent. No signal." + **"Call supervisor"** (a `tel:` link that uses the phone's voice network) + automatic retry every 5 s with the same request_id. Duplicate: while an SOS is open the button reads "SOS ACTIVE" and a tap opens the status sheet; it never raises a second SOS (this also sidesteps the backend dedupe bug, G2-backend #3). Undo: A11. Keyboard: hold Space or Enter for 1.5 s.
**A11 Cancel SOS.** Purpose: withdraw an accidental SOS. Visible: the SOS status sheet, for 10 s after sending (a countdown on the button). On press: `rpc sos_cancel {p_alert_id, p_request_id}` → "SOS cancelled. Your supervisor was told." (Telegram message edited server-side). After 10 s the button is removed; the SOS can then only be resolved by the supervisor. Failure: error + Try again.
**A12 Listen.** Purpose: hear the protocol card or alert text again (the literacy fallback). Visible: on Guardian protocol cards and alert takeovers. On press: replay the pre-generated clip for `kind × lang`. Pressed state while playing; a second press stops it. Missing clip: the button is hidden (never a dead button).

### 4.4 Incidents
**A13 Log incident.** Purpose: record a safety incident or near miss in the ledger. Visible: Safety screen (secondary button); not in motion lock. Sequence (one sheet, three rows, no extra screens): **type** (4 icon plates: Near miss · First aid · Damage · Other) → **how serious** (3 plates: Low / Serious / Injury → `p_severity` 1 / 3 / 5) → **note** (optional text; mic is P1) → [Log incident]. Near miss shows a fixed line: "For learning only, never for discipline" (`p_non_punitive = true`). On press: `rpc incident_log {p_request_id, p_incident_type, p_severity, p_description, p_lat, p_lon, p_non_punitive, p_source_event_id:null}`. An empty note sends the localised type name (⚠C: `p_description` needs at least 1 character). Success: "Recorded #216 · a71b…" (the first 8 hash characters), the sheet closes, the row appears in My incidents. Failure: error + Try again (the draft is kept). Offline: the draft is kept and the button is disabled with "Needs signal" (the queue is P1). Duplicate: request_id. Undo: none (the ledger is append-only). A fleet manager can add a `correction` entry (P1).

### 4.5 Training (the Loop)
**A14 Practise.** Purpose: open the Replay made from my own event. Visible: the "Because of today" card on Home and Training when a `lesson_assignments` row exists with a replay. On press: fetch the replay scenario → Replay intro. Failure: "Could not load the practice. Try again." ⚠C: the `ReplayScenario` schema and the assignment read are not in the contracts yet.
**A15 Choose answer (Replay step and lesson quiz, one component).** Purpose: answer a decision under time pressure. Visible: each Replay step and each quiz question. On press: record `{step, choice, ms}` locally and advance; no per-step server call. When the timer runs out, "no answer" is recorded. After the last step, `rpc replay_submit {p_replay_id, p_choices, p_request_id}` runs automatically (there is no separate Submit button). Success: the score screen. Failure: "Score not saved. Try again." with the answers kept. Duplicate: request_id; the choices are locked after submit. Undo: "Practise again" starts a new attempt.
**A16 Watch lesson / lesson done.** Purpose: the 60-90 s clip plus a 3-question icon quiz (A15). On quiz end: `rpc lesson_complete {p_assignment_id, p_quiz_score, p_request_id}` → "Done" state on the card.

### 4.6 Ask Spotter
**A17 Ask.** Purpose: a shift-aware answer grounded in the manuals and live data. Visible: the Ask chip (not in motion lock). Sequence: type a question (or tap one of 3 suggested questions based on the current alert or task) → optional **photo** (camera or file; compressed on the client to ≤ 1,600 px; uploaded to `ask-photos/{uid}/{uuid}.jpg`) → [Ask]. On press: `functions.invoke("ask", AskRequest)`. Success (`answered`): numbered steps (at most 3 for operators), a RULE plate when `rule` is present, citation chips (title + page), and "Talk to your supervisor" when `handover_to_supervisor`. `refused`: the plate "No answer in the manuals. Ask your supervisor." `degraded`: the answer plus the meta line "Backup model". Failure: "Spotter could not answer. Try again." Offline: disabled, "Needs signal". Duplicate: request_id; the Ask button stays disabled while waiting (p95 target 8 s; the loading bar shows what is happening: "Reading manuals…"). Undo: n/a.
**A18 Log this incident (from Ask).** Visible: only when `proposed_action` is present. Label "Review and log". On press: opens A13 prefilled with the type and description. **The model never writes by itself; the operator confirms in A13.**

### 4.7 Fleet manager
**A20 Acknowledge (fleet manager).** As A09, from an Inbox row (`alert_ack` accepts the fleet-manager role). The row shows "Acknowledged by you 14:03" and the Telegram message is edited server-side.
**A21 Grant override.** See §7. Requires confirmation (the sheet is the confirmation).
**A22 Verify ledger.** Purpose: recompute the hash chain. Visible: Ledger screen, always. On press: `rpc ledger_verify {p_from:1, p_to:null}`. Loading: "Checking 214 entries…". Success ok: a CLEAR plate "Chain intact · 214 entries · head a71b…". Success not ok: a CRITICAL plate "Chain breaks at #187 (hash mismatch)", the row is highlighted, and expected vs stored hashes show in detail. Failure: error + Try again. Duplicate: disabled while running (it is a read, so repeats are harmless). Undo: n/a.
**A23 Compare with Telegram.** Purpose: check the database against the root that was published outside it. Visible: each checkpoint row. On press: `rpc ledger_root_check {p_root_id}` → match: CLEAR "Matches the root sent to Telegram at 13:05 (message #812)"; mismatch: CRITICAL "Database root ≠ published root". Both roots are shown in full (monospace, grouped by 4) so the demo can hold the phone's Telegram message next to the screen. That comparison by a person is the real external witness (G2-backend #4).
**A24 Show on map.** Navigation from an Inbox row or a Guardian takeover to the Map, centred on the machine, with that alert's ring highlighted.

### 4.8 What is deliberately not a button
- No "dismiss" on Warning or Critical: they leave when acknowledged or resolved.
- No "Request override" on the operator side: `ppe.missing` already lands in the fleet manager's Inbox, so the operator sees "Supervisor notified" (§7).
- No settings screen in P0: language is the chip, Simple/Detailed is on Home, and switching user is in the language sheet.
- No "refresh": Realtime plus the snapshot refetch on reconnect keep screens current.

### 4.9 Director (demo only; the states are simpler: default / loading / done / error)
Buttons map one-to-one to `DirectorCommand`: New run (scenario `review1`, speed) · Play · Pause · Speed 1× / 10× / 60× · Jump to beat 1-5 (preset `sim_offset_ms`) · Inject: vest on, seatbelt off, seatbelt on · Publish checkpoint · Tamper #N (edit) · Tamper #N (rehash) · Dry run on/off (shown as a large state label, because a live demo in dry-run mode would silently skip the call). Each sends `DirectorRequest {request_id, command}`, and the response `message` is shown in a log list. A persona switch opens the demo personas in two browser windows side by side.

## 5. Alert tiers

| Tier | Trigger examples | Screen | Vibration (Vibration API) | Audio | Needs Acknowledge | Escalation (server) |
|---|---|---|---|---|---|---|
| **Info** | Idle excess, weather note | A row in the Home/Safety feed. Chip unchanged | none | none | no | none |
| **Caution** | PPE missing, anomaly on my machine, proximity awareness | A yellow **banner** under the status strip (80 px): pictogram + one line + "›" to Safety. Clears itself when resolved | [200] once | none | no | none |
| **Warning** | Seatbelt off while moving, Guardian < 50 m, proximity warning | An orange **takeover** covering the content area (the chrome and SOS stay): pictogram, WARNING word, one-line cause ("Seatbelt off · 17° slope"), protocol card if any, the escalation countdown ("Supervisor alerted in 14 s"), [Acknowledge] + [Listen], "Show on map" for Guardian | [400,200,400] every 5 s until acknowledged or resolved | TTS clip in the UI language at once, repeated every 10 s (at most 6 times) | yes | Timeout (20 s seatbelt, 15 s Guardian) → Telegram to the supervisor; operator call only if on foot or parked |
| **Critical** | Guardian < 15 m, seatbelt off on a slope over the limit, SOS | The same takeover in red, **full screen including the status strip** (SOS stays on top). Dispatch line: "Supervisor alerted · Telegram sent ✓ · Calling…" | [800,200,800,200,800] every 4 s until acknowledged | TTS at once, repeated every 10 s | yes | External escalation fires **at once**, without waiting for the acknowledgement |

Lifecycle mapping of `AlertStatus`: `open` → shown as above · `acknowledged` → the takeover closes, the chip keeps the colour, the row reads "Acknowledged" · `escalating`/`escalated` → dispatch line "Supervisor alerted / Calling Anita…" · `resolved` → the chip drops to the next highest tier or CLEAR and the row moves to history · `suppressed` → never shown to the operator (fleet managers see a collapsed "Suppressed (n)" group).
Concurrency: only the **highest** tier shows as a takeover. Others queue under it as "+1 more" (the server already suppresses lower tiers). Two Criticals stack, newest first, and each needs its own Acknowledge.
Countdown: computed from `escalate_at` minus the **server** time (⚠C: `server_now` is needed, frontend-tasks §5 #4). The countdown bar is linear and turns into text at 0 ("Supervisor alerted").
Autoplay: audio unlocks with the first tap of first launch (A01). If the browser still blocks it, the takeover shows "Sound blocked, tap Listen" (never silent without saying so).
Unknown event types or alert kinds render as a generic row (`type` + tier), so an additive contract change never crashes the UI.

## 6. Motion-lock view

- **Enter:** at once when `motion_locked` is true. P0 client predicate: `machine.moving && !operator_state.on_foot` (⚠C: ask for a server-computed `motion_locked` so the UI and `can_call_operator` always agree).
- **Exit:** after the machine has been stopped for **3 s** (hysteresis, so the screen does not flicker at walking pace). 160 ms cross-fade back to the previous screen.
- **Layout:** full screen, 8 px ink/paper hazard-stripe frame. Inside: machine code; the **work state word** at `--t-state`; the **safety plate**, full width, with its word; ETA figure and progress bar; one line, "Stop the machine to use Spotter". The connectivity chip sits in the top corner. **SOS stays** bottom-right. Nav, Ask, Language and every other control are gone.
- **Input:** every touch is ignored except the SOS hold. No accidental navigation is possible.
- **Alerts during lock:** Warning or Critical takeovers show **without** an Acknowledge button. In its place: "Fix it: fasten seatbelt, or stop to respond". The alert resolves through the sensor (`alert.resolved`, `via: sensor`) or escalates to the supervisor's Telegram. The server never phones the operator while moving (`dispatch.suppressed {reason:'motion_lock'}`). When the machine stops, any alert still needing acknowledgement shows its Acknowledge button at once.
- Caution under lock: a yellow band inside the frame with one short vibration.

## 7. PPE warning and logged supervisor override

```
Operator (Task screen)                         Fleet manager (Inbox)
A06 Start task → task_start → {blocked, missing:[vest]}
BLOCKED plate: blue mandatory sign "Wear vest"
  + TTS "पहले जैकेट पहनें" + "Supervisor notified"      ← ppe.missing (caution) arrives as an Inbox row
Start: disabled, reason "Needs vest"                    Row: CAUTION · PPE missing · Ravi · vest · Excavation
                                                         [Grant override]  (primary on this row only)
path A (demo): vest tag seen → ppe.restored
  plate: "Vest detected ✓", Start enabled
  → operator presses Start → started
                                                        path B: A21 Grant override → sheet:
                                                          "Let Ravi start without: vest"
                                                          Reason (required, 10-500 chars, counter)
                                                          two quick reasons: "Tag faulty, checked in person"
                                                          · "Vest on, sensor not reading"
                                                          [Grant 15-min override]  [Back]
                                                          → rpc ppe_override {p_task_id, p_reason, p_request_id}
                                                          → "Recorded in ledger #215 · valid until 14:17"
path B arrives: ppe.override_granted
  plate: "Override by Anita · until 14:17 · ledger #215"
  Start enabled → operator presses Start → started
```
A21 contract. Purpose: allow one start without the missing PPE, with who, why and when recorded in the ledger. Visible: an Inbox row of kind `ppe_missing` whose task is `blocked_ppe`. Success: the row reads "Override granted · until 14:17 · #215". Failure: `forbidden` → "Only a fleet manager can grant this"; `invalid_state` → "Task is no longer blocked"; `validation` → counter turns into the error line; network → error + Try again. Duplicate: request_id + the button locked while loading. Undo: **none** (append-only ledger). The sheet says so: "This is recorded permanently. It expires in 15 minutes." Expiry: if the operator starts after `valid_until`, `task_start` returns `override_expired` and the operator sees the BLOCKED plate again (⚠C: whether a new `ppe.missing` re-notifies the fleet manager is unspecified).

## 8. Offline matrix (P0: cached last snapshot, no action queue)

| Thing | Offline behaviour |
|---|---|
| Chips | Connectivity → NO SIGNAL · synced HH:MM. Safety → NO SIGNAL plate + "last: <state> HH:MM" after 10 s |
| Hero, tasks, map | Render from the cached `my_snapshot` (saved to `localStorage` on each successful fetch) with an "as of HH:MM" stamp and dashed rules |
| SOS | Enabled. Retries every 5 s + "Call supervisor" `tel:` fallback |
| Start / Pause / Complete / Acknowledge / Log incident / Ask / Practise | Disabled with "Needs signal". The incident draft is kept |
| Reconnect | Rejoin private channels → Broadcast replay (≤ 25) → `my_snapshot` refetch → chips return to LIVE |
