# Landing v3 spec: one shift, never an empty frame

Status: design spec for the lead (ui-ux-lead, 2026-11-12). Covers https://spotter-five-brown.vercel.app/
(landing only). No app code was changed. It builds on `landing-v2-spec.md` and `landing-dossier.md`; where
they conflict, this file wins. Mockups: `docs/design/landing-v3/mockups/*.html`, PNGs in
`docs/design/landing-v3/png/`, real app captures in `docs/design/landing-v3/captures/`.

## 0. The decision in one paragraph

The scroll story becomes **one simulated shift with one clock**. A persistent **shift tape** (clock, a
06:00-14:00 timeline with the six ledger entries as ticks, and a one-line "now" sentence) sits on every
scene frame and is driven by the same scroll numbers as the 3D. Under it, the five 3D stages share **one
pinned viewport with one copy column** that swaps text at stage boundaries instead of scrolling it away.
Because of that, no frame can lose its words. Before, a stage's copy only appeared in a short reveal window
and then scrolled off with its pin. The six tape ticks are the six ledger rows that stage 6 later
verifies. Row 4 is the 10:44 proximity warning from stage 4, which someone then edits from severity 4 to 1.
So the story ends with one plot point, not seven unrelated demos: the chain catches the edit. Then the
page shows the real product (three captured screens and three role paths). It ends at dusk, on a footer
whose wordmark is drawn from the contour lines of our own terrain function, with the shift's trail traced
through it.

Design read: a scroll-told product landing for an engineering and hiring panel and for operators.
Industrial, calm and precise. It extends the Ink, paper and dawn palette and the Barlow pair. Dials:
VARIANCE 6, MOTION 6 (scroll-scrubbed, every motion explains), DENSITY 5.

## 1. Diagnosis (measured)

The baselines are in `docs/design/qa/landing-audit/before-1440/` (18 of 33 frames dead, thin or flat) and
`before-375/` (14 of 27). The causes, read from `origin/main` code:

1. **Copy lives in short reveal windows.** Each stage's copy uses `.rv-io` with `--a/--b/--c/--d` windows
   (for example stage 4 `--a .05 --b .17`). The pin then holds 250vh of scene with no words: before-1440
   frames 15-17 and 20-22.
2. **The hero is 400vh with an 8-word caption.** `s1b` is the only text from p .44 to 1 (frames 2-8).
3. **Pins scroll out with their copy mid-viewport.** Every boundary is a 100vh hand-off where both copy
   blocks are half off-screen, and the fading stage 5 card leaves an empty dark box (frames 7-8).
4. **The ink wipe is held.** `.l-ink` runs over p .85-1 of a 200vh stage, so the screen is solid ink for
   about 1350 px (frames 24-26, FLAT).
5. **The close is a plain wordmark.** Stage 7 is two lines and a CTA, and then a sticky curtain footer
   that is only "SPOTTER" in Barlow on paper.
6. Also found:
   - **The shipped posters carry the Next.js dev-tools "N" badge.** See the bottom left of
     `public/landing/poster-4.webp`; they were rendered from `next dev`.
   - **The cockpit fixture reads "EXC-007 · Cat 320".** That is a Caterpillar model designation; see
     open question Q1. The mockups mask it.

## 2. Rules this spec enforces

1. Every frame at 450 px (1440) and 406 px (375) steps has at least 10 readable words outside chrome. It
   still has them when the shift tape is also counted as chrome (§10).
2. Copy holds for its whole stage. Motion moves the camera, the readouts and the tape, never the reading
   text away.
3. There is no near-solid frame. The darkest moment is the scene at 60 % ink, with the replay card and the
   tape on top.
4. Every number is simulated and says so. The tape carries a `SIM` plate, readouts carry `SIM`, and the
   caption stays. No new claims: each line maps to a product behaviour listed in `docs/design/screens.md`
   (seatbelt, idle, speed and slope rules; offline queue; proximity rings; replay practice; ledger verify;
   fleet inbox).
5. Reduced motion, no JS and no WebGL each give the complete story as a stack of stills with all words.

## 3. System

### 3.1 One shift, one clock

The simulated shift runs **06:00 to 14:00** (an 8 h shift). The lead suggested 05:40-17:40; I chose 8 h
because the existing replay copy already uses an 8 h window, and because 8 h shifts are the norm on Indian
mine benches (inference, not sourced). Scroll maps to clock minutes per stage. The six ledger entries are
fixed events on that clock:

| Entry | Time | Type (existing enum) | Severity | Tape tier and shape | Shown in |
|---|---|---|---|---|---|
| 1 | 06:32 | seatbelt_breach | 3 | caution, triangle | S2 p .20 |
| 2 | 08:05 | idle_excess | 1 | info, square (`--on-frame-2`) | S3 p .25 |
| 3 | 08:50 | overspeed | 2 | caution, triangle | S3 p .50 |
| 4 | 10:44 | proximity_warning | 4 | warning, triangle (`--state-warning`) | S4 p .45 |
| 5 | 12:05 | slope_alert | 2 | caution, triangle | S5 p .711 (fast-forward) |
| 6 | 13:20 | seatbelt_breach | 3 | caution, triangle | S5 p .90 (fast-forward) |

Tier mapping follows D16 (5 critical, 4 warning, 2 caution, 1 info). Severity 3 is shown as caution.
`ledger-demo.ts` already has these types and severities in this order, and its tamper edits row 4's
severity from 4 to 1. The only change there is to give each row its tape time (§7.B).

### 3.2 Page architecture

```
<main>
 ┌ .l-scene (1050vh desktop / 640vh phone) ─────────────────────────────┐
 │  .l-view  sticky, 100svh: canvas + scrim + copy column + readout + tape │  pinned for the whole scene
 │  band S1  70vh  │ band S2 200vh │ S3 200vh │ S4 220vh │ S5 160vh │ hold 200vh │
 └──────────────────────────────────────────────────────────────────────────┘
 ┌ S6 ledger (margin-top:-100svh, z above the scene) ┐  the paper sheet slides up OVER the held scene
 │  pin 180vh (desktop) │ flow (phone)                │
 └──────────────────────────────────────────────────┘
 ┌ S7 proof (paper) pin 240vh desktop │ flow phone ┐
 └────────────────────────────────────────────────┘
</main>
<footer> in flow (no sticky curtain): contour plate + columns
```

- Bands are empty `section.stage` spacers. They keep their `id="stage-N"`, `tabIndex=-1` and `--p` so
  anchors, focus and the engine still work. The one sticky `.l-view` is the first child of `.l-scene`,
  with `height:100svh; margin-bottom:-100svh`.
- Phone bands (vh): S1 30, S2 140, S3 140, S4 160, S5 110, then a 100vh hold for the paper overlay. S6 and
  S7 are not pinned on phones (they flow), so nothing has to fit in 812 px at once.
- `p_i = clamp((scrollY - bandTop_i) / bandHeight_i)`. It is the same 5-number `ps` array the scene takes
  today, so `setProgress(ps)` is unchanged.

### 3.3 The shift tape (signature element)

Anatomy (desktop, `docs/design/landing-v3/png/stage-hud-1440.png`). It is fixed inside `.l-view`, 24 px
from the left, right and bottom edges, 88 px tall, square corners, `--frame` fill and a 1 px `--frame-rule`
border. It has three cells:

1. **Clock** (196 px): `HH:MM` in Barlow Condensed 800, 46 px, `font-variant-numeric: tabular-nums`.
   Measured: "11:11" and "08:48" are both 152.2 px wide at 64 px, so the digits never jitter. Below it
   sits the `SIM` plate (ink on `--first-light`, 10.5:1) and the label "Shift clock".
2. **Timeline** (flexible): a 2 px rail from 06:00 to 14:00 with hour labels every 2 h (Barlow 12 px,
   `--on-frame-2`), and the six entry ticks at the positions in §3.1.
   - A tick is the product's `<Pictogram>` sign shape (20 px) in its tier colour, with its entry number
     above it.
   - Upcoming ticks are hollow, `--on-frame-2` stroke. The current tick is 26 px with its number in
     `--first-light`.
   - The playhead is a 7 px `--first-light` caret under the rail.
   - The done part of the rail is `--on-frame-2`; the rest is `--frame-rule`.
   - Each tick is a `<a href="#stage-N">` with a 48 x 48 px hit area. Its accessible name comes from
     `tape.goEntry`, and clicking it scrolls to the tick's p (engine already has `onRail`).
3. **Now line** (420 px): a small mono provenance line (`10:44 · LEDGER ENTRY 4`, product mono stack
   13 px) over one sentence in Barlow 500, 18 px, at most 2 lines. Sentences are in §7, keys `tape.lines.*`.

Behaviour:

- **Clock and position**: `shiftClock(ps)` from `shift.ts` (§8.3). The clock is a pure function of scroll,
  never of time.
- **Ticks**: stamp when the clock passes their time. The newly stamped tick does one 180 ms scale
  1.25 → 1 in quint ease, only once per direction. Under reduced motion the tick just appears.
- **Now line**: the latest `LINES` entry at or before the clock. Changes swap with a 120 ms vertical mask
  slide, never an opacity dip below 0.5.
- **Replay mode** (S5 p 0-.55): the clock runs backwards from 11:00 to 10:44. The clock cell shows
  `REPLAY` in place of `Shift clock`. The playhead turns into an outline caret, and the done part of the
  rail turns dashed from the event to the playhead. The now line reads `tape.lines.replay`.
- **Fast-forward** (S5 p .55-1): the clock runs 11:00 → 14:00. Ticks 5 and 6 stamp, and the line ends on
  "Shift closed. Six entries, chain checked."
- **On paper (S6)**: the tape stays in its final 14:00 state as the paper variant (ink on `--paper`, 2 px
  ink border), docked at the bottom of the S6 pin.
- **Hidden**: during S7 and the footer. It slides down 100 % in 240 ms, and is `inert` while hidden.

Phone (`png/stage-hud-375.png`):

- The tape moves to the top, under the nav (top 72 px). It is a two-cell bar: the clock (28 px) with
  `SIM`, and the now line in 15 px.
- The timeline collapses to a 3 px `--first-light` progress line along its bottom edge, with no ticks
  (tick links stay in the DOM for keyboard and screen readers, visually hidden).

Accessibility:

- The container is `role="group"` with `aria-label={tape.label}`. The clock is `aria-hidden` (it changes
  every frame).
- The now line is `aria-live="off"`: announcing it on every scroll would be noise. Each band instead holds
  an `sr-only` sentence with the same facts in DOM order, for example "10:44. Proximity warning. Ledger
  entry 4." So screen-reader users read the shift as text.

### 3.4 Copy column (S1-S5)

- **Position.** One column at the left of `.l-view`: x 64 px, width 452 px, vertically centred in the
  space between the nav and the tape. On phones it is bottom-anchored (16 px gutters).
- **Scrim.** Two gradients behind it:
  - left: ink 86 % → 70 % at 26 % of the width → 0 at 50 %
  - floor: ink 75 % → 0 at 26 % of the height
  - On phones the scrim is top and bottom, as in the mockup.
- **Holding.** All five stage blocks exist in the DOM. Only the current band's block is shown, with
  `visibility` plus a line mask, so the probe sees exactly one.
- **Swap at a band boundary** (the band where `p` crosses 0 or 1):
  - the outgoing lines slide up 100 % inside their overflow masks over the last 3 % of its band;
  - the incoming lines slide up from 100 % over the first 3 % of its band, staggered 60 ms per line;
  - opacity stays 1.
  - The swap takes about 60 px of scroll on desktop, so a 450 px step cannot land on an empty column.
- **Dropped.** The "0N / 07" kickers (numbered eyebrows), `s1b` and the scroll hint all go. The hero keeps
  its one eyebrow, "Bench 3 · first light".

### 3.5 Live readouts (instrument plate)

One plate at the top right (desktop: right 64 px, top 120 px, 336 px wide; phone: a compact 168 px plate
over the scene). It is ink, with a 1 px rule, a `SIM` plate, and a leader line to its 3D anchor where one
exists. Contents per stage:

| Stage | Big figure | Rows | Source |
|---|---|---|---|
| S1 | none (hero stack stays 4 elements) | | |
| S2 | boom angle `34°` | stick °, bucket °, phase (Dig / Swing / Dump / Return / Travel), link (Online / No signal, 2 held / Back, 2 sent) | `getReadout()` pose and phase; link from `shift.ts` S2 beats |
| S3 | cycles `0 → 14` | tonnes moved `0 → 620`, trail % | `getReadout().cycles`, tonnes = `round(620 * trail)` |
| S4 | nearest object `41 → 7.4 m` | state plate (word, pictogram, colour: all three), alert shown in "Cab and fleet inbox", "Entry 4 written" once the clock passes 10:44 | `getReadout().nearestM`, `.ring` |
| S5 | none: the replay card (existing scrub plus chip) takes this slot | scrub window 10:40-10:48 | `shift.ts` |

Rules:

- Figures use Barlow Condensed 800 with tabular numerals. Angles round to whole degrees and distances to
  0.1 m.
- Figures update at most every animation frame. Under reduced motion the plate shows the stage's settled
  value.
- The stage 2 callouts and leaders from v2 stay, and now hold for the whole band.
- The S4 leader runs from the plate to the truck anchor.

## 4. Visual language (extends tokens.css; no replacements)

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--frame` | #16150F (existing) | scene surfaces, tape, plates | |
| `--on-frame` | #F2F0EA (existing) | text on ink | 16.0:1 |
| `--on-frame-2` | #B9B5AA (existing) | secondary text, upcoming ticks | 8.9:1 |
| `--frame-rule` | #3A382F (existing) | hairlines (non-text) | |
| `--paper` / `--ink-2` / `--ink-3` | existing | S6, S7 | 8.0 and 4.95:1 |
| `--paper-2` **new** | #E7E4DB | capture bed in S7 | ink 14.4:1 |
| `--first-light` **new alias** | = `--dawn-horizon` #F1B995 | the one non-state accent: playhead, SIM plate, trail, focus ring | 10.5:1 on ink |
| `--state-*` | existing | ring, tick and ledger states only | ink on warning 6.4:1, ink on caution 11.7:1 |

- **Type.** No new font and no new dependency: Barlow Condensed 800 for display and figures, Barlow
  400/500/600 for body, and the existing product mono stack for provenance captions only. Display
  tracking is −0.03em. Figures need `tabular-nums` (measured above).
- **Shape.** Square corners everywhere (0 radius). The nav pill becomes a square plate, matching the
  portal's ink frame.
- **Motion tokens.** Unchanged (`--ease-quint`, `--ease-inout`). New: tape swap 120 ms, tick stamp
  180 ms, tape hide 240 ms.
- **Colour story.** Dawn in the scene, the paper record at noon (S6, S7), dusk in the footer. That is one
  theme switch to paper and one back to ink, both narrative (taste §4.11 allows one deliberate switch;
  the second is the footer, which already was ink).
- **Out.** Glows, glass, gradients beyond the scrims and the sky, and yellow-on-black brand surfaces.
  Caution yellow appears only as a state, never as a large field next to ink.

## 5. Stages

Shared camera rule (A): on desktop the action sits in the right 62 % of the frame (`setViewOffset` sx
about 0.25). The bottom 120 px stays clear for the tape. On phones the action sits in the band from 120 px
to 55 % of the height.

**S1 Dawn** (band 70vh desktop / 30vh phone, 06:00-06:20).
- Visual: the hero 3/4 low angle, then a pull-back from p .35.
- Copy: the existing H1, sub and two CTAs, held. Remove `data-inert-after`: the CTAs stay usable.
- Tape: "Shift opens on Bench 3", then "EXC-07 moves to the dig face".
- LCP: the SSR poster plus H1, as today.

**S2 The machine** (200 / 140, 06:20-07:20).
- Visual: the orbit close-up, the dig cycle, three callouts with leaders revealed at p .1, .25 and .45,
  then held.
- At p .20-.35 the cab beacon turns caution (seatbelt off) and tick 1 stamps.
- At p .60-.80 the link row reads "No signal, 2 held", and "Back, 2 sent" at .80. This proves callout
  c3: the product queues events offline.

**S3 The operator's trail** (200 / 140, 07:20-10:20).
- Visual: high oblique; the trail draws over p 0-.85.
- Stats count live. Ticks 2 and 3 stamp at .25 and .50.

**S4 Guardian rings** (220 / 160, 10:30-11:00).
- Rings grow over p 0-.3.
- The truck comes in from p .12. It enters caution at about .30 and warning at exactly .45 (10:44, tick 4,
  "Entry 4 written").
- Closest approach is 7.4 m over .62-.80. It backs out to caution at .80 and clear at .90.
- **It never reaches critical.** The legend still shows all four states.
- The readout and the legend chip highlight the live state.

**S5 Replay** (160 / 110).
- p 0-.55: the trail and the machine rewind to the entry 4 point. The clock runs back to 10:44, and the
  card (existing title, body, scrub and chip) holds.
- p .55-1: fast-forward to 14:00. Ticks 5 and 6 stamp.
- A CSS dim overlay goes from 0 to 60 % ink over p .6-1. **It never goes above 60 %.** This replaces the
  v2 `.l-ink` wipe.

**Paper overlay** (100vh hold).
- The S6 sheet scrolls up over the held scene: a real scroll, with a 2 px ink top rule and no shadow.
- The S6 copy rides on the sheet, so every frame has the card above and the ledger title below.

**S6 Ledger** (pin 180vh desktop, flow on phone; 14:00).
- Copy: the existing title and body.
- Rows: six rows of time, type, severity and a hash in groups. They stamp one by one over p .05-.35 on
  desktop, or on IntersectionObserver per row on phone.
- At p .40, "Chain verified".
- At p .55-.70, row 4's severity visibly flips **4 → 1**: the old digit is struck through and the new one
  set beside it.
- At p .70, "Chain broken at row 4". Rows 5 and 6 get "Not checked after row 4".
- Hold to 1.
- Rows are 56 px tall, so all six fit at 900 px tall with the copy beside them. No half-cut rows while
  pinned.

**S7 Proof** (pin 240vh desktop, flow on phone; paper; `png/proof-1440.png`, `proof-375.png`).
- Left column: the title, the lede and three role rows (Operator, Fleet manager, Auditor), all always
  visible. The active row has a 6 px ink bar and a filled button.
- Right: a "tray" of the three framed captures, each with a 40 px bar showing its path and "demo data,
  captured from the live app".
- p 0-.34 shows the cockpit, .34-.67 the inbox, .67-1 the ledger page. The front capture changes with a
  200 ms crossfade, and the sheets behind shift up one position.
- One annotation per capture (a `--first-light` box and an ink tag):
  - cockpit: "One plain word" on the state word
  - inbox: "Tier, then age" on the list header
  - ledger: "Checked against the copy kept outside" on the witness card
- Each role row's button is the only CTA for that intent, and it keeps the existing label where one
  exists ("Open the operator cockpit").
- Phone: three blocks in flow, each with the phone capture (390 px wide, cropped to 600 px tall), the role
  text and the CTA.

**Footer, dusk** (in flow, about 980 px desktop; `png/footer-1440.png`, `footer-375.png`). It replaces the
sticky curtain.
- **Plate** (560 px tall; on phones at the SVG's own aspect ratio). Full-bleed ink with the contour map of
  our terrain:
  - minor contours every 1.6 m, major every 8 m (one bench), plus 0.12 m floor contours;
  - the haul road dashed, the four ring circles faint, and the shift's trail in `--first-light`.
- **Wordmark.** "SPOTTER" in Barlow Condensed 800 (400 px, +8 tracking):
  - it is a clip path: inside the letters the same contours are drawn bright, with the letter body at
    6 % paper;
  - outside the letters they are at 8-22 %;
  - each letter has a 55 % paper outline.
- **Legend** at the bottom left. At the bottom right, "14:00 / Shift closed. Six entries, chain checked."
  closes the clock device.
- **Columns:**
  - Product: Operator cockpit, Fleet inbox, Ledger check, and the language switch, as 44 px rows.
  - What is simulated.
  - How it is made: the build note, plus the existing not-affiliated line.
- The wordmark stays Latin in both locales: it is a logotype. The `<h2>` (sr-only) and the alt text use
  the localized brand.

## 6. Storyboards (generated by `docs/design/landing-v3/tools/storyboard.py` from the bands above)

"~words" counts readable copy outside the tape (the stricter audit). Every frame has at least 20.

### 1440 x 900, 450 px steps (30 frames, document 13310 px)

| # | y | stage, p | visual | readable copy (outside the tape) | ~words | tape now line |
|---|---|---|---|---|---|---|
| 0 | 0 | S1 .00 | hero 3/4 low angle, first light | H1, sub, 2 CTAs | 35 | 06:00 Shift opens on Bench 3 |
| 1 | 450 | S1 .71 | camera pulls back over the benches | H1, sub, 2 CTAs | 35 | 06:12 EXC-07 moves to the dig face |
| 2 | 900 | S2 .15 | close orbit, dig cycle, callout 1 | title, body, readout (boom, stick, bucket, phase, link), callout 1 | 39 | 06:20 Digging. Boom and stick read live |
| 3 | 1350 | S2 .40 | callouts 1-2, beacon back to clear, tick 1 stamped | as above, 2 callouts | 44 | 06:41 Seatbelt on. Back to clear |
| 4 | 1800 | S2 .65 | 3 callouts, link row "No signal, 2 held" | as above, 3 callouts | 49 | 06:56 No signal. 2 events held on the machine |
| 5 | 2250 | S2 .90 | 3 callouts, link "Back, 2 sent" | as above | 49 | 07:08 Signal back. 2 events sent |
| 6 | 2700 | S3 .15 | high oblique, trail 18 % | title, body, 2 cycles / 109 t (SIM) | 30 | 07:20 Loading the first truck |
| 7 | 3150 | S3 .40 | trail 47 %, tick 2 stamped | title, body, 7 / 292 t | 30 | 08:05 Idle too long, 11 min (entry 2) |
| 8 | 3600 | S3 .65 | trail 76 %, tick 3 stamped | title, body, 11 / 474 t | 30 | 08:50 Overspeed on the ramp (entry 3) |
| 9 | 4050 | S3 .90 | trail complete, 14 cycle ticks | title, body, 14 / 620 t | 30 | 08:50 Overspeed on the ramp (entry 3) |
| 10 | 4500 | S4 .14 | rings grown, truck 24 m | title, body, legend, readout 24 m CLEAR | 40 | 10:30 Haul truck on the ramp |
| 11 | 4950 | S4 .36 | truck 15 m in the caution ring | readout 15 m CAUTION | 40 | 10:30 Haul truck on the ramp |
| 12 | 5400 | S4 .59 | truck 9.8 m, warning ring pulsed once, tick 4 | readout 9.8 m WARNING, Entry 4 written | 40 | 10:44 Proximity warning (entry 4) |
| 13 | 5850 | S4 .82 | truck backing out, 16 m | readout 16 m CAUTION | 40 | 10:44 Proximity warning (entry 4) |
| 14 | 6300 | S5 .06 | trail rewinding, replay card | card: title, body, scrub, chip | 38 | REPLAY 10:58, entry 4 |
| 15 | 6750 | S5 .38 | rewind near the event point | card | 38 | REPLAY 10:49, entry 4 |
| 16 | 7200 | S5 .69 | fast-forward, dim 20 % | card | 38 | 10:55 Truck backs out. Clear |
| 17 | 7650 | paper 0 px | scene held at 60 % ink, sheet at bottom edge | card, ledger title entering | 78 | 14:00 Shift closed |
| 18 | 8100 | paper 450 px | sheet covers the lower half | card (top), ledger title and body (sheet) | 78 | 14:00 Shift closed |
| 19 | 8550 | S6 .00 | paper pin, rows begin | title, body, row 1 | 40 | 14:00 Shift closed (paper tape) |
| 20 | 9000 | S6 .62 | 6 rows, row 4 flipping 4 → 1 | title, body, 6 rows, status | 76 | 14:00 Shift closed |
| 21 | 9450 | S6 → S7 180 px | ledger scrolls up, proof title enters | rows, "Chain broken at row 4"; proof title | 76 | 14:00 (paper) |
| 22 | 9900 | S6 → S7 630 px | proof pin arriving | proof title, lede, role rows | 70 | hidden |
| 23 | 10350 | S7 .14 | capture: operator cockpit | title, lede, 3 role rows (Operator active) | 70 | hidden |
| 24 | 10800 | S7 .50 | capture: fleet inbox | same (Fleet manager active) | 70 | hidden |
| 25 | 11250 | S7 .86 | capture: ledger page | same (Auditor active) | 70 | hidden |
| 26 | 11700 | S7 → footer 270 px | proof leaves, contour plate enters | role rows (top), wordmark plate (bottom) | 70 | hidden |
| 27 | 12150 | S7 → footer 720 px | contour wordmark, 14:00 closure | closure line, legend, column heads | 60 | hidden |
| 28-29 | 12410 | footer | contour wordmark and columns | columns, closure line | 60 | hidden |

### 375 x 812, 406 px steps (27 frames, document about 10560 px)

| # | y | stage, p | visual | readable copy | ~words | tape (top bar) |
|---|---|---|---|---|---|---|
| 0 | 0 | S1 .00 | hero, machine in the top half | H1, sub, 2 CTAs | 35 | 06:00 Shift opens on Bench 3 |
| 1 | 406 | S2 .14 | machine close, callout 1 | title, body, compact readout (boom, phase), callout 1 | 39 | 06:20 Digging. Boom and stick read live |
| 2 | 812 | S2 .50 | callouts 1-3 (stills, no leaders on phones) | as above | 49 | 06:41 Seatbelt on. Back to clear |
| 3 | 1218 | S2 .86 | link back | as above | 49 | 07:08 Signal back. 2 events sent |
| 4 | 1624 | S3 .21 | trail 25 % | title, body, 4 / 156 t | 30 | 07:20 Loading the first truck |
| 5 | 2030 | S3 .57 | trail 67 % | 9 / 417 t | 30 | 08:50 Overspeed on the ramp (entry 3) |
| 6 | 2436 | S3 .93 | trail complete | 14 / 620 t | 30 | 08:50 Overspeed on the ramp (entry 3) |
| 7 | 2842 | S4 .25 | rings, truck 24 m | title, body, legend 2 x 2, readout 24 m CLEAR | 40 | 10:30 Haul truck on the ramp |
| 8 | 3248 | S4 .56 | truck 9.8 m, warning | readout WARNING | 40 | 10:44 Proximity warning (entry 4) |
| 9 | 3654 | S4 .88 | truck backing out | readout 16 m CAUTION | 40 | 10:44 Proximity warning (entry 4) |
| 10 | 4060 | S5 .27 | rewind | replay card | 38 | REPLAY 10:52, entry 4 |
| 11 | 4466 | S5 .73 | fast-forward, dim 25 % | replay card | 38 | 12:05 Slope alert (entry 5) |
| 12 | 4872 | paper 162 px | sheet rising over the held scene | card; ledger title | 78 | 14:00 Shift closed |
| 13 | 5278 | paper 568 px | sheet covers 70 % | ledger title, body, status | 78 | 14:00 Shift closed |
| 14 | 5684 | S6 head | paper | title, body, status | 40 | 14:00 (paper bar) |
| 15-16 | 6090-6496 | S6 rows | rows stamp on view, row 4 flips | 6 rows | 48 | 14:00 (paper bar) |
| 17 | 6902 | S7 head | paper | proof title, lede | 20 | hidden |
| 18-19 | 7308-7714 | S7 operator | phone capture of /op | role text, CTA | 24 | hidden |
| 20-21 | 8120-8526 | S7 fleet | phone capture of /fm | role text, CTA | 20 | hidden |
| 22-23 | 8932-9338 | S7 auditor | ledger capture (cropped) | role text, CTA | 20 | hidden |
| 24-26 | 9744+ | footer | wordmark fits the width | columns | 60 | hidden |

Phone S7 has risk at frames 19, 21 and 23: a 406 px step can land on a capture with its role text below
the fold. **Rule for B:** in each phone S7 block the role text sits ABOVE its capture, and the capture is
at most 560 px tall. Then any 812 px window contains at least one role text.

## 7. Copy (en and hi). New or changed keys under `landing.*`

Keep: `brand, caption, kicker, headline, sub, cta, ctaFleet, s2.*, s3.*, s4.title, s4.body, s5.title,
s5.body, s5.scrub, s5.card, s6.* (except tamper), s7.foot, wipe.band`.
Remove: `scrollHint, s1b, rail.*, s7.title, s7.body` (s7 is redefined below).

| Key | en | hi |
|---|---|---|
| skip | Skip to the app screens | सीधे ऐप की स्क्रीन पर जाएँ |
| tape.label | Shift clock, simulated | शिफ्ट की घड़ी, सिम्युलेटेड |
| tape.clock | Shift clock | शिफ्ट घड़ी |
| tape.sim | SIM | SIM |
| tape.replay | Replay | रीप्ले |
| tape.entry | Ledger entry {n} | लेजर प्रविष्टि {n} |
| tape.goEntry | Go to {time}: {event} | {time} पर जाएँ: {event} |
| tape.lines.open | Shift opens on Bench 3. | बेंच 3 पर शिफ्ट शुरू। |
| tape.lines.move | EXC-07 moves to the dig face. | EXC-07 खुदाई वाली जगह की ओर बढ़ता है। |
| tape.lines.dig | Digging. Boom and stick read live. | खुदाई जारी। बूम और स्टिक सीधे पढ़े जा रहे हैं। |
| tape.lines.belt | Seatbelt off while moving. | चलते समय सीटबेल्ट नहीं लगा। |
| tape.lines.beltOn | Seatbelt on. Back to clear. | सीटबेल्ट लगा। फिर से सुरक्षित। |
| tape.lines.noSignal | No signal. {n} events held on the machine. | ऑफ़लाइन। {n} घटनाएँ मशीन पर रुकी हैं। |
| tape.lines.signalBack | Signal back. {n} events sent. | सिग्नल वापस। {n} घटनाएँ भेज दी गईं। |
| tape.lines.load | Loading the first truck. | पहला डंपर भरा जा रहा है। |
| tape.lines.idle | Idle too long: {m} minutes. | बहुत देर आइडल: {m} मिनट। |
| tape.lines.overspeed | Overspeed on the ramp. | रैंप पर तेज़ गति। |
| tape.lines.truck | Haul truck on the ramp. | डंपर रैंप पर। |
| tape.lines.proximity | Proximity warning. The haul truck is inside the third ring. | नज़दीकी चेतावनी। डंपर तीसरे घेरे के अंदर है। |
| tape.lines.backOut | Truck backs out. Clear. | डंपर पीछे हटा। स्थिति सुरक्षित। |
| tape.lines.replay | Replaying entry 4 for practice. | अभ्यास के लिए प्रविष्टि 4 का रीप्ले। |
| tape.lines.slope | Slope alert on Bench 3. | बेंच 3 पर ढलान चेतावनी। |
| tape.lines.belt2 | Seatbelt off. | सीटबेल्ट नहीं लगा। |
| tape.lines.closed | Shift closed. Six entries, chain checked. | शिफ्ट बंद। छह प्रविष्टियाँ, शृंखला जाँची गई। |
| ro.sim | Simulated readout | सिम्युलेटेड रीडिंग |
| ro.boom / ro.stick / ro.bucket | Boom / Stick / Bucket | बूम / स्टिक / बकेट |
| ro.phase | Phase | चरण |
| ro.phases.dig / swing / dump / return / travel | Dig / Swing / Dump / Return / Travel | खुदाई / घुमाव / डंप / वापसी / चलना |
| ro.link | Link | कनेक्शन |
| ro.online | Online | ऑनलाइन |
| ro.held | No signal, {n} held | ऑफ़लाइन, {n} रुकी |
| ro.sent | Back, {n} sent | वापस, {n} भेजी |
| ro.nearest | Nearest object | सबसे नज़दीकी वस्तु |
| ro.truck | Haul truck | डंपर |
| ro.metres | {n} m | {n} मी |
| ro.none | Nothing in range | दायरे में कुछ नहीं |
| ro.shownIn | Alert shown in | चेतावनी कहाँ दिखी |
| ro.shownWhere | Cab and fleet inbox | केबिन और फ़्लीट इनबॉक्स |
| ro.ledger | Ledger | लेजर |
| ro.written | Entry {n} written | प्रविष्टि {n} दर्ज |
| s5.from / s5.to | 10:40 / 10:48 | 10:40 / 10:48 |
| s6.tamper | Row {n} changed after the fact: severity {from} to {to}. | पंक्ति {n} बाद में बदली गई: गंभीरता {from} से {to}। |
| s6.after | Not checked after row {n} | पंक्ति {n} के बाद जाँच नहीं हुई |
| s7.title | The same shift, in the app. | वही शिफ्ट, ऐप में। |
| s7.body | Three screens from the working product, running on demo data. Start from the seat you sit in. | चालू प्रोडक्ट की तीन स्क्रीन, डेमो डेटा पर। अपनी भूमिका से शुरू करें। |
| s7.op.who | Operator | ऑपरेटर |
| s7.op.does | One plain word for the machine, the task and its time left. Practice built from your own events. | मशीन के लिए एक सीधा शब्द, काम और उसका बचा हुआ समय। आपकी अपनी घटनाओं से बना अभ्यास। |
| s7.fm.who | Fleet manager | फ़्लीट मैनेजर |
| s7.fm.does | Alerts sorted by tier, then age, each with one next step. | चेतावनियाँ पहले स्तर, फिर समय के क्रम में, हर एक के साथ अगला एक कदम। |
| s7.fm.go | Open the fleet inbox | फ़्लीट इनबॉक्स खोलें |
| s7.au.who | Auditor | ऑडिटर |
| s7.au.does | Check that no entry was changed after the fact. | जाँचें कि कोई प्रविष्टि बाद में बदली नहीं गई। |
| s7.au.go | Verify the ledger | लेजर सत्यापित करें |
| s7.bar | demo data, captured from the live app | डेमो डेटा, चालू ऐप से ली गई |
| s7.cap | Screens are captured from the deployed app on demo data. | स्क्रीन डिप्लॉय किए गए ऐप से डेमो डेटा पर ली गई हैं। |
| s7.note.op / fm / au | One plain word / Tier, then age / Checked against the copy kept outside | एक सीधा शब्द / पहले स्तर, फिर समय / बाहर रखी प्रति से मिलाया गया |
| s7.op.alt | The operator cockpit: a caution plate in the status band, the words NEEDS PPE, the task Excavation at 0 per cent with 77 minutes left, and a labelled drawing of the machine's parts. | ऑपरेटर कॉकपिट: स्टेटस पट्टी में सावधान की प्लेट, बड़े अक्षरों में NEEDS PPE, काम खुदाई 0 प्रतिशत और 77 मिनट बाकी, और मशीन के हिस्सों का लेबल वाला चित्र। |
| s7.fm.alt | The fleet inbox: alerts listed by tier, with the selected warning, Faulty machine near a person, open beside the list with an Acknowledge button. | फ़्लीट इनबॉक्स: स्तर के क्रम में चेतावनियाँ, चुनी हुई चेतावनी "व्यक्ति के पास ख़राब मशीन" सूची के बगल में खुली, Acknowledge बटन के साथ। |
| s7.au.alt | The ledger page: 213 entries verified and 1 sealed, a Check again button, and a form to compare with the checkpoint line received outside the app. | लेजर पेज: 213 प्रविष्टियाँ सत्यापित और 1 सील, "फिर जाँचें" बटन, और ऐप के बाहर मिली चेकपॉइंट लाइन से मिलाने का फ़ॉर्म। |
| foot.map | The word Spotter drawn from the contour lines of the simulated quarry, with the shift's trail on the pit floor. | सिम्युलेटेड खदान की ऊँचाई-रेखाओं से बना शब्द स्पॉटर, और गड्ढे के तल पर शिफ्ट का रास्ता। |
| foot.contours | Bench contours, every 1.6 m | बेंच की ऊँचाई-रेखाएँ, हर 1.6 मी |
| foot.road | Haul road | ढुलाई सड़क |
| foot.trail | Today's trail | आज का रास्ता |
| foot.product | Product | प्रोडक्ट |
| foot.links.op / fm / ledger | Operator cockpit / Fleet inbox / Ledger check | ऑपरेटर कॉकपिट / फ़्लीट इनबॉक्स / लेजर जाँच |
| foot.otherLang | हिन्दी में पढ़ें | Read in English |
| foot.simTitle | What is simulated | क्या सिम्युलेटेड है |
| foot.sim | Everything on this page runs on demo data: the shift, the machine readings, the ledger hashes and the app screens. No real site, operator or customer appears. | इस पेज पर सब कुछ डेमो डेटा पर चलता है: शिफ्ट, मशीन की रीडिंग, लेजर के हैश और ऐप की स्क्रीन। कोई असली साइट, ऑपरेटर या ग्राहक नहीं दिखाया गया है। |
| foot.madeTitle | How it is made | यह कैसे बना है |
| foot.made | The quarry and these contour lines come from one terrain function in our code, and the excavator is built in code too. No stock photos, no generated images. | खदान और ये ऊँचाई-रेखाएँ हमारे कोड के एक ही टेरेन फ़ंक्शन से बनती हैं, और एक्सकेवेटर भी कोड में बना है। कोई स्टॉक फ़ोटो नहीं, कोई जनरेट की हुई तस्वीर नहीं। |

Notes:
- The hi strings follow the existing glossary: डंपर for haul truck, घेरे for rings, शृंखला for chain,
  and the safety enum words (सुरक्षित, सावधान, चेतावनी, ख़तरा, ऑफ़लाइन).
- A native-speaker pass is still advised (Q4).
- The alt texts describe the captures as of 2026-11-12. B must update them if the fixtures change.
- In the capture alt, "Acknowledge" and "NEEDS PPE" stay in English because the captures are taken from
  the en build. B can capture hi screens for the hi locale (§8.2 B5).

## 8. Implementation split (two tasks, disjoint files)

### 8.1 Task A: scene and generators

Owns:
- `apps/web/src/components/landing/scene/**`
- `apps/web/scripts/landing-contours.ts` (new)
- `apps/web/public/landing/contours.svg` (generated)
- `apps/web/public/landing/poster-*.{avif,webp}`

Work:

- **A1 Bands.** Retime camera keyframes and `HOLD/TRAVEL/ORBIT` to the new `ps`. Bands are shorter, and
  each key shot holds through the middle 60 % of its band. Apply the view-offset rule in §5 (desktop
  right 62 %, tape-safe bottom; phone top band).
- **A2 `getReadout()`** (interface §8.3). Report pose angles, the dig phase from `cyclePose` (`travel`
  while stowed), `cycles` (ticks passed), `trail`, `nearestM` (truck front to excavator centre, null when
  hidden), `ring`, and `replay`.
- **A3 Beats from `shift.ts`.**
  - S2: the beacon shows caution during `S2.seatbeltOff`.
  - S4: retune `routeCurve` and the `inn/away` windows so ring 3 is first entered at `S4.warnAt` ±0.02,
    the minimum distance is `S4.closestM` ±0.3 m over `S4.closest`, caution comes at `S4.caution` and
    clear at `S4.clear`. Ring 4 is never entered.
  - S5: rewind the trail head to `S5.rewindToT` (the trail parameter of the entry 4 point) by p .55, then
    redraw it ghosted to 1.
  - Add a unit test (`scene/timeline.test.ts`, no WebGL) that samples the pure truck route and asserts
    these tolerances. That needs the route maths split into a pure module, `scene/route.ts`.
- **A4 Phones and coarse pointers.**
  - DPR 1.0, the shadow map at 1024 with PCF, and dust off.
  - Render only when `ps` changed, the dig cycle advanced, or a tick stamped, capped at 30 fps.
  - Keep the governor.
  - No change to desktop budgets: under 40k triangles, DPR at most 1.5.
- **A5 Contours.**
  - Port `docs/design/landing-v3/tools/contours.py` to TypeScript, using `terrainHeight` from
    `terrain.ts` as the single source. Marching squares, 0.6 m grid, x ±300, z ±125.
  - Levels: minor every 1.6 m, major every 8 m, and floor contours every 0.12 m for heights −0.36 to 1.2.
  - Add the trail path, the haul road and the ring circles.
  - Write `public/landing/contours.svg` with `<g id="map">`. Every path is styled through custom
    properties only (`--cm --wm --cM --wM --cf --wf --tr --tw --rd --rg`), as in the mockup, so B can
    reuse it through `<use>`.
  - Budget: at most 75 KB gzipped (the mockup measures 66 KB). Simplify with Douglas-Peucker at
    tolerance 0.35-0.4.
  - Add an npm script `landing:contours`. The SVG is committed, not built at runtime.
- **A6 Posters.**
  - Re-render `poster-1..5` (1440 x 900) and new `poster-1..5-m` (750 x 1300, phone framing) with
    `?still=<stage>:<p>` at each stage's key p.
  - Remove the Next dev badge before each shot, for example:
    `agent-browser eval "document.querySelector('nextjs-portal')?.remove()"`.
  - Each file must be at most 60 KB.
- **Must not change:** the current exports, signatures and part names of `scene/excavator.ts` and
  `scene/parts.ts`. Another lane imports them read-only. Additive exports are fine.

### 8.2 Task B: page, engine, copy

Owns:
- `landing.tsx`, `landing-engine.tsx`, `dawn-poster.tsx`, `wipe-link.tsx`, `ledger-demo.ts`
- new `shift-tape.tsx`, `readout.tsx`, `proof.tsx`, `landing-footer.tsx`
- `styles/landing.css`, the new tokens in `styles/tokens.css`
- `messages/{en,hi}.json` (landing keys)
- `apps/web/public/landing/proof-*.{avif,webp}`, `scripts/qa/capture-proof.sh` (new)

Work:

- **B1 Architecture** (§3.2).
  - One sticky `.l-view` with band spacers.
  - Engine: bands measured from the spacers, `--p` per band, `root.dataset.now`, and the inert/visibility
    switch of the copy blocks.
  - The S6 overlay with `margin-top: -100svh`. S6 and S7 pins on desktop, flow on phones.
  - The footer in flow. Delete the curtain, `.l-ink`, `--f`, the rail, the kickers, `s1b` and the hint.
- **B2 Shift tape** (§3.3). A client component fed by the engine's `ps` through a ref callback, never
  React state per frame. Clock and lines come from `shift.ts`. Ticks are links.
- **B3 Copy column and readouts** (§3.4, §3.5).
  - Read `ctl.getReadout?.()` in the scene's `onFrame`, and tolerate it being absent: then show the
    stage's settled values from `shift.ts`.
  - Text writes go through `textContent` on cached nodes, batched after reads.
- **B4 Ledger.**
  - Add `at` (minutes) to `BASE` from `ENTRIES`. The ISO `occurred_at` uses the same times, so the hashes
    change; that is expected, since they are computed at render.
  - Show the time in each row, the 4 → 1 flip, and "Not checked after row 4".
- **B5 Proof.**
  - `capture-proof.sh` captures `/op`, `/fm` and `/fm/ledger` with agent-browser at 1440 x 900 and
    390 x 844, in en and hi, into `public/landing/proof-{op,fm,ledger}[-m][-hi].{avif,webp}`, each at
    most 90 KB.
  - Never open `/api/sos-demo`, and never click anything.
  - It masks or crops the model designation until Q1 is answered.
  - Captures are `<img loading="lazy" decoding="async">` with explicit width and height and the alt text
    from §7.
- **B6 Footer** (§5): `<svg><use href="/landing/contours.svg#map"/></svg>` plus the clip-path wordmark,
  as in `mockups/footer.html`.
- **B7 Messages** (§7), en and hi, removing the dead keys in both files.
- **B8 Fallbacks** (§9) and the **audit tags** (§10).

### 8.3 Interface (the only shared surface)

**`apps/web/src/components/landing/shift.ts`.** The lead creates this file first, verbatim, and then
freezes it. A and B import it and neither edits it.

```ts
/** Landing v3 shared timeline (docs/design/landing-v3-spec.md §8.3). Frozen: A and B read it, neither edits it. */
export const SHIFT = { start: 360, end: 840 } as const; // minutes after midnight, 06:00-14:00
export type Tier = "info" | "caution" | "warning" | "critical";
export const ENTRIES = [
  { n: 1, at: 392, type: "seatbelt_breach", severity: 3, tier: "caution", stage: 2, p: 0.2 },
  { n: 2, at: 485, type: "idle_excess", severity: 1, tier: "info", stage: 3, p: 0.25 },
  { n: 3, at: 530, type: "overspeed", severity: 2, tier: "caution", stage: 3, p: 0.5 },
  { n: 4, at: 644, type: "proximity_warning", severity: 4, tier: "warning", stage: 4, p: 0.45 },
  { n: 5, at: 725, type: "slope_alert", severity: 2, tier: "caution", stage: 5, p: 0.711 },
  { n: 6, at: 800, type: "seatbelt_breach", severity: 3, tier: "caution", stage: 5, p: 0.9 },
] as const;
/** Tape sentences: [minute, message key under landing.tape.lines, params]. */
export const LINES: ReadonlyArray<readonly [number, string, Record<string, number>?]> = [
  [360, "open"], [372, "move"], [380, "dig"], [392, "belt"], [401, "beltOn"], [416, "noSignal", { n: 2 }],
  [428, "signalBack", { n: 2 }], [440, "load"], [485, "idle", { m: 11 }], [530, "overspeed"], [630, "truck"],
  [644, "proximity"], [655, "backOut"], [725, "slope"], [800, "belt2"], [840, "closed"],
];
export const RANGES: Record<1 | 2 | 3 | 4, readonly [number, number]> = { 1: [360, 380], 2: [380, 440], 3: [440, 620], 4: [630, 660] };
export const S2 = { callouts: [0.1, 0.25, 0.45], seatbeltOff: [0.2, 0.35], linkDown: [0.6, 0.8] } as const;
export const S3 = { draw: [0, 0.85], cycles: 14, tonnes: 620 } as const;
export const S4 = { ringsGrow: [0, 0.3], truckIn: [0.12, 0.62], warnAt: 0.45, closest: [0.62, 0.8], closestM: 7.4, caution: 0.8, clear: 0.9 } as const;
export const S5 = { rewind: [0, 0.55], rewindTo: 644, from: 660, dim: [0.6, 1], dimMax: 0.6 } as const;
export const BANDS_VH = { desk: [70, 200, 200, 220, 160], phone: [30, 140, 140, 160, 110], hold: 100 } as const;

/** Clock minutes and mode for the 5 scene progresses (ps[0..4]). Pure; used by the tape and by tests. */
export function shiftClock(ps: readonly number[]): { minutes: number; replay: boolean } {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * c(t);
  let s = 0;
  for (let i = 0; i < 5; i++) if ((ps[i] ?? 0) > 0) s = i;
  const p = ps[s] ?? 0;
  if (s === 4) return p < S5.rewind[1] ? { minutes: lerp(S5.from, S5.rewindTo, p / S5.rewind[1]), replay: true } : { minutes: lerp(S5.from, SHIFT.end, (p - S5.rewind[1]) / (1 - S5.rewind[1])), replay: false };
  const [a, b] = RANGES[(s + 1) as 1 | 2 | 3 | 4];
  return { minutes: lerp(a, b, p), replay: false };
}
```

**`SceneController` gains one method** (A implements it, B consumes it, B tolerates its absence):

```ts
export type SceneReadout = {
  boomDeg: number; stickDeg: number; bucketDeg: number;      // from the current Pose
  phase: "dig" | "swing" | "dump" | "return" | "travel";
  cycles: number;                                              // 0..14
  trail: number;                                               // 0..1, the drawn share of the trail
  nearestM: number | null;                                     // truck to excavator centre; null when the truck is hidden
  ring: 0 | 1 | 2 | 3 | 4;                                     // same value onRing reports
  replay: boolean;                                             // stage 5 rewind running
};
// on SceneController:
getReadout: () => SceneReadout; // the last rendered frame's values; a shared object, do not mutate
```

`getAnchors()` gains one optional id, `"truck"`, for the S4 leader. Everything else in `SceneController`
and `SceneOptions` stays as on `origin/main`. `scene/excavator.ts` and `scene/parts.ts` keep their exports,
signatures and part names; additive exports only.

**`contours.svg`** contract: an SVG with `<g id="map">` in map units (1 unit = 1 m, origin at
x −300, z −125). Every element is styled through the custom properties listed in A5, with no fill or
stroke attributes of its own. Path classes are `cm cM cf trail road ring`.

**Build order:**
1. The lead creates `shift.ts`.
2. A and B run in parallel.
3. B ships first against `getReadout` being absent (settled values).
4. A lands, and the readouts go live without a B change.

## 9. Fallbacks

- **Reduced motion** (`data-motion="reduced"`, no scene). The `.l-view` pin is off and every band becomes
  a 100svh still section, in this order: poster N (desktop or `-m` on phones), its copy block, its
  readout at the settled values, and a static tape strip showing that stage's clock and line. S6 shows
  the broken-chain end state. S7 is a plain stack. No transitions anywhere.
- **No JS.** The same stack, through the `<noscript>` style block (extend the existing one): show all
  copy blocks, show `.l-tape-static` strips, and hide the live tape.
- **No WebGL or Save-Data** (`data-gl="off"`). The motion page with posters in place of the canvas. The
  tape still runs (it is pure DOM), and readouts show settled values.
- **Context lost.** As today, plus readouts fall back to settled values.

## 10. Accessibility and the audit

- **Tab order:** skip link ("Skip to the app screens", to `#proof`) → brand → language → hero CTAs →
  tape entry links (6) → S6 → S7 role links (3) → footer links.
  - Hidden copy blocks are `inert`.
  - The tape is `inert` while hidden (S7 and footer).
- **Focus ring:** 3 px `--first-light` with a 3 px offset on ink; on paper, 3 px ink. All targets are at
  least 48 px (tape ticks, role rows, footer links at 44 px rows inside 48 px slots).
- **Landmarks:** one `<main>`, the footer with an sr-only `<h2>`. Headings: one h1, then h2 per stage.
- **Contrast:** every pair is in §4. The lowest text pair is `--ink-3` on paper at 4.95:1, used only for
  ≥ 15 px captions.
- **Colour is never alone:** ring and tick states carry shape and word; ledger states carry a chip word.
- **Audit tags:**
  - `data-chrome` on the nav, the tape's clock and tick cells, and the `SIM` plates.
  - The tape's now line is NOT chrome.
  - The footer is in flow, so the occlusion problem of the old curtain is gone.

## 11. Performance

- No new dependency: no fonts, no npm packages, no video.
- three.js stays dynamic-imported on idle or on first scroll.
- LCP stays the SSR poster plus H1.
- The tape and readouts are DOM text: transforms, `textContent` writes, and no layout reads per frame
  except the cached band rects.
- Captures are lazy and dimensioned. `contours.svg` at most 75 KB gzip, fetched only near the footer
  (`<use>` inside a `content-visibility:auto` footer).
- CLS < 0.1: the tape has a fixed height, and readouts have fixed boxes with tabular figures.

## 12. Acceptance (the lead's review checks these)

1. `bash scripts/qa/scroll-audit.sh <url> <out> 1440 900 450` and `... 375 812 406` report **0 dead,
   thin or flat**.
2. The same two runs with `CHROME="<default>,.l-tape"` (the tape excluded) also report 0. That proves the
   copy column alone fills every frame.
3. Reduced motion (emulated) and JS disabled: each stage shows its words and a still. Screenshots at
   1440 and 375 go under `docs/design/qa/landing-v3/`.
4. **Sync check:**
   - at `?still=4:0.45` the readout shows WARNING, the tape shows 10:44 with tick 4 stamped, and the
     truck is at 12 m ±0.5;
   - at `?still=5:0.3` the clock reads below 11:00 with REPLAY.
5. **Keyboard:** Tab from the top reaches every control in the §10 order, with a visible focus ring each
   time and no focus inside hidden blocks. Run axe on the landing with 0 serious or critical findings.
6. AA contrast for every text pair in §4, and the hi build has no clipped strings at 375.
7. typecheck, lint, test (including `scene/timeline.test.ts`) and build all green, with counts quoted.
   three.js is not in the initial JS. LCP element = poster or H1.
8. No calls, SMS, Telegram or SOS. The proof captures are made without clicking.

## 13. Research notes (patterns, not copies)

- **linear.app** (captured 2026-11-12, 8 frames at 1440). Every viewport pairs a short headline with a
  real product capture. Captures are cropped and framed, never mocked. The footer is plain columns.
  Taken: real captures as the proof; one claim per capture.
- **stripe.com** (captured, 8 frames). Real UI fragments placed in compositions; stats with plain labels.
  Taken: captures annotated with one callout each. Not taken: gradient art.
- **apple.com/airpods-pro and igloo.inc** (attempted; headless capture wedged and the virtual scroll did
  not report height). From prior knowledge, not verified this session: pinned product scrubs where copy
  changes by beat in a fixed column while the object moves. That is the copy-column pattern in §3.4.
- **The aayushvisuals study** (`landing-dossier.md`). Native scroll, formula-driven bands and a small
  motion vocabulary. All kept.

## 14. Open questions for the lead

- **Q1.** The cockpit fixture shows "EXC-007 · Cat 320". "Cat 320" is a Caterpillar model designation.
  Should the fixture become a generic model (for example "EXC-007 · 22 t excavator")? Until then, B masks
  it in the captures.
- **Q2.** "Auditor" is a role path to `/fm/ledger`, which lives in the fleet view; there is no auditor
  login. Is the label acceptable? The alternative is "Checking the record".
- **Q3.** Should the hi locale capture hi app screens (B5 says yes, if the app is fully translated)?
- **Q4.** The hi copy needs a native-speaker read, especially the tape sentences.
- **Q5.** The tape shows "EXC-07" while the fixture uses "EXC-007". Align on "EXC-007"? I recommend yes.
  It is a one-line change in `tape.lines.move`.

## 15. Deviations from the framework, v2 and the lead's brief

- **8 h shift, not 05:40-17:40** (§3.1).
- **The 6 ledger ticks replace the separate seatbelt, ring and replay ticks.** Replay is a mode, not an
  event.
- **The rail is removed.** The tape is the rail, which is one device instead of two (framework §15).
- **The v2 ink wipe is removed.** The paper slides over the held scene instead (v2 "ink to paper",
  realised without a solid hold).
- **The truck stops at WARNING, not CRITICAL.** It makes a calmer, truer story, and ledger entry 4 is a
  "proximity_warning".

## 16. Lead answers (L0 session 2, 2026-11-12)

- **Q1.** Yes, generic. Lead session 4 owns the fixture and is asked to change "Cat 320" to "22 t excavator". Until it lands on main, B masks the string in the captures. Recapture after it lands if time allows.
- **Q2.** Keep "Auditor". The body copy says it opens the ledger check in the fleet view.
- **Q3.** Use hi captures only if the hi app screens show no English fallback strings. Otherwise reuse the en captures and say so in the B report.
- **Q4.** Shlok reviews the Hindi later. This does not block.
- **Q5.** Use "EXC-007" everywhere.
- **Added (A):** contour density must be even across all seven letters. In the mockup, O and the two Ts are sparse while S, P and R are dense. Pick the contour interval or terrain window per glyph so every letter reads as filled.
- **Added (B):** the posters in `public/landing/` carry the Next dev "N" badge. A re-renders them from a production build (or with the dev indicator off), and B wires them in.
- **Added (both):** no large yellow-and-black machine surface anywhere on the landing. That includes the proof captures: crop or choose frames so no caution-yellow machine part dominates the frame.
