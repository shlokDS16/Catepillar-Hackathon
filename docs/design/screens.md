# P0 screens

- Status: design plan v1 (ui-ux-lead, 2026-09-23). Actions (A-numbers) and chrome are in interaction-map.md. Tokens are in visual-language.md.
- Hierarchy (ui-framework §3): **L1** immediate safety / critical machine state · **L2** current task · **L3** progress / ETA / status · **L4** recommendations, anomalies, insights · **L5** history, training, analytics · **L6** settings, supporting information.
- Fields are tagged **core** (Simple mode, always shown) or **detail** (Detailed mode only). Fleet-manager screens are always Detailed.
- Shared states (use them unless a screen overrides):
  - **Loading:** plate outlines in `--rule-soft` at their final size, with no shimmer. Real content replaces them without layout shift.
  - **Error:** an ink ✕ plate with one line and "Try again".
  - **Offline:** the last cached snapshot with an "as of HH:MM" stamp and dashed rules (interaction-map §8).
  - **Honesty tags:** an "assumed" meta tag on every field in `ASSUMED_FIELDS`. The connectivity chip carries "SIM" on every screen.

## 0. The signature: hero card

The one memorable element. It has the same shape and position on Home at every breakpoint. The **motion-lock view is this card scaled to full screen**, so the operator learns one layout. Only values and colours change, never the layout (research 14 §2, glanceability).

```
┌────────────────────────────────────────────┐  3 px ink rule, --surface, radius 0
│ EXC-007 · Cat 320 [assumed]                 │  --t-label ink-2          detail: model + speed "moving 6 km/h"
│ WORKING                                     │  --t-state, the largest text on any screen
├────────────────────────────────────────────┤  2 px ink rule
│ Excavation · Bay 3                          │  --t-title
│ 72 %  ███████████████████░░░░░░░             │  --t-figure (tnum) + 12 px ink bar on --surface-sunk, ticks at 25/50/75
├──────────────────────┬─────────────────────┤
│ ETA                  │ ┏━━━━━━━━━━━━━━━━━┓ │
│ 18 min               │ ┃ ✓ CLEAR         ┃ │  safety field = filled state plate (colour + pictogram + word),
│ up to 24             │ ┗━━━━━━━━━━━━━━━━━┛ │  the same value as the Safety chip
├──────────────────────┴─────────────────────┤  detail only ↓
│ Why: heat +22 % · novice +15 %          ›   │  top 2 ETA factors (core on the Task screen)
└────────────────────────────────────────────┘
```

| Field | Source (contract) | Tag | Behaviour |
|---|---|---|---|
| Machine code | `my_snapshot.machine.code` | core | static |
| Model, speed | `machine.model_name`, `speed_kmh` | detail | "assumed" tag where listed in `ASSUMED_FIELDS` |
| Work state word | derived: FAULT if `machine.health = fault`; else from the current task status: `in_progress` → WORKING, `paused` → PAUSED, `blocked_ppe` → BLOCKED, `completed` → DONE, none → READY | core | **Instant swap** (no tween) |
| Task | `tasks[current].task_type` (localised) + zone name | core | "No task started · next: Trenching 11:00" when none |
| Progress | `tasks[current].progress_pct` ⚠C (no writer yet) | core | 320 ms tween of the figure and bar. Hidden when unknown (never faked) |
| ETA | `eta_p50_min` → "18 min"; `eta_p90_min` → "up to 24" | core | A number that ticks down with sim time; tween 320 ms |
| Safety field | highest active tier (interaction-map §5) | core | Instant colour change; one 480 ms border stamp when the tier rises; NO SIGNAL when offline > 10 s |
| Why | `tasks[current].eta_factors` top 2 ⚠C (array vs record) | detail | Tap → Task (the whole card is one link to Task) |

Rules:
- **One tap target:** the whole card links to Task. The safety field is not a separate button (the Safety chip is).
- **Width:** 100 % below 640 px; a fixed 480 px left column from 1024 px. The state word uses container units, `font-size: min(var(--t-state), 18cqi)`, and may wrap to 2 lines for Tamil. The card grows in height, never in width.
- **Offline:** an "as of 10:42" stamp in the top-right, dashed internal rules, safety field NO SIGNAL.
- **Loading:** outline skeleton at final size. **Error:** the card keeps its last values with a "Not updated" meta line (a safety display never goes blank).
- **Reduced motion:** every tween becomes 0; the layout is identical.
- **Not on the card** (reduction pass): the sim clock (it is in the connectivity chip), the weather (conditions row), alerts text (chip and takeover), radar.

## S0 First launch `/start` (operator: 4 steps; fleet manager: 3, no machine step)

| Level | Content |
|---|---|
| L2 | One question per step; the step count "1 / 4" in `--t-meta` |
| L6 | Everything else is absent: no chrome and no nav. SOS appears once consent is given |

1. **Language:** three 96 px plates, one per language, each with its name in its own script at `--t-title` (English / हिन्दी / தமிழ்) and a speaker icon. A tap selects the plate and plays the name. Then [Continue]. (A01)
2. **Who are you:** two plates, "Operator · Ravi Kumar" and "Fleet manager · Anita", each with a silhouette. (A02)
3. **Your machine:** a machine silhouette, "EXC-007 · Cat 320". [This is my machine] / "Not my machine". (A03)
4. **Your data:** three icon lines: "Your location and machine data are used to keep you safe" · "Near misses are for learning, never for punishment" · "Kept for {retention_days} days. You can ask to see it." [I agree] / [Not now]. (A04)

States: sign-in loading on step 2; error + Try again. Offline: "Needs signal to start", step 1 still works.
i18n: step 1 is the only screen that shows all three scripts at once, so it preloads both Noto fonts. Everything after step 1 is in the chosen language.

## S1 Home `/op`

| Level | Content | Tag |
|---|---|---|
| L1-L3 | Hero card | see §0 |
| L3 | **Conditions row:** heat pictogram, "WBGT 31 °C · peak 44 °C forecast by 14:00 · ETA +22 %" (cold sites: wind chill). An ink outline, not a state colour: colour appears only if a heat alert is raised | core: pictogram + WBGT; detail: forecast peak ⚠C (no forecast field), ETA impact |
| L4 | **Loop card** (only when an assignment exists): "Because of today 10:42 · seatbelt off on a slope" → [Practise · 2 min] (A14) and "Lesson · 90 s" | core |
| L2-L3 | **Today's tasks:** rows with time · task · work state word · ETA. The current row has a 6 px ink left bar and links to Task. Other rows are plain text (P1: task preview) | core: time, task, state; detail: ETA p50/p90 per row |
| L6 | Simple / Detailed segmented control in the title row (A05) | core |

Empty: "No tasks today. Ask your supervisor." (the hero shows READY). Loading/error/offline: shared.
At 1024 px and wider: hero on the left (480 px), with the conditions row, Loop card and tasks stacked on the right.
i18n: task types and state words come from the `enums` namespace, not free text. The Loop sentence is an ICU message with `{time}` and `{eventType}`, never concatenated.

## S2 Task `/op/task`

| Level | Content | Tag |
|---|---|---|
| L1 | **PPE block plate** (only when blocked): blue mandatory-sign pictogram per missing item + "Wear vest" + "Supervisor notified", then "Vest detected ✓" or "Override by Anita · until 14:17 · ledger #215" (interaction-map §7) | core |
| L2 | Task title, work state word, **primary action** (Start task / Resume / Pause; A06, A07), secondary **Complete** (A08) | core |
| L3 | Progress figure + bar; ETA "18 min · up to 24"; elapsed "41 min" | core: %, ETA; detail: elapsed, planned start |
| L4 | **Why this estimate:** factor bars on a ×1.0 baseline ("Heat +22 %", "Novice +15 %", "Machine age +4 %"), each with an "assumed" tag when `EtaFactor.assumed` | core: top 2 as one line; detail: all bars + "model v1 · P90 calibrated" |
| L4 | Conditions line (same as Home) | detail |

Empty: "No task assigned." Motion lock: this screen is replaced by the lock view. Error on an action: inline under the button (§3 of the interaction map).
i18n: factor names come from keys (`eta.factor.heat`); percentages use `Intl.NumberFormat(locale, {style:"percent", signDisplay:"always"})`.
P1: the what-if slider.

## S3 Safety `/op/safety`

| Level | Content | Tag |
|---|---|---|
| L1 | **Active alerts:** alerts that need Acknowledge come first. Each row has a tier plate + cause + time + status ("Acknowledged 10:43", "Supervisor alerted"). A tap reopens its takeover when it still needs acknowledging | core |
| L2 | **Checks** (4 plates, ink unless a live alert colours them): Seatbelt (Fastened / Off) ⚠C (not in the snapshot) · PPE (helmet, vest, boots, gloves ✓/✗) · Proximity ("Person 22 m · awareness") ⚠C · Conditions (WBGT) | core: word + pictogram; detail: sensor timestamps, "assumed" tags |
| L3 | [Log incident] (primary; A13) | core |
| L5 | **My incidents:** the last 10 with #seq, type, time, and a "for learning" tag on near misses | core: type + time; detail: hash prefix |

Empty alerts: a CLEAR plate "No active alerts". Empty incidents: "No incidents logged."
i18n: alert causes are ICU templates with number slots ("Seatbelt off · {slope}° slope"); the numbers come from event payloads, so the text is never generated server-side in one language.

## S4 Map `/op/map` (and Fleet Map `/fm/map`, same component)

| Level | Content | Tag |
|---|---|---|
| L1 | **Guardian protocol card**, a bottom sheet over the map when a hazard is active: fault pictogram, "EXC-014 · hydraulic fault · 38 m north-east", 3 fixed steps from the reviewed card, "Move upwind: go north" with a wind arrow, [Listen] (A12), Acknowledge when still needed | core |
| L2 | **Map:** me (ink dot + dashed Guardian rings at 15 m and 50 m); my trail (ink line: solid for the last 10 min, thin before that); machines as square markers with their code, filled by health (ok = ink outline, caution = yellow plate, fault = red plate + pictogram); zones as outlines with labels, hatched when no-go | core |
| L4 | **Nearby machines list** under the map (distance-sorted, health word, anomaly one-liner "idled 58 %, 2.3× normal, ≈ ₹1,300"). It is also the screen-reader equivalent of the map | detail |
| L6 | Zoom +/- and "Centre on me" (80 px each). Rotation off | core |

Fleet-manager variant: all operators (initials markers), all machines, and a popover on a machine with the anomaly explanation and "Show alert". This replaces the separate anomaly table (the Inbox anomaly filter lists them).
Basemap: MapLibre GL with OpenFreeMap `positron` (keyless; responded 200 today). Fallback when tiles fail or offline: a plain `--paper` background with zones, trail and machines only, which reads as a site plan.
Empty: "Waiting for GPS" (no trail yet). Offline: markers at last positions with an "as of" stamp; the Guardian card is hidden (it could be stale).
Proximity radar: **not built** (reduction): the rings on this map carry the same information. ⚠ This is a deviation from spec M2 ("mini radar on the cockpit") for Shlok to approve.
i18n: map labels (zone names) come from data (`I18nText`). Compass directions are keys (`dir.north`).

## S5 Training `/op/training`, Replay, Lesson

**Training**
| Level | Content | Tag |
|---|---|---|
| L4 | "Because of today" card: the event line, [Practise · 2 min] (primary), "Lesson: Seatbelt on slopes · 90 s" | core |
| L5 | This week: "1 of 2 lessons done"; the list of 2 lessons | core: list; detail: scores |

Empty: "Nothing assigned. Well done." + the lesson list.

**Replay `/op/training/replay/[id]`** (the simulation carve-out applies, visual-language §5.1)
1. **Intro:** the event drawn in ink outline (never a filled safety colour), "Your event · 23 Sep 10:42 · EXC-007 · seatbelt off on a 17° slope", and [Start]. A "REPLAY" frame label stays on every step.
2. **Playback (6 s):** the map snapshot, the trail drawing itself, the machine marker, the wind arrow. [Skip].
3. **Steps (3-4):** the prompt (text + TTS), 2-4 icon choice plates (≥ 80 px), and a timer bar (A15).
4. **Score:** outcome /100 and process /100, plus a per-step review ("You chose … · Safer: …") ⚠C (not in `ReplaySubmitOut`). Actions: [Watch lesson · 90 s], "Practise again", "← Training".
A live Warning or Critical pauses the replay and takes over.

**Lesson `/op/training/lesson/[code]`:** a native video player at full width with a large play control, Hindi voice-over, and captions if supplied. Then 3 icon questions with the same component as the Replay steps. Then "Done ✓" (A16).
i18n: the prompts and choices are `I18nText` from the scenario JSON. If the active language is missing, fall back to English and show an "(English)" meta tag, so languages never mix silently.

## S6 Ask Spotter (sheet; A17, A18)

| Level | Content |
|---|---|
| L1 | For safety answers: a **RULE plate** (ink border, cited source) + "Talk to your supervisor" when `handover_to_supervisor` |
| L2 | Numbered steps (at most 3 for operators) |
| L4 | Citation chips (title · page); "Review and log" when `proposed_action` is present |
| L6 | Input: text field (80 px), photo button, [Ask]; 3 suggested questions from the current alert or task; footer "Answers come from site manuals. Your supervisor decides." |

States: waiting ("Reading manuals…", loading bar) · `refused` plate · `degraded` meta line · error · offline (disabled). The history is in-session only (at most 6 turns). Photo: a preview thumbnail with ✕ to remove before sending.
i18n: questions are sent with `lang`; answers come back in that language. Citation titles are shown as stored (document language).

## S7 Inbox `/fm` (fleet manager)

| Level | Content |
|---|---|
| L1 | **Critical banner** (FM shell, global): a new SOS or Critical shows a red strip "SOS · Ravi · EXC-007 · 14:03 · [Acknowledge]" on every FM screen until acknowledged |
| L1-L2 | **Needs action:** open alerts sorted by tier, then time. Row: tier plate · kind · operator · machine · age · ×occurrences · dispatch line ("Telegram ✓ · Call: no answer") · actions: Acknowledge (A20), Grant override (A21, PPE rows only), Show on map (A24) |
| L3 | Acknowledged / escalated (collapsed count) |
| L4 | Filters: All · SOS · Guardian · Seatbelt · PPE · Anomalies. Anomaly rows carry the plain-language explanation and cost |
| L5 | Resolved, Suppressed (n) (both collapsed) |

Row expand (detail): the event timeline for that alert (raised → dispatched → acknowledged) and the ledger entry number.
Empty: a CLEAR plate "No open alerts". Offline: an "as of" stamp; actions disabled.

## S8 Analytics `/fm/analytics` (evidence card)

Title: "Evidence · simulated data · synthetic cohort" (always visible, never abbreviated).
| Block | Content |
|---|---|
| Detection | Precision / recall per anomaly type with n (table) |
| ETA | MAE: ours vs the organiser's "Estimated time" (two bars) + P90 coverage |
| Impact | **The one chart:** repeat-event rate over weeks, titled "How we would measure impact" (synthetic cohort, never "proven"). Hand-drawn SVG, no chart library |
| Operations | Idle % (fleet, this shift) |
| Ask Spotter | hit@5 and faithfulness, n = 20, or "Evaluation in progress" (G2 cut #1) |
Source: `evidence_metrics` rows ⚠C (final keys, including repeat-event and idle). Empty per block: "Not computed yet".

## S9 Ledger `/fm/ledger`

| Level | Content |
|---|---|
| L1 | The Verify result plate (CLEAR "Chain intact · 214 entries" / CRITICAL "Chain breaks at #187") |
| L2 | [Verify ledger] (primary; A22) |
| L3 | Checkpoints: time, range #1-#214, Telegram message #, [Compare with Telegram] (A23), the result shown inline with both roots in full |
| L5 | Entries table: # · time · type · operator · machine · hash (8 characters) · "for learning" tag; the broken row is highlighted after a failed verify |
Detail: previous hash and full hash per row (monospace, grouped by 4). Empty: "No entries yet".

## S10 Director `/director` (hidden)
A grid of the §4.9 buttons, grouped as Run · Time · Inject · Ledger · Safety switch (dry run), plus a response log. Dry run is shown as a large state label ("DRY RUN: calls OFF"). No i18n (English only; never shown to judges as product UI).

## i18n rules (all screens)
- **Stack:** next-intl **without locale routing**: the locale comes from the `NEXT_LOCALE` cookie, set by A01, then `router.refresh()`. One URL per screen, no `[locale]` segment (Next 16 renamed `middleware.ts` to `proxy.ts`, and we avoid needing either). Messages live in `apps/web/messages/{en,hi,ta}.json`, with one namespace per screen plus `chrome`, `alerts`, `enums`.
- **Coverage in P0:** English (source) and Hindi (complete; LLM draft, then a native read by Shlok or a teammate before the dry run). **Tamil** in P1 (G2 cut #4): fonts, the `ta` locale and the switcher ship in P0. The first P1 item is the glance layer (chrome, nav, hero, alerts, SOS: about 60 keys), which makes the Tamil switch demoable.
- **Register:** spoken, site Hindi ("सीट बेल्ट", not a formal coinage). Keep the loanwords operators use. State words are one short word.
- **Never:** string concatenation, text inside images or video, fixed-width text containers, letter-spacing on Indic scripts.
- **Expansion:** design for 2× on short strings. Nav labels may wrap to 2 lines, and buttons grow in height. QA every screen at 360 px in Hindi, and in Tamil once added.
- **Audio:** pre-generated clips per alert kind in `hi` and `en` (P0; the owner is the TTS decision, ADR-002). The clip follows the UI language, falling back hi → en.
- **Backend text** (`I18nText`: protocol cards, replay prompts, lessons): show the active language or English with an "(English)" tag.
