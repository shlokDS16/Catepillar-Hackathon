# Landing v3, implementer A: review

Diff: `origin/lane/l0-landing-v3-docs...origin/lane/l2-landing-v3-a` (1 commit, e29e014). Reviewer: code-reviewer (Opus), 2026-11-12.

**Verdict: CHANGES REQUIRED** (1 High, 3 Medium, 7 Low)

## What I ran (scratch worktree, removed afterwards)

- `tsc --noEmit`: no errors. `eslint`: clean. `vitest run`: 211 files, 544 tests, 544 passed (the 12 in `scene/timeline.test.ts` all pass). `next build`: green.
- `pnpm landing:contours` again: same output, sha1 `d8fd8e3b92`. The committed SVG is deterministic.
- `next dev` with `?still=` in a headed agent-browser at 1440 x 900 and on an iPhone 14 viewport. Headless Chrome had no WebGL, so it reported `data-gl="off"`. To read `getReadout()` I added a one-line `window.__ctl = ctl` hook to the scratch copy of the engine only, and reverted it.
- `next start`: none of the 9 script chunks on `/` contains three.js. Only the dynamic chunk `1ti0rx6_fojdo.js` has `WebGLRenderer`.

## Verified

- **Acceptance 12.4, stage 4 at .45:** `?still=4:0.45` gives `ring 3` (WARNING), `nearestM 11.987`, `data-ring="3"`, and a visible truck anchor. 12 m ±0.5 holds.
- **Acceptance 12.4, stage 5 at .3:** `?still=5:0.3` gives clock 651.3 min (10:51), below 11:00, and `replay: true`.
- **Hard constraint (frozen files):** `scene/excavator.ts` and `scene/parts.ts` have a zero-line diff, so nothing breaks for the lane that imports them. `index.ts` keeps every old export and adds `SceneAnchorId` and `SceneReadout`.
- **`shift.ts`:**
  - It is byte-identical to the spec §8.3 block.
  - It is also identical to B's local branch: both are blob `b6dcfba`, so the add/add merges cleanly.
- **`contours.svg`:**
  - Size: 71,520 B with gzip -9 (73,458 B with default gzip), under the 75 KB limit.
  - Structure: `<g id="map">`, colours only through `var(--…)`, and the classes `cf cm cM road ring trail`.
  - The A branch never references the file, so lazy loading depends on B's `<use>` inside `content-visibility:auto`.
- **Posters:**
  - Sizes: 10 files at 1440 x 900 or 750 x 1300, all 23 KB or smaller.
  - No dev badge in any corner, no Caterpillar marks, and no yellow-and-black surfaces (the machine is white and grey).
- **Phone path:**
  - On a 390 px phone with DPR 3, the canvas is 390 px wide, so the device pixel ratio is 1.
  - Compact mode sets the shadow map to 1024 PCF, turns dust off and caps the frame rate at 30 fps.
  - The governor is kept.
- **Reduced motion:** no scene is created (`data-motion="reduced"`, no controller).
- **Disposal:** `dispose()` is unchanged and still traverses the scene. The new code adds no GPU resources: the `route.ts` cache holds CPU-side curves only.

## Findings

### High

**H1. Stage 5 raises false CAUTION and WARNING states.** (`scene/index.ts:618`, also used at `:639-642` and `:660`)

- **Cause:** the ring level is now measured from the moving excavator, but the rings stay centred on the origin. The truck also stays parked where stage 4 left it, 28.9 m from the origin.
- **Effect:** the replay drives the machine toward the parked truck.
- **Measured readouts:**
  - `5:0.45`: ring 2.
  - `5:0.5`: ring 3, 11.05 m.
  - `5:0.55` and `5:0.59`: ring 3, about 10.4 m.
- **Failure scenario:** at p .55-.59 the clock reads 11:00-11:02 in fast-forward. At that point:
  - `onRing(3)` fires and `data-ring="3"` is set;
  - the beacon and the boom ram glow warning red, and `halt` engages;
  - `getReadout().ring` is 3.

  There is no ledger entry at that time, and a judge sees a warning that the record does not contain.
- **Fix direction:** in stage 4, measure the distance to the rings' centre (the origin). Hold `level` at 0 once `ps[4] > 0`, or measure to the truck's stage 4 pose.

### Medium

**M1. The replay rewinds to the wrong moment.** (`scene/index.ts:101`, `:272-275`)

- `REWIND_T = 0.82` is the point on the trail the machine reached at about 08:50: inverting stage 3's `inout(p/.85)` gives p .504, which is clock 530.6. That is entry 3 (overspeed), not entry 4 (10:44).
- The clock says 10:44 while the machine is two hours earlier on its path, and 10 m from a truck that was never there.
- This mismatch causes H1.
- **Fix direction:** entry 4 happened with the machine parked at t = 1. Either rewind the truck and the rings instead of the trail, or get the lead to define `S5.rewindToT`.

**M2. The stage 4 thresholds sit exactly on the ring radius.** (`scene/route.ts:599-606`, `scene/route.ts:495`)

- The schedule puts the front at exactly 12.000 m at `warnAt`, and again at `caution`.
- The still shows WARNING only because the machine sits 1.3 cm off the origin (the `tc` clamp at .9999), which gives 11.987 m.
- At `4:0.449` the state is CAUTION. At `4:0.80` it is still WARNING, but spec §5 says caution at .80.
- **Fix direction:** aim at about 11.8 m on the way in and about 12.2 m on the way out, so each acceptance still lands inside its state.

**M3. The contour density is even by measure but not to the eye.** (`scripts/landing-contours.ts:34-37`; `docs/design/qa/landing-v3/A-footer-contours.png`)

- **What I see:**
  - O and both Ts are filled with 6 mm `cf` contours of micro-noise, which read as grey speckle with two or three bright bands.
  - S, P, E and R show bright, flowing bench lines.
- **Why the measure misses it:** the max/min ratio of 1.22 counts line length. It does not count visual weight (stroke class and opacity).
- **Legend:** the footer legend "every 1.6 m" is now false.
- **Answer to the design-literate-judge question:** two textures in one word read as a defect.
- **Fix direction:**
  - Weight the metric by class.
  - Floor the fine interval at about 0.1 m.
  - Adjust the window or offset per glyph.
  - Have B reword the legend.

### Low

**L1. The truck anchor's id is cast, and §8.3 is not followed.** (`scene/index.ts:460`)

- `"truck" as unknown as SceneAnchor["id"]` is a type hole and a deviation from §8.3.
- B's local branch already widens `Anchor.id` to include `"truck"`. Once that lands, widening `SceneAnchor.id` compiles, because `SceneAnchor[]` is assignable to the wider `Anchor[]`.
- **Fix direction:** widen the type and drop the cast.

**L2. Compact devices still run ring pulses.** (`scene/index.ts:627`)

- The report says "no pulses", but the pulses still run there, and `pulsing` keeps frames rendering.
- The dig cycle also keeps compact devices at 30 fps through S1, S2 and S4. The spec allows this, but the report overstates the savings.

**L3. Some of the 12 tests are weak, and two cases are untested.** (`scene/timeline.test.ts`)

- 10 of the 12 are real: they sample the geometry.
- The other two are weak:
  - "seatbelt window inside band" only restates constants;
  - the clock test checks frozen `shiftClock` with a ±5 min margin.
- **Untested:**
  - ring level against the actual machine position (the route tests use `MACHINE_XZ`, so H1 slipped through);
  - `trailT` and replay.

**L4. The S4 distance figure starts at 67.2 m.** `nearestM` reads 67.2 m for p ≤ .12, but §3.5 expects "41 → 7.4 m". (`route.ts:600`)

**L5. Two posters are weak.**

- `poster-2`: the machine is pushed to the right edge, with its tracks about 35 px from the edge at 1440, and the lower half is empty floor.
- `poster-5`: the machine is about 25 px tall.
- Posters 1, 3 and 4 read as crafted.

**L6. The generator would be hard to explain.** (`scripts/landing-contours.ts`)

- It is 355 lines, over the ~300 guideline.
- It has undocumented environment-variable knobs (`CONTOUR_KMAX/SPACING/TOL/COARSE`).
- `:339` patches the SVG string (`.replace("stroke-width:var(--rdw,0)", …)`).
- The road's floor x values (−44..−2) differ from those of the route (−34..−4.98).
- These are hard to defend in two sentences.

**L7. For the lead, not A:** at `4:0.45` the frozen `shiftClock` gives 643.5. If the tape floors that, it shows 10:43, but acceptance 12.4 expects 10:44.

## Collision with B

- `shift.ts` is identical on both branches, so it merges cleanly.
- The 4-element `getAnchors()` is harmless to the v2 engine, which finds anchors by id. B already finds `"truck"` by id.
- B writes `data-ring` from `onRing` in every stage, so H1 reaches B's legend chips and CSS state.
- If B imports `RING_R` or `ringLevel` from `scene/route.ts`, three.js lands in the initial JS. B should keep importing only `shift.ts`.

## Re-review (fix commit 3fe1f27)

**Verdict: APPROVE.** H1, M1, M2 and M3 are closed. There are no High or Medium findings left. Four Low items stay open, listed below.

### What I ran (fresh scratch worktree at 3fe1f27, removed afterwards)

- `tsc --noEmit` is clean and `eslint` is clean.
- `vitest`: 547 of 547 tests pass, including all 15 in `timeline.test.ts`. `next build` compiles.
- **Frozen files:** `scene/excavator.ts` and `scene/parts.ts` still have a zero-line diff against `origin/lane/l0-landing-v3-docs`.

### How the stills were checked

I used `next dev` with `?still=` in a headed agent-browser at 1440 x 900. The readouts came from a `window.__ctl` hook in the scratch copy only. The v2 engine on this branch has no `&ui=1`.

For the screenshots I hid everything except the canvas, then called `renderOnce`:

- `re2-4_0.45.png`
- `re2-5_0.3.png`
- `re2-5_0.54.png`
- `re2-5_0.58.png`

These files are in the reviewer scratchpad and are not committed.

### Readouts (`data-ring` / `ring` / `nearestM`)

| Still | Ring | nearestM |
|---|---|---|
| 4:0.43 | 2 | 12.40 |
| 4:0.45 | 3 | 11.79 |
| 4:0.62 | 3 | 7.38 |
| 4:0.80 | 2 | 12.19 |
| 4:0.90 | 1 | 18.19 |
| 4:1 | 0 | 28.93 |
| 5:0.05 | 0 | 27.5 |
| 5:0.2 | 2 | 14.3 |
| 5:0.3 | 3 | 7.38 |
| 5:0.54 | 3 | 11.77 |
| 5:0.56 | 0 | 11.79 |
| 5:0.59 | 0 | 11.79 |
| 5:0.7 | 0 | null (truck hidden) |

### Findings

- **H1, closed.**
  - `ringLevelFor(ps)` is pure and drives `onRing`, the glow and `getReadout().ring`. It is 0 once the replay ends at p .55.
  - The machine is parked at the trail end, so no state appears without a ledger entry.
  - The new tests check the real stage 5 truck position, so they would have caught the original bug.
- **M1, closed.** `REWIND_T` is gone.
  - The replay winds the truck back from 28.9 m, through the 7.4 m closest approach, to the 11.8 m warning pose at p .55.
  - At `5:0.3` the clock reads 10:51 and the truck is at its stage 4 pose for p .69, which corresponds to clock 10:50.6. The scene and the clock agree to under a minute.
- **M2, closed.** The margins are 0.2 m and are verified at runtime:
  - WARNING at .45 with 0.21 m inside the ring;
  - CAUTION at .43;
  - CAUTION at .80 with 0.19 m outside the ring;
  - CAUTION or below at .90.
- **M3, closed.** `A-footer-contours.png` now shows all seven letters filled with the same kind of bright, flowing line. The grey speckle in O and the Ts is gone.
  - T2 and E are slightly lighter than S, but it reads as one drawing.
  - `contours.svg` is 59,115 B with gzip -9. It keeps the same classes and the `var()`-only styling.
- **L1:** deferred to B by design. Accepted.

### The deviation: the machine stays parked and the truck rewinds

The story still reads. The stage 5 rewind is stage 4 played backwards: the rings stay full size and the truck rolls in to 7.4 m and back out to 11.8 m while the clock runs from 11:00 back to 10:44, so "replay the proximity warning" lands.

Two departures from the spec to record in `decisions.md`:

- Spec A3's "trail head rewinds, then redraws ghosted" is dropped. The trail stays full and ghosted through stage 5.
- At p .55-.60 the truck sits just inside the 12 m ring with the state neutral while the rings fade. That window is 5 % of the band, and B's stage 5 readout slot is the replay card, so it is acceptable.

### Still open (all Low)

- **L4:** `nearestM` starts at 67 m, while spec §3.5 expects 41 m. This is the lead's call.
- **L5:** `poster-2` still has its tracks about 70 px from the right edge. It is improved and acceptable.
- **L6:** the road style patch (`landing-contours.ts`) and the mismatch between the road's and the route's floor x values remain.
- **New, Low: stale comment.** At `scene/index.ts:568-569` the comment still says "In stage 5 the trail rewinds with the machine ... redraws". That is no longer true, so delete it.
- **L7:** for the lead, as before.
