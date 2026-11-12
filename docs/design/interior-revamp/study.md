# Interior revamp study: beating the reference cockpit

- Status: design study, 2026-11-12, ui-ux-lead. No production code changed, nothing committed.
- Scope: the signed-in portal, `/op` (operator) and `/fm` (fleet manager).
- Reference: https://aayushvz.github.io/cat-operator-assistant/ (probably another hackathon entry). It was studied from
  its public source (`index.html`, `styles.css`, `app.js`, `live.js`, `data.js`, `machine3d.js`, read in slices), from
  Shlok's own signed-in screenshots in `ref/` and from two public login captures. Nobody signed in to it from this
  session. Its source says "All rights reserved. Viewing only". We took ideas only: no code, art or text was copied.
- Ours: the live site at https://spotter-five-brown.vercel.app (`/op`, `/op/training`, `/fm`, captured at 375 and 1440
  for this study); D14 "Ink Frame" (`../portal-redesign-study.md` §3 and §5; decisions D14-D16);
  `../visual-language.md`; `../screens.md`.
- Deliverables: `mockups/{bay,sheet}-{home,inbox}.html` (shared `mockups/kit.css` and `mockups/machine.js`), and
  `png/<dir>-<screen>-<width>.png` at 1440 and 375. The reference captures are `png/ref-login-{1440,375}.png` plus
  Shlok's `ref/*.jpg`.

---

## (a) Reference teardown

### What makes it feel good
1. **A cockpit that never loses the safety summary.** Three panels: a left nav, a centre stage and a right
   "Telemetry" rail (Safety: seatbelt, site warning, nearest person, stop zone; Machine: Hydraulics Fault, Tracks
   Check soon; Alerts with a count). The rail is the same on every page (`ref/ref-*-800.jpg`), so the operator
   always knows where to look.
2. **The machine is the index.** A three.js excavator (`machine3d.js`, a procedural model on three r128) sits in the
   middle with part hotspots. A problem has a *place*: "Boom cylinder leaking oil" lights the boom. On the Machine
   page the legend reads Fix now, Check soon and Fine, which are plain words, not codes.
3. **The day as a strip.** The "Today's shift" track shows Working, Waiting, Lunch and alert pins, and has a playhead
   you can play at 1×, 2× or 4× or snap to Now (`renderHome`, `updateReplay`). The day becomes a single object you
   can understand at a glance.
4. **Learning at the right moment.** The "While you wait" card (`updatePitstop`) appears after 3 minutes of idling,
   picks a video by context (belt off, or idling with the engine on) and says "The arm stays locked." The timing is
   very good.
5. **Motivation cards.** "Your pace" races a ghost of your own best time in the same conditions. The seatbelt card
   shows the share of the day with the belt on.
6. **Rules that depend on conditions.** "Stop zone today 7.5 m" because of rain. The safety rule moves with the
   weather, and the screen says why.
7. **Polish in motion.** Staggered card rise, a sliding pill in the segmented controls, a nav indicator that glides,
   count-ups, all on a fast ease-out (`--ease-out: cubic-bezier(.23,1,.32,1)`). The edge of the screen glows red on
   danger (`flashEdge`).
8. **Density on desktop.** At 1440 no canvas is wasted. Even the login is a tidy two-pane card with "Who is
   driving?" and a short three-step progress list (`png/ref-login-1440.png`).
9. **Friendly microcopy.** For example, "Your jobs today. If one runs long, the rest move." The Learn page has a
   top-down cab map with 10 numbered controls (`ref/ref-learn-800.jpg`).

### Its weaknesses (where we win)
| Area | Evidence | Our counter |
|---|---|---|
| Legibility | 213 of 321 declared font sizes (`font` and `font-size`) are 13.5 px or less. Body text is 13 px, and `body { zoom: .9 }` cuts it to about 11.7 px. | Body 18 px, nothing below 15 px for operators (visual-language §2.2) |
| Contrast | `--t3 #9A9A96` on white is about **2.8:1**, below WCAG AA. Status pills are pale tints with coloured text (`--ok-bg #E3F4EA`), which wash out in sun. | Ink on paper 16:1; safety colour only as a filled plate with an ink border |
| Colour alone | The red edge glow is peripheral and carries no word. Online is a green dot. | Colour, pictogram and word, every time |
| Hover | A `pointermove` tooltip system and 30 `@media (hover: hover)` blocks. Collapsed-nav labels exist only as tooltips. | No hover-only meaning; labelled 80 px targets |
| Honesty | The SOS overlay (`openSOS`) says "Supervisor A. Singh told", "Site medic on the way, about 4 minutes away", then ticks each step on timers, with no demo label. "Live" sits beside a simulated clock. | Dry-run SOS labelled as such; "Demo data · 10× speed"; SIM captions (D15) |
| Network | "While you wait" pulls YouTube thumbnails and videos (`i.ytimg.com`), so it fails with no signal. | Offline picture lessons (ours are animated SVG) |
| Safety logic | "Your pace … slower than your best" races the operator against a personal best on heavy equipment. | We do not reward speed (open question 2) |
| Phone | At phone width the cards leave the stage and stack below it (code comment: "the cards would cover the machine"). The phone header is icons only (P, pulse, moon) without labels (`ref/ref-home-536-scrolled.jpg`). | The phone layout is designed first; the dock is labelled |
| Literacy | Text-heavy, and it truncates: "than your best time of…" | Plain words, [Listen] on sections, numbered parts |
| Trade dress | Cat logo, yellow-and-black surfaces, decals on the 3D model. That is legal risk for them, and our rules forbid it. | Unbranded ink line drawing; yellow means caution only |
| Idle motion | The 3D model sways ±11° continuously (`SWAY`); a beacon and pulses loop. | Nothing moves on its own (visual-language §5) |

Hindi: their nav labels are keyed by language and Noto Sans Devanagari is loaded. How deep the Hindi goes was not
checked.

## (b) Our interior's gaps against it, screen by screen (live, 2026-11-12)
| Screen | What we have | Gap |
|---|---|---|
| Band, all screens | Ink band, state plate, "FIXTURE 09:40 ×10", En, Ask | "FIXTURE" is jargon. There is no sync state, heat or machine identity in the frame. |
| `/op` Home, 1440 | Hero card (READY, 0 %, 77 min), WBGT plate, Today's tasks, Simple/Detailed | About half the canvas is empty. There is no machine, no picture of the day, and no route into learning when nothing is assigned. It feels like a phone page stretched to a desktop. |
| `/op` Home, 375 | Legible, big targets, labelled dock with SOS | Strong for sunlight, but it is a stack of single facts. There is no "what next / why" and no machine context. Keep its legibility. |
| `/op/training`, 1440 | Assignment list, lesson, "New to practice?" | The guide sheet renders over the list so that both read through each other (seen in this capture). Weak hierarchy. |
| Replay | Brief → Investigate → Decide → Debrief, ink theatre (D14 phases 1-4 built) | Our best asset is two taps deep. The reference's timeline makes "replay" feel central; ours is better but hidden. |
| `/fm` Inbox, 1440 | Split view, tier-sorted queue, detail with Acknowledge | About 70 % of the detail pane is empty: no machine or part, no dispatch timeline, no ledger link. The tier filter shows bare numbers "1 1 4". |
| `/fm` Ledger, Analytics, Map | Not re-captured this session (prior captures are in `../portal-study/current/`) | The ledger story is strong but appears only on its own page. It should show in the band and in every alert detail. |

## (c) Two directions that beat it

Both keep everything in D14: the ink frame (band and dock), the single state plate, the paper work surface, mono
provenance captions, numbered section labels, −0.03em tracking on Latin display type, the Debrief theatre on ink,
plain-word labels, [Listen], mobile triage, SOS in a fixed dock slot and never floating, Map inside Safety, and four
operator destinations. Both add three things the reference taught us, built our way:
1. **Machine hub:** our own unbranded line drawing of the machine. Parts carry numbers and words. A part takes a
   safety colour only while it is in that live state, and a parts list is the accessible twin of the drawing.
2. **Shift tape:** the day as Working, Waiting (dotted ink), Break and Planned. Its marks are *real events that open
   Replay*: tap "09:52 Belt off" and you practise that moment. The reference's timeline only replays a clock.
3. **While you wait:** a lesson offered only when the machine is parked or the task is paused and nothing is moving.
   It runs offline and stops the moment the machine moves.

### Direction 1: "Machine Bay" (machine-centric cockpit)
**Idea:** the centre of Home is a paper "bay", a drafting-grid stage with the machine drawn in ink. The work state
word (PAUSED) sits on the stage as the loudest thing (rule 4), with numbered part tags around it. On desktop a "3D"
toggle swaps the drawing for our existing procedural excavator (`apps/web/src/components/landing/scene/excavator.ts`,
three is already a dependency, the model has no brand features and has its own `ramMat`), re-skinned as a paper
model with ink edges.
- **Type scale:** stage state word `clamp(76px, 7.2vw, 104px)/.9` Barlow Condensed 800, −0.03em; figure 48/1 tnum;
  title 26/1.15; tag 17/1.1 700 + mono caption 15; body 18/1.45; mono caption 15 (+0.02-0.04em); FM timestamps mono
  14 (Detailed mode allows 13).
- **Colour tokens:** today's tokens plus D14's frame tokens, plus `--bay #E7E4DB` (stage paper; ink on bay ≈ 14:1)
  and `--bay-grid rgba(22,21,15,.07)` (decorative). 3D materials: body `--surface`, edges `--ink`, undercarriage
  `--ink-2`, beacon off. A part is filled with a state colour only for a live state; inside Replay it is an ink
  outline (visual-language §1.1).
- **Layout:** **1440**: dock 112 | stage (1fr) with the shift tape below | rail 400 (Now, While you wait, Practice).
  It fits 1440×950 with no scroll. **768**: dock at the bottom; stage full width with tags replaced by number pins;
  Now and Practice side by side; tape full width. **375**: band; stage (drawing, no tags, the live part filled);
  parts list (80 px rows); Now; While you wait; Practice; tape; dock with SOS.
  **FM 1440**: fleet strip of 6 machine cells; queue 380 | focus (header, bay stage with the faulty part and the
  person tag, facts with the dispatch timeline and ledger seal, actions). **FM 375**: the triage focus card (the
  most urgent alert, here the ledger break) above the queue.
- **Motion:** no idle motion, no auto-rotate. Tags fade in once in 160 ms. A tier change on a part is instant (0 ms)
  with the 480 ms stamp. In 3D: drag ±25°; tapping a tag eases the camera to the part in 320 ms (`--ease`); render
  on demand, not every frame. With reduced motion there is no camera ease and the stage starts in Drawing mode.
- **How the differentiators fit:** Replay: shift-tape marks and the Practice card open the real Replay, and the
  Debrief keeps the D14 theatre. Ledger: a band cell ("214 entries · check needed"), a seal line in every alert
  detail ("Sealed into the ledger when you act, #215"), and the triage focus when the chain breaks. Ask: the band
  button, plus [Ask about this part] in a part's sheet. SOS: the fixed dock slot, never on the stage. Near-miss: the
  row says "No name shown · trainer sees counts only". Hindi: every new string has an en/hi pair, the tags allow
  wrap, and Devanagari tracking is 0. Honesty: "Demo data · 10× speed", "Readings simulated (SIM)", "A drawing, not
  a photo", "Telegram … dry run, nothing sent".
- **Never:** an auto-rotating or swaying model; brand colours on the machine; WebGL on phones, under reduced motion,
  with Save-Data on, or while the machine moves; tags as the only route to part state (the parts list always exists).

### Direction 2: "Field Sheet" (lighter, no 3D)
**Idea:** D14 as it stands, made denser and more informative on desktop. A 12-column paper sheet: the hero card (§0
signature, unchanged), a "Your machine" card in parts-manual style (a small drawing with numbered callouts and a
callout list), the shift tape full width, then three cards: While you wait, Practice, Conditions. FM gets a richer
detail pane and a count strip.
- **Type scale:** D14 as is (state word 84-112, figure 52, title 26, body 18, mono caption 15); callout numbers 18
  condensed in a 30 px ink square.
- **Colour tokens:** no new tokens.
- **Layout:** **1440**: hero 5 columns | machine card 7 columns; tape 12; three cards at 4 columns each (about
  1440×1150, scrolls once). **768**: hero and machine stacked at 12 columns; cards 6 + 6. **375**: hero, machine
  (drawing above the callout list), tape, While you wait, Practice, Conditions, dock. **FM**: a count strip (3
  working · 1 idle …); queue 400 | detail (why, a facts table, a timeline, a small drawing, the seal); triage focus
  on phones.
- **Motion:** Site Signage everywhere outside Replay (visual-language §5); the §5.1 carve-out inside Replay.
- **How the differentiators fit:** the same hooks as Bay (tape → Replay, seal lines, Ask, SOS dock, SIM captions),
  minus the stage.
- **Never:** WebGL; any new surface type.

### Side by side
| | Machine Bay | Field Sheet | Reference |
|---|---|---|---|
| First impression for judges | Strongest (one hub, cockpit fits the screen) | Good, plainer | Strong (3D) |
| Sunlight and literacy | Same as Sheet (paper, ink, 18 px, numbered words) | Best | Weak |
| Phone | Same as Sheet (no WebGL) | Same | Weak |
| Build risk | Medium (3D phase is cuttable) | Low | n/a |
| D14 change | Amends "no WebGL in portal" (phase 4 only) | None | n/a |

## (d) Recommendation
**Build Machine Bay, Sheet-first.** Phases 1 to 3 deliver Bay's layout with the 2D drawing as the hub. At that point
it is already better than the reference on every axis except "is it 3D", and those phases contain everything Field
Sheet needs, so Sheet is the automatic fallback if time runs out. Add phase 4 (the 3D stage on desktop) only if
there is a day left and Shlok accepts amending D14's "no WebGL in the portal". The 3D work is smaller than it looks,
because the unbranded excavator, its fault material and the scene kit already exist for the landing.

## (e) Phased build plan (Sonnet implementers; sizes in lane-days: S ≤ 0.5, M ≈ 1, L ≈ 2)
Honest total: phases 1-3 + 5 ≈ **7 lane-days, about 2.5 days of wall time on 3 lanes**. Phase 4 adds **≈ 2.5
lane-days**. STATE.md calls today the final build window. If less than one day remains, ship only P1-T1, P1-T3
(drawing plus parts list) and P3-T7.

**Phase 1: foundations**
| Task | Lane | Files / areas | Acceptance criteria | Size |
|---|---|---|---|---|
| T1 Honest band | L2 | `components/chrome/status-strip.tsx`, `messages/{en,hi}.json` | "FIXTURE" never shown; "Demo data · hh:mm · 10× speed" and a Sync cell (Saved / n queued / offline); cells hide below 760 px; no horizontal scroll at 360 | S |
| T2 Part states in contracts | L1 | `packages/shared` contracts + fixtures (additive), `my_snapshot` | `machine.parts?: {id: 'seatbelt'\|'boom_ram'\|'tracks'\|'rear_sensor'\|'bucket', state: 'ok'\|'caution'\|'warning'\|'critical', note_key}[]`, optional and additive (no version break); fixture has boom_ram caution; contract tests pass | S |
| T3 MachineDrawing + parts list | L3 | new `components/machine/machine-drawing.tsx`, `machine-parts.tsx`, pure `machineParts(snapshot)` + tests | Unbranded side-view SVG with part ids; props `highlight`, `callouts: 'tags'\|'numbers'\|'none'`; parts list rows ≥ 80 px with colour + pictogram + word; tags hidden below 768 (list carries the state); Replay variant draws ink outlines only; unit tests for the mapping | M-L |
| T4 Shift tape | L2 | new `components/home/shift-tape.tsx`, pure `buildShiftSegments(snapshot, now)` + tests | Working / Waiting (dotted) / Break / Planned from tasks and events; marks for breach events with an assignment link to Replay; heat-peak mark from `weather.forecast_peak_at` labelled "scenario forecast"; on phones the marks are also listed as 80 px rows; now-line static (moves per sim minute, no tween); en/hi | M |

**Phase 2: operator Home**
| Task | Lane | Files | Acceptance criteria | Size |
|---|---|---|---|---|
| T5 Bay layout | L2 | `components/home/home-screen.tsx`, `styles/home.css` (new, tokens only) | ≥ 1024: stage (state word + drawing + tags + Drawing/3D seg + Listen) and tape \| rail 400 (Now, While you wait, Practice); 1440×950 fits without scroll; 768 and 375 as in §(c); the hero §0 data are all present (word, task, %, p50/p90, safety) | M |
| T6 While you wait | L3 | `components/home/loop-card.tsx` (variant) | Shown only when the task is paused/blocked, the machine is not moving, an assignment exists and idle ≥ 3 sim-min; hidden instantly on motion; "Stops the moment the machine moves"; works offline | S-M |

**Phase 3: FM**
| Task | Lane | Files | Acceptance criteria | Size |
|---|---|---|---|---|
| T7 Inbox detail | L2 | `components/inbox/inbox-detail.tsx`, `styles/portal-fm.css` | Header (tier plate + title + machine/operator); why sentence; facts; dispatch timeline from the alert's dispatch fields with "dry run, nothing sent"; ledger seal line linking to `/fm/ledger`; drawing with the faulty part (when parts exist); tier chips read "Critical 1 · Warning 1 · Caution 4" | M-L |
| T8 Fleet strip | L3 | new `components/inbox/fleet-strip.tsx` | 6 cells (code, operator · task, state plate) from existing fleet data; selected alert's machine underlined; phone shows 3 cells; counts version for Sheet | S-M |
| T9 Band ledger cell + triage check | L2 | `status-strip.tsx`, `inbox-screen.tsx` | FM band shows ledger state from the last verify; phone triage focus = highest tier (ledger break shows Verify + Compare actions) | S |

**Phase 4: 3D stage (optional; needs a D14 amendment)**
| Task | Lane | Files | Acceptance criteria | Size |
|---|---|---|---|---|
| T10 Paper-model stage | L3 | new `components/machine/machine-stage-3d.tsx`; reuse `landing/scene/excavator.ts`, `parts.ts` | Dynamic import (not in the initial chunk); paper material + `EdgesGeometry` ink lines; live part via `ramMat`; drag ±25°, no auto-rotate; render on demand; tags projected from the same part ids as T3; falls back to the drawing below 768, under reduced motion, with Save-Data, without WebGL, or while moving | L |
| T11 Perf/a11y gate | L3 | same | Home JS on phones unchanged (3D chunk not loaded); desktop Lighthouse perf within 5 points of the current one; keyboard: tags focusable in reading order; the canvas is `aria-hidden` with the parts list as its text twin | M |

**Phase 5: QA (lead + validator)**: en/hi parity of new strings; 360/375/768/1440 screenshots; contrast of
`--bay`; axe; reduced motion; a phone photographed outdoors at full brightness; no "FIXTURE", no undisclosed
simulation, no brand marks. Size M.

### Deviations from the framework, and why
1. Bay phase 4 amends D14's "Never: WebGL in the portal". It is desktop-only, off by default under reduced motion,
   and the 2D drawing stays the source of truth.
2. `--bay` and `--bay-grid` are new tokens (Bay only).
3. Desktop part tags are 56 px tall, below the 80 px operator rule. Under `pointer: coarse` they grow to 80 px, and
   on phones the parts list rows (80 px) are the targets. The mockup rows are 56 px; the build must use 80 px.
4. Shift-tape marks are 34 px labels, not targets, on phones; the list of marks below the tape is the target.
5. FM timestamps are mono 14 px (Detailed mode allows 13).

## (f) Open questions for Shlok
1. **WebGL in the portal:** may phase 4 put the 3D machine on desktop Home (amending D14), or do we stop at the
   drawing?
2. **Pace:** do we show any pace comparison? Recommendation: no race against a personal best. Show only "longer than
   usual because of heat" (already in ETA factors).
3. **Time:** how many build days remain after today's window? That decides between Bay with 3D, Bay without 3D, and
   phase 1 only.
4. **Part-level data:** is it acceptable to add simulated `machine.parts` states (SIM-labelled) to the fixture and
   contracts (additive), so the hub has something real to point at?
