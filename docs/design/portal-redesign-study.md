# Portal redesign study: operator (/op) and fleet manager (/fm)

- Status: study and proposal only (ui-ux-lead, 2026-11-12). No app code changed.
- Built from `origin/main` at c34086a, production build on :3220, fixture mode ("FIXTURE 09:40 ×10").
  Walked with Playwright at 375 × 812 and 1440 × 900. SOS was never pressed: `/api/sos*` was blocked
  in the browser for the whole session.
- Screenshots of the current product are in `docs/design/portal-study/current/`. The mockups are in
  `docs/design/portal-study/mockups/`, rendered to `docs/design/portal-study/png/`.
- Read first: visual-language.md (Site Signage), ui-framework.md, training-guidelines.md, screens.md
  (S1, S5, S5b, S5c, S7), landing-dossier.md, rival-teardown.md §3-4, AGENTS.md (design section).

---

## 1. How the simulation and learning work today, in plain words

### 1.1 The loop the product promises
1. **Event.** Something unsafe happens on shift and is recorded. In the fixture, EXC-007 moved at
   6.2 km/h on a 17° slope on Bench 3 at 09:40 with the seatbelt off.
2. **Replay.** The server turns that event into a practice (`build_replay`): an authored template
   for that event type, filled with the event's real numbers and the frames around it.
3. **Lesson.** The same event assigns a short lesson (3-5 cards and 3 quiz questions). It teaches
   the same rule the replay quotes: one event, one rule, two forms.
4. **Recurrence.** If the operator does the same thing again, the loop runs again. In P0 nothing
   on screen shows this yet: there is no "last time / this time" view.

The Home "loop card" ("Because of today 09:40 … Practise · about 3 min") is the link between
step 1 and steps 2-3. **On main it is not rendered**: Home shows the hero, a WBGT line and today's
tasks only (`current/op-home-375.png`).

### 1.2 What the operator sees and does, step by step
| Step | What is on screen | What the operator does | What is scored |
|---|---|---|---|
| Training page | "New to practice?" card with [How practice works], then a stub: "Coming in a later task. (F17)" (`op-training-375-viewport.png`) | Opens the guide. **There is no list of assigned practices, so a replay cannot be reached from the UI.** I opened it by its fixture URL. | — |
| Guide (sheet, auto-opens on first visit) | 4 steps with a phase strip and a small animated figure: Brief ("you are told what happened, no clock"), Investigate ("which cards and in what order are both scored, 60 s, up to 4 cards"), Decide ("every step has its own clock, no answer counts as missed"), Debrief ("your path next to the safest one; scores are for learning") (`guide-step1..4-375.png`) | Next / Back / Skip / Got it | — |
| 1 Brief | Frame label "REPLAY · your event 09:40", phase rail, "Practice rebuilt from your recorded event · simulated", the event line, situation, goal, "You have 60 s to look at the evidence", [Start] (`replay-1-brief-375.png`) | Reads, presses Start. No clock. | — |
| 2 Investigate | Countdown (60 s) and bar, "Open the cards you need. Not all of them matter.", 7 card plates (Speed and pitch, Wind, Site map, Fault codes, Protocol card, Weather, Hours on shift), "n of 4 opened", [Decide now] disabled until one card is open (`replay-2-investigate-375.png`) | Opens cards; each opens as a sheet (e.g. speed 6.2 km/h and pitch 17.4° vs time, `replay-2b-card-open-375.png`). An opened plate turns grey and gets its order stamp 1, 2, 3 (`replay-2d-…`). | Which relevant cards were opened, minus irrelevant ones, plus agreement of the order with the authored ideal (Speed and pitch → Site map → Protocol card) = **Procedure** |
| 3 Decide | "Step n of 3", a per-step countdown (15, 15, 20 s), the prompt, 2-5 choice plates. Step 3 is an ordering step: tap Park, Report, Resume in order, then [Confirm order] (`replay-3-decide-375.png`, `replay-3c-order-filled-375.png`) | Taps a choice; the next step appears at once, with no feedback. | Choices against the best answer = **Safety**; time used = **Efficiency** |
| 4 Debrief | **Stub on main:** "Debrief opens here. Your score was saved. Your debrief is on its way." (`replay-4-debrief-375.png`) | Back to Training | — |
| Lesson | **No route on main** (`/op/training/lesson/[code]` does not exist). The guide and Home never link to one. | — | quiz score (practice, not assessment) |

The specified Debrief (screens.md S5b, training-guidelines §6) is the payoff of the whole loop:
re-enactment of the operator's own event on the site plan, three scores, "You" vs "Ideal" chip
rows, per-step "You / Safer / why", the one quoted rule with [Listen], then [Lesson].

### 1.3 What is strong
- **The idea is right and rare.** Practising your own recorded event, scored on *what you looked
  at and in what order*, is a better training model than generic quizzes. The rival has nothing like it.
- **Honesty is built in.** "Simulated", "rebuilt from your recorded event", "assumed" appear where
  they should.
- **The guide is clear and short.** Four steps, one idea each, readable at 375 px.
- **Investigate works.** Large card plates, order stamps, a visible cap ("3 of 4 opened"), a gated
  [Decide now] with its reason ("Open at least one card").

### 1.4 What is confusing
1. **The loop has no visible start or end.** No assignment list, no loop card on Home, no Debrief,
   no Lesson. An operator cannot get from "my event" to "my rule".
2. **Decide gives no feedback between steps.** A wrong or timed-out answer vanishes. Under a 15 s
   clock this feels like a test, against the guide's own "for learning, not punishment".
3. **The clock is anxious and hidden.** At 375 px the ordering step's [Confirm order] sits under the
   bottom nav (a real click failure during the walk); the operator ran out of time with every action
   numbered (`replay-3c-order-filled-375.png`, "4 s left").
4. **Selected = primary.** A numbered choice plate turns solid ink, the same look as the primary
   button, so "chosen" and "press me" are indistinguishable.
5. **Labels mean little to a novice.** "Protocol card", "Hours on shift", "Procedure" and
   "Efficiency" are supervisor words. The guide says "safest path"; the debrief spec says "Ideal".
6. **The chrome competes with the simulation.** The live CLEAR plate, FIXTURE clock, language
   button, Ask, 5-item nav and a floating SOS stay on every phase and cover choice plates
   (`replay-3c-…`, SOS over "Resume").

---

## 2. Screen-by-screen audit (current main)

### Operator Home `/op` (`current/op-home-375.png`, `op-home-1440.png`)
1. **Nav overflows at 375 px:** five items do not fit; "Training" is clipped to "Trainin".
2. **The floating SOS covers content** (the task list and status chips) instead of owning a slot.
3. **CLEAR appears twice** (top bar plate and hero plate). Rule 4 "one loud thing" is broken by the
   duplicate, and the hero's own READY is the smaller of the two at 1440.
4. **The loop card and conditions detail are missing**, so Home has no "what next for me" beyond tasks.
5. **Desktop is a sparse two-column page** with a large empty right side; "Simple / Detailed"
   sits in the content like a primary control.

### Training `/op/training` and the guide (`op-training-375-viewport.png`, `guide-step*-375.png`)
1. The page is a stub after the guide card; nothing assigned is listed.
2. The guide sheet shares the screen with the floating SOS, which covers the sheet's bottom-right.
3. The guide auto-opens on first visit, which is good, but it cannot be found again except through
   the card, and its figures are small for their meaning.

### Replay `/op/training/replay/[id]` (`replay-*.png`)
1. Primary action hidden under the bottom nav at 375 px (Confirm order).
2. The sticky status bar overlaps the frame label and phase rail when the page scrolls.
3. Selected choices look like primary buttons; there is no between-step feedback.
4. Debrief is a stub, so the scoring is invisible: the operator never sees why.
5. The phase rail is text-only and small (15 px condensed); it reads as tabs, but cannot be tapped.

### FM Inbox `/fm` (`fm-inbox-375.png`, `fm-inbox-1440.png`)
1. **"Inbox" heading twice** (page title and section title).
2. **Every alert is the same giant plate** at 1440 (full 1250 px width, 80 px buttons); six alerts
   need two screens. Detailed mode's 48 px dense targets are not used.
3. **No selected/detail state:** the manager cannot see an alert's evidence, dispatch timeline or
   machine location without leaving the list.
4. The "Ledger changed" critical has no operator, no machine and no explanation line, only "just now".
5. No counts at a glance (tiers, oldest open).

### FM Map `/fm/map` (`fm-map-1440.png`)
1. **The map canvas renders at about 400 × 320 px** in the top-left of a 1300 px column, with the
   attribution floating separately below: a sizing bug.
2. "Centre on me" covers the marker; a fleet manager has no "me" on site.
3. The machine list is one chip with no state.

### FM Ledger `/fm/ledger` (`fm-ledger-*.png`)
1. Opens empty: two "Not checked yet" panels and "Verify the ledger to list entries". The demo's
   strongest proof needs a click before it shows anything.
2. Paste field, compare and verify controls compete at the same weight.
3. The hash column is unreadable at 375 px.

### FM Analytics `/fm/analytics`
Stub on main: "Coming in a later task. (F20)".

---

## 3. Redesign directions

All three keep the non-negotiables: safety colours (caution, warning, critical, clear) only for a
live state, always filled with a 2 px ink border, plus pictogram plus word; 80 px operator targets,
108 px SOS; operator text ≥ 15 px; Barlow / Barlow Condensed plus Noto Devanagari; no shadows used
for elevation; no Caterpillar marks, no yellow-and-black surfaces; light default for sunlight.

### Direction A: "Signage, Re-gridded" (evolve, do not restyle)
**Idea:** keep Site Signage as it is and fix the structure: one dock, one state plate, one grid.
- **Why it fits operators:** nothing new to learn; it repairs the measured defects (nav overflow,
  floating SOS, duplicate CLEAR, hidden primary actions) that hurt gloved use today.
- **Type scale:** unchanged (`--t-state` 56-96, `--t-figure` 48, title 26, body 18, label 18, meta 15).
- **Colour tokens:** unchanged (`--paper #F2F0EA`, `--surface #FBFAF6`, `--ink #16150F`, states as today).
- **Surface:** 3 px plates. A **dock** replaces nav + floating SOS: 4 destinations + SOS in a fixed
  108 px slot (mobile bottom, desktop left rail). Map folds into Safety. Desktop Home is a grid:
  hero left (480 px), loop card, conditions, tasks right.
- **Motion:** unchanged (§5 and §5.1).
- **Relation to the landing:** shares paper, ink and Barlow only; the landing feels like a different product.
- **Never:** add a sixth nav item; float anything over content; show the state plate twice.
- Mockups: `png/a-home-*.png`, `png/a-debrief-*.png`, `png/a-inbox-*.png`.

### Direction B: "Ink Frame" (the landing's family, the work stays on paper)
**Idea:** the landing's ink stage becomes the portal's *frame* (status band and dock); the work
surface stays paper; the one simulation payoff (the re-enactment) plays on an ink "theatre".
- **Why it fits operators:** the frame is the darkest, most stable thing on screen, so the eye
  learns "the edges are chrome, the middle is my work". The live state plate sits on ink at the top
  left, always in the same place, the only colour in the frame. Work content stays ink-on-paper for
  sunlight. Mono captions carry provenance (SIM / LIVE, age) in a voice the landing already uses.
- **Type scale:** state word `clamp(64px,17vw,112px)/.9` Barlow Condensed 800, tracking −0.03em
  (Latin only; 0 for Devanagari); figure 52/1 tnum; title 26/1.15 −0.01em; body 18/1.45; caption
  `ui-monospace` 15/1.3 +0.04em uppercase (13 only in FM detailed mode); section labels "01 — Now".
- **Colour tokens (new):** `--frame #16150F` (= ink), `--on-frame #F2F0EA` (16:1),
  `--on-frame-2 #B9B5AA` (≈ 9:1 on ink, for captions), `--frame-rule #3A382F`. Everything else as today.
- **Surface:** frame bands are ink, no radius; paper sections separated by 1 px ink section rules
  with numbered mono labels (the landing's spec callout); one 2 px plate for the call to action;
  3 px plate only for the rule-to-remember. FM desktop is a split view: queue | detail.
- **Motion:** Site Signage everywhere; inside Replay the §5.1 carve-out, plus the landing's quint
  ease for the theatre's scrubber. The landing's circle wipe from the CTA lands on the portal's ink
  frame, so the hand-off from landing to app is continuous.
- **Relation to the landing:** same ink, same paper, same condensed display with negative tracking,
  same mono counters. It reads as the inside of the same building.
- **Never:** put working content on ink (glare); use the landing's glass pill, blur or WebGL in the
  portal; use a safety colour in the frame except the live state plate and SOS; mono below 15 px
  for operators.
- Mockups: `png/b-home-*.png`, `png/b-debrief-*.png`, `png/b-inbox-*.png`.

### Direction C: "One Card" (low literacy first)
**Idea:** one big card at a time, every card speaks: pictogram, very large word, [Listen].
- **Why it fits operators:** the least reading of any direction; every card has an 80 px speaker
  button; Debrief becomes four cards (What happened, Your score, Your path, Remember) that can be
  swiped or listened to in order; scores are 5-segment bars, not numbers alone. Labels use plain
  words ("Safe", "Right steps", "Quick", "Digging", "Time left").
- **Type scale:** state 72-128 / .88 condensed 800; card title 44 condensed uppercase; body 20/1.45;
  label 17 condensed +0.08em; nothing below 15.
- **Colour tokens:** today's; no new tokens.
- **Surface:** full-width 3 px cards, 8 px outer gutter on phones; a 104 px dock with three wide
  slots (Today, Speak, SOS). Desktop lays the deck side by side. FM Inbox becomes a triage view:
  one focus alert, the rest queued.
- **Motion:** card-to-card 160 ms cross-fade; inside Replay, §5.1.
- **Relation to the landing:** shares tokens; mood is warmer and plainer, closer to a field card than to the cinematic story.
- **Never:** hide a live alert behind a card (alerts still take over); put more than one primary
  action on a card; rely on swiping alone (Next is always a button).
- Mockups: `png/c-home-*.png`, `png/c-debrief-*.png`, `png/c-inbox-*.png`.

Content in every mockup comes from `@cat/shared` fixtures (`mySnapshot`, `replayScenario`,
`replayDebrief`, `ledgerVerifyOut`) and the app's own inbox fixtures. The model name in the fixture
was dropped from the mockups. Icons are placeholder glyphs; production uses lucide and the six
drawn pictograms.

---

## 4. Mockup index
| Screen | A Signage, Re-gridded | B Ink Frame | C One Card |
|---|---|---|---|
| Home cockpit | `mockups/a-home.html` | `mockups/b-home.html` | `mockups/c-home.html` |
| Replay Debrief | `mockups/a-debrief.html` | `mockups/b-debrief.html` | `mockups/c-debrief.html` |
| FM Inbox | `mockups/a-inbox.html` | `mockups/b-inbox.html` | `mockups/c-inbox.html` |

PNGs: `png/<name>-375.png` and `png/<name>-1440.png` (full page; at 375 the fixed dock is captured
at the end of the page). No horizontal scroll at either width.

---

## 5. Recommendation and phased plan

**Pick: B "Ink Frame", with two things borrowed from C.** B fixes every structural defect A fixes
(it has the same dock and grid), makes the portal and the landing one family for the judges, and
gives the Debrief a stage worthy of being the product's payoff without breaking the
sunlight rule. From C take (1) the plain-word labels and the [Listen] button on every Debrief
section, and (2) the FM triage focus (one critical alert expanded) as the Inbox's mobile layout.
A is the fallback if time runs short: it is phase 1 of B anyway.

| Phase | Screens | Work | Rough effort |
|---|---|---|---|
| 1 Chrome | All /op and /fm | Frame tokens; ink status band with one state plate; dock with SOS slot (removes floating SOS, fixes nav overflow, frees primary actions); FM left rail | 1 day |
| 2 Payoff | Replay Debrief (F-task not yet built), Decide feedback | Build the Debrief in B (theatre + scores + path + decisions + rule + Listen); a 240 ms ✓/✕ reveal between Decide steps; selected state ≠ primary (outlined + number badge) | 2-3 days |
| 3 Loop | Home loop card, Training assignment list, Lesson route | Close the loop so a replay is reachable from the UI and ends in a lesson | 1.5-2 days |
| 4 FM | Inbox split view (desktop) / triage (mobile), Map sizing fix, Ledger auto-verify on open | Detail pane with explanation, sparkline, dispatch timeline, actions | 2 days |
| 5 QA | All | en/hi parity, 360/375/768/1440, reduced motion, contrast checks for the new frame tokens | 1 day |

**Decisions this overturns or amends** (to be logged in decisions.md if approved):
1. visual-language §3 "Elevation: none … layering by a 3 px top rule": unchanged, but adds an **ink
   frame** surface, which the language does not define today.
2. visual-language §2.1 "ui-monospace for ledger hashes only": B uses mono for provenance captions
   and section labels.
3. visual-language §2.1 tracking: B adds negative tracking (−0.03em) on Latin display words.
4. screens.md S1/S5b nav: five operator destinations become four (Map moves inside Safety), and SOS
   moves from a floating button to a fixed dock slot.
5. screens.md S7 Inbox: a split list/detail on desktop replaces the single column of plates.
6. Debrief wording: "Ideal" becomes "Safest" (matching the guide); "Efficiency" becomes "Speed" or
   "Quick" for operators (the contract field names do not change).

## 6. Open questions for Shlok
1. Is dropping Map from the operator nav acceptable, or should it stay as a fifth slot with SOS
   moved into the status band?
2. Should Decide show feedback after each step (learning) or only in the Debrief (measurement)?
   training-guidelines §5 implies the latter; the walk suggests the former helps novices.
3. Do we want the landing's circle wipe to end in the portal's ink frame (requires the landing lane
   and the portal lane to share the frame token)?
