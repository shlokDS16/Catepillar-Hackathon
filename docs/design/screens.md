# P0 screens

- Status: design plan **v2** (ui-ux-lead, 2026-09-23). v2 codes against api-contracts revision 3 and adds D10 training and the human-verified ledger witness.
- Actions (A- and T-numbers) and chrome are in interaction-map.md; tokens are in visual-language.md.
- Hierarchy: **L1** immediate safety · **L2** current task · **L3** progress / ETA · **L4** recommendations and insights · **L5** history, training, analytics · **L6** settings.
- Fields are **core** (Simple mode) or **detail** (Detailed mode). FM screens are Detailed.
- Shared states:
  - **Loading:** outline plates at final size, no shimmer.
  - **Error:** ink ✕ + one line + Try again.
  - **Offline:** cached snapshot with an "as of HH:MM" stamp.
  - **Honesty:** "assumed" tags from `ASSUMED_FIELDS` and "SIM" in the connectivity chip.

## 0. The signature: hero card

The same shape and position on Home at every breakpoint. **The motion-lock view is this card at full screen.** Only values and colours change.

```
┌────────────────────────────────────────────┐  3 px ink rule, --surface, radius 0
│ EXC-007 · Cat 320 [assumed]                 │  --t-label ink-2       detail: model, "moving 6 km/h"
│ WORKING                                     │  --t-state (the largest text on any screen)
├────────────────────────────────────────────┤
│ Excavation · Bay 3                          │  --t-title
│ 72 %  ███████████████████░░░░░░░             │  --t-figure (tnum) + 12 px ink bar, ticks at 25/50/75
├──────────────────────┬─────────────────────┤
│ ETA                  │ ┏━━━━━━━━━━━━━━━━━┓ │
│ 18 min               │ ┃ ✓ CLEAR         ┃ │  safety field = filled state plate
│ up to 24             │ ┗━━━━━━━━━━━━━━━━━┛ │
├──────────────────────┴─────────────────────┤  detail ↓
│ Why: heat +22 % · novice +15 %          ›   │
└────────────────────────────────────────────┘
```

| Field | Source | Tag | Behaviour |
|---|---|---|---|
| Machine code / model, speed | `my_snapshot.machine` | core / detail | static |
| Work state word | FAULT if `machine.health = fault`; else by task status (`in_progress` WORKING, `paused` PAUSED, `blocked_ppe` BLOCKED, `completed` DONE, none READY) | core | instant swap |
| Task | `tasks[current].task_type` + zone | core | "No task started · next: Trenching 11:00" |
| Progress | `tasks[current].progress_pct`, updated by `task.progress` every 10 % (UI-1) | core | 320 ms tween |
| ETA | `eta_p50_min` "18 min", `eta_p90_min` "up to 24" | core | 320 ms tween |
| Safety field | highest active tier | core | instant; 480 ms stamp when the tier rises or on `upgraded_from` |
| Why | top 2 of `eta_factors: EtaFactor[]`, with "assumed" when `assumed` | detail | the card is one link to Task |

- The state word uses `min(var(--t-state), 18cqi)` and may wrap to 2 lines.
- Width: 100 % below 640 px; 480 px from 1024 px.
- Offline: "as of" stamp, dashed rules, NO SIGNAL. Error: the last values stay, with "Not updated".
- Not on the card: the clock, weather, alert text, radar.

## S0 First launch `/start` (operator 4 steps; FM 3)
1. **Language:** three 96 px plates with native names and audio (A01).
2. **Who are you:** Ravi (operator) / Anita (fleet manager), via `demo-login` (A02).
3. **Your machine:** `pair_machine` with the code field + suggested chip (A03). Skipped with a ✓ line when `paired_machine_id` is already set.
4. **Your data:** three icon lines, including "Kept for 90 days", then [I agree] (A04).

No chrome; SOS appears after consent. Offline: "Needs signal to start", except step 1.

## S1 Home `/op`
| Level | Content | Tag |
|---|---|---|
| L1-L3 | Hero card | §0 |
| L3 | **Conditions row:** heat pictogram · "WBGT 31 °C" · "peak 44 °C forecast by 14:00" (`forecast_peak_c/at`, labelled "scenario forecast") · "ETA +22 %". Ink outline (colour only through an alert) | core: WBGT; detail: forecast, ETA impact, `weather.source_label` (e.g. "Open-Meteo archive, CC BY 4.0": a licence attribution, so it must be visible in Detailed mode) |
| L4 | **Loop card:** "Because of today 10:42 · seatbelt off on a slope" → [Practise · about 3 min] (T1) + "Lesson · 4 cards" | core |
| L2-L3 | Today's tasks: time · task · state · ETA; the current row has a 6 px ink bar | core; detail: p90 |
| L6 | Simple / Detailed (A05) | core |

Empty: "No tasks today. Ask your supervisor." From 1024 px: hero on the left, the rest on the right.

## S2 Task `/op/task`
| Level | Content | Tag |
|---|---|---|
| L1 | PPE block plate: blue mandatory sign per missing item, "Supervisor notified", then "Vest detected ✓" / "Override by Anita · until 14:17" / "Override expired" | core |
| L2 | Title, state word, primary Start task / Resume / Pause (A06/A07), secondary Complete (A08) | core |
| L3 | Progress, ETA, elapsed | core; detail: elapsed, planned start |
| L4 | Why this estimate: factor rows ("Heat +22 %"), with "assumed" tags | core: top 2; detail: all + model version |

P1: the what-if slider.

## S3 Safety `/op/safety`
| Level | Content | Tag |
|---|---|---|
| L1 | Active alerts (those that need Acknowledge first) with status lines | core |
| L2 | Checks: **Seatbelt** (`machine.seatbelt_fastened`: Fastened / Off / Unknown) · **PPE** (4 items ✓/✗) · **Proximity** (`operator_state.nearest`: "Person 22 m · awareness", or "Nothing near") · **Conditions** (WBGT). Ink unless a live alert colours them | core; detail: timestamps, assumed tags |
| L3 | [Log incident] (A13) | core |

Empty alerts: a CLEAR plate "No active alerts". (My-incidents list: P1; the FM Ledger holds the record.)

## S4 Map `/op/map` and Fleet Map `/fm/map`
| Level | Content | Tag |
|---|---|---|
| L1 | Guardian protocol card (bottom sheet): `ProtocolCard.title`, 3 steps, "Move upwind: go north" when `upwind_hint`, wind arrow, distance, [Listen], Acknowledge when needed | core |
| L2 | Me (dot + 15 m / 50 m rings), my trail, machines by health (ok = outline, caution = yellow, fault = red + pictogram), anomaly positions (`AnomalyDetected.lat/lon`), zones | core |
| L6 | Zoom +/-, "Centre on me" (80 px) | core |

- FM variant: all operators and machines; a machine popover shows the anomaly explanation and cost.
- Basemap: OpenFreeMap `positron`. Fallback: the paper site plan.
- Offline: last positions with "as of"; Guardian card hidden.
- P1: the nearby list. The radar is merged into the rings (Decision for Shlok, frontend-tasks top).

## S5 Training (D10)

### S5a Training `/op/training`
| Level | Content | Tag |
|---|---|---|
| L4 | Assignment card per `assignments[]`: event line, [Practise] (T1) when `replay_id` is set, and "Lesson · 4 cards" | core |
| L5 | Done: the last attempt's three scores and the lesson quiz score | core: scores; detail: dates |

Empty: "Nothing assigned. Well done." plus the two lessons, which can be opened freely.

### S5b Replay `/op/training/replay/[id]`
A "REPLAY · your event 10:42" frame label stays on every phase. A **phase rail** across the top shows BRIEF · INVESTIGATE · DECIDE · DEBRIEF, with the current phase inverted (ink). It is not tappable. The persistent chrome and SOS stay; Ask is hidden.

**Phase 1: Brief** (untimed; T2)
| Level | Content |
|---|---|
| L2 | `brief.title` (the event in one line: "Seatbelt off on a 17° slope · EXC-007 · 10:42") |
| L3 | `brief.situation` (read aloud once) · `brief.goal` ("Find what matters, then decide what to do") |
| L6 | "You have 90 s to look at the evidence" (`time_budget_s`) · [Start] (primary) |

**Phase 2: Investigate** (timed; T3, T4)
| Level | Content |
|---|---|
| L2 | Countdown bar + seconds (ink). "Open the cards you need. Not all of them matter." |
| L3 | **Card grid:** 3-7 closed plates in a 2-column grid (3 from 1024 px), ≥ 80 px high, each with a type pictogram + `title`. An opened plate gets its order stamp ①②③. With `max_open`: "3 of 4 opened" |
| L6 | [Decide now] (primary, disabled until 1 card is opened) |

An open card is a sheet, with content by `EvidenceCard.type`:

| Type | Rendering (all ink on paper; no safety fills) |
|---|---|
| `telemetry_trend` | An SVG line chart per series (speed km/h, pitch °, seatbelt as a 0/1 step band) on a shared time axis, with the event time marked ⚑. No chart library |
| `wind` | A compass arrow from `from_deg`, "18 km/h, gusts 26" |
| `map_snapshot` | The **SitePlan** SVG: zones, trail, machine track, ⚑ (the same renderer as the re-enactment; no map tiles) |
| `fault_code` | Rows: code · severity word · `description` (may be a distractor) |
| `protocol_card` | The fixed `ProtocolCard` steps (fetched by `card_id`) |
| `weather` | Two figures: temperature, WBGT |
| `shift_hours` | "5.5 h on shift" + circadian band word ("after-lunch dip") |

**Phase 3: Decide** (timed per step; T5, T6)
| Level | Content |
|---|---|
| L2 | "Step 2 of 4" · the countdown bar + seconds |
| L2 | `prompt` (read aloud) |
| L3 | `single`: 2-5 choice plates (pictogram + label, ≥ 80 px). `order`: the same plates, which show the assigned numbers 1..n, plus [Confirm order] |

**Phase 4: Debrief** (untimed; T8, T9). Order: what happened → how you did → how you investigated → your decisions → the one rule → next.
| Level | Content |
|---|---|
| L3 | **Re-enactment player:** the SitePlan with the trail drawing itself, the machine marker moving with its heading, the wind arrow and the operator dot. Readouts: sim time, speed, pitch, seatbelt pictogram. Controls: Play/Pause, a scrubber with markers (⚑ event, ⏱ "you responded after 14 s" from `real_response_ms`), Restart, a "10×" label. Caption: "Re-enactment from your recorded data · simulated" |
| L3 | **Scores:** three figures /100 (Safety, Procedure, Efficiency) with ink bars. The count-up is ≤ 1.2 s |
| L4 | **Process trace:** two chip rows, "You" (`process_trace.opened`) over "Ideal" (`process_trace.ideal`). An opened irrelevant card has an outlined ✕ chip; a relevant card that was missed has a dashed "missed" chip. Tapping a chip shows its `relevant[].why` |
| L4 | **Your decisions:** per step, `prompt` · "You: …" · "Safer: …" (`review.best`) · `why` |
| L1 of the page | **The rule to remember:** a plate with a 3 px ink border quoting `rule.text`, the source protocol card, and [Listen]. Pinned above the actions, so it is the last thing read |
| L6 | [Lesson: Seatbelt on slopes] (primary) · "Practise again" · "← Training" |

- Loading between Decide and Debrief: "Scoring…". Error: "Score not saved. Try again." (answers kept).
- A live alert pauses everything (visual-language §5.1).

### S5c Lesson `/op/training/lesson/[code]` (T11, T12)
- **Cards (3-5):** a full-height plate: the kind label (RULE / WHY / HOW / EXAMPLE / CHECK) in `--t-label`, a pictogram or `image_path` illustration (site-signage graphic), the `title` in `--t-title`, the `body` in `--t-body`. The audio plays on open, with [Listen]. [Next] / "← Back"; progress "2 / 4".
- **Quiz (3):** the prompt, then 2-4 icon plates. After a tap, the ✓/✕ reveal and `why` with audio, then [Next].
- **End:** "2 of 3 correct" → "Done ✓" → back to Training.
- P1: `video_path` (a Flow clip) on card 1 if one is generated.

## S6 Ask Spotter (sheet; A17, A18)
| Level | Content |
|---|---|
| L1 | RULE plate (`rule.text`, cited source) + "Talk to your supervisor" when `handover_to_supervisor` |
| L2 | Numbered steps (≤ 3 for operators), each with citation marks |
| L4 | Citation chips (title · page); photo chip "Looks like: {category} · {confidence}"; "Review and log" when `proposed_action` is set |
| L6 | Text field, photo, [Ask]; 3 suggested questions; footer "Answers come from site manuals. Your supervisor decides." |

States: "Reading manuals…" · refused (by `refusal_reason`, interaction-map A17) · degraded meta · error · offline.

## S7 Inbox `/fm`
| Level | Content |
|---|---|
| L1-L2 | Needs action: open alerts sorted by tier, then time. Row: tier plate · kind · operator · machine · age · ×occurrences · dispatch line · Acknowledge (A20) / Grant override (A21) / Show on map (A24). `alert_flood` and `ledger_tamper` appear here |
| L3 | Acknowledged / escalated (collapsed) |
| L5 | Resolved, Suppressed (n) (collapsed) |

P1: filters, the row timeline, the global FM critical banner (Anita's out-of-band channel in P0 is Telegram).

## S8 Analytics `/fm/analytics` (evidence card)
Title: "Evidence · simulated data · synthetic cohort".
| Block | `EvidenceKey` |
|---|---|
| Detection | `detector.precision` / `detector.recall` per `details.type`, with n |
| ETA | `eta.mae.model` vs `eta.mae.organiser` (two bars) · `eta.p90_coverage` |
| Impact (**the one chart**) | `loop.repeat_rate.assigned` vs `loop.repeat_rate.control` (two bars), titled "How we would measure impact" |
| Operations | `fleet.idle_pct` (detail: `fleet.idle_pct.by_model`) |
| Ask Spotter | `rag.hit_at_5`, `rag.faithfulness` (n = 20) or "Evaluation in progress" |

Missing key → "Not computed yet". Hand-drawn SVG bars, no chart library.

## S9 Ledger `/fm/ledger`
| Level | Content |
|---|---|
| L1 | Two result plates, side by side from 1024 px: **Internal check** (A22: "Chain intact · 214" / "Chain breaks at #187") and **Telegram witness** (A23: "Matches your Telegram checkpoint · 214" / "Does not match"). Each says which question it answers: "The database agrees with itself" / "The database matches what you received outside it" |
| L2 | [Verify ledger] (primary) |
| L2 | **Compare with Telegram panel:** (1) "Open the SPOTTER-LEDGER message in your Telegram." (2) A paste field (monospace, 3 lines). (3) From / To number fields (auto-filled from the paste, editable). (4) [Compare] (secondary) |
| L3 | **Side-by-side hashes** after Compare: for the root and for the head, two aligned rows, "From your Telegram" above "Recomputed from ledger rows now", 64 hex characters in 16 groups of 4, `ui-monospace`. The first differing group is boxed in ink and the first differing character is marked ▲. Leaf count: "n = 214 · 214" |
| L5 | Entries table: # · time · type · operator · machine · hash (8 characters) · "for learning" tag. The broken row is highlighted after a failed Verify |

- Footer: "Externally witnessed, human-verifiable. The Telegram side is only what you pasted." (the exact claim from event-pipeline §5).
- Parse failure: "This is not a Spotter ledger line. Type the range from the message instead."
- Empty: "No entries yet". Phone layout: hashes wrap as 4 groups per line, and the two rows interleave line by line, so they stay aligned.

## S10 Director `/director`
The §4.9 buttons, grouped as Run (incl. rehearsal, purge) · Time · Inject · Ledger · Safety switch, plus a response log. English only.

## i18n rules (all screens)
- **Stack:** next-intl, cookie locale (`NEXT_LOCALE`), no routing (Next 16 uses `proxy.ts`; we need neither). Messages in `apps/web/messages/{en,hi,ta}.json`, one namespace per screen plus `chrome`, `alerts`, `enums`, `replay`.
- **Coverage P0:** English + Hindi (LLM draft, then a native read). Tamil is P1: fonts, locale and switcher in P0; the first P1 item is the glance layer (about 60 keys).
- **Register:** spoken site Hindi; state words and phase names are one word each.
- **Never:** concatenation, text in images, fixed-width text boxes, letter-spacing on Indic scripts. Design for 2× expansion and QA at 360 px.
- **Backend `I18nText`** (briefs, evidence titles, prompts, `why`, rules, lesson cards): active language, else English with an "(English)" tag.
- **Audio:** alert clips per kind × `hi`/`en`. Replay situation and prompt clips and lesson card clips per id × lang (⚠C UI-17, frontend-tasks §5). When a clip is missing, [Listen] is hidden and the text stays.
