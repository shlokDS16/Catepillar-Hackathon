# Review: lane/l3-landing-v2 (head 6c0f06c) against origin/main

Reviewer: code-reviewer (Opus), 2026-11-12. Contract: docs/design/landing-v2-spec.md "Acceptance".
Scope: 63 files, +2389 / -559 (`git diff --stat origin/main...origin/lane/l3-landing-v2`). No code changed, nothing committed.

## Verdict: CHANGES REQUIRED

Blocker 0 · High 3 · Medium 6 · Low 9

## Gates (fresh worktree, `pnpm install --frozen-lockfile`)
| Gate | Result |
|---|---|
| `pnpm --filter web typecheck` | `tsc --noEmit`, exit 0, 0 errors |
| `pnpm --filter web lint` | `eslint`, exit 0, 0 problems |
| `pnpm --filter web test` | Test Files 22 passed (22), Tests 266 passed (266) |
| `pnpm --filter web build` | Next 16.3.6 (Turbopack) compiled successfully, 16/16 pages, exit 0 |

## What passes (checked, with evidence)
- **three.js is still lazy.** The only chunk that contains `WebGLRenderer` is `363s8htggyzqt.js` (625 KB). It is not among the 9 scripts in the SSR HTML of `/` (`next start`). In the browser it loads at about t = 1030 ms, on idle, after the initial chunks (all at t = 24 ms).
- **The SSR LCP content comes first.** The inline `DawnPoster` SVG and the `<h1>` text are both in the server HTML. The canvas fades in only after the first frame (`onReady` sets `data-gl="on"`; landing.css:71 and 312).
- **No-JS hero.** The noscript style turns off the `.ln-i` transform and animation (landing.tsx:95), so the headline is not hidden without JS.
- **Teardown.** `dispose()` (scene/index.ts:743-759) disposes geometries, materials, the glow texture, the env RT and the shadow map, then calls `renderer.dispose()` and `forceContextLoss()`. It also removes the pointer listener. The engine guards a late `import()` with `disposed` (landing-engine.tsx:158).
- **Damper.** `Damped.to` snaps when dt <= 0 (index.ts:48), so dt = 0 gives no NaN. Other guards: `Math.max(0.1, dm)` (644) and `|| 0.016` (692).
- **Triangle budget**, measured with a throwaway vitest that was deleted afterwards:
  - excavator 8,980 tris in 23 meshes (budget < 40k);
  - truck 2,768 tris in 22 meshes;
  - terrain 231,200 tris on desktop and 115,200 on compact;
  - rocks 57,600, instanced.
  - Terrain does not cast shadows.
  - The trail floor is flat within ±7 cm, so the machine at y = 0 does not float.
- **Layout at 360 and 375 px.** No horizontal scroll (scrollWidth equals innerWidth). The stage 2-5 copy blocks and the stage 6 ledger fit inside 812 px.
- **en/hi parity.** Same key sets. `rail.label`, `rail.go`, `wipe.band` and `s4.body` exist in both.
- **Honesty and branding.**
  - The SSR HTML has 7 `.l-caption` "Simulated data. Illustrative shift, not a real site." and the wipe band says "simulated shift".
  - There are no Caterpillar marks. The paint is off-white `--machine-body` with graphite. Yellow appears only as the caution state token.
- **Lane rules.** Nothing in the diff touches SOS, Twilio, SMS or Telegram, and no such request was made during this review.
- **Leader SVG.** `aria-hidden="true" focusable="false"` (landing.tsx:161).
- **Reduced-motion wipe.** An instant `router.push` (wipe-link.tsx:57).

## Item 8 (stage 2 callouts), measured at 1440x900 in `next start`
- **All three leaders do appear.** They are staggered by design: leader/callout i has `--a 0.3+0.2i`, `--b 0.4+0.2i` (landing.tsx:163, 171).
  - Measured opacity: p 0.5 gives 1 of 3, p 0.6 gives 2 of 3, p 0.8 and later give 3 of 3. All anchors report `visible: true`.
  - "1 of 3 at p≈0.5" is expected, not a bug. Only the third leader's timing needs a decision: p 0.7-0.8 is late, so most users scroll past it.
- **The pairing is wrong by meaning** (finding H2).
- **The leader endpoints freeze while the machine moves** (finding H1).

## Findings

### High
1. **The leader lines go stale between scroll events.** landing-engine.tsx:92 (`drawLeaders` is called only from `frame()`, which runs on scroll and resize).
   - The dig cycle and the house slew keep animating, so the dots stop matching the machine.
   - Measured at p 0.9 with no scroll for 3 s: the endpoints stayed fixed. Forcing redraws showed the bucket anchor moving between (530, 614) and (929, 452), up to about 400 px of drift.
   - Fix: while `now === 2`, redraw from the scene's own tick. Either add an `onFrame` callback to `SceneOptions` and call `drawLeaders` there, or run an engine rAF loop while stage 2 is active.
2. **Anchors are paired with labels by vertical order, not by meaning.** landing-engine.tsx:105-111.
   - The scene returns a fixed order (cab, cylinder, bucket; index.ts:31). The engine re-sorts it by y.
   - As a result, c1 "Boom and stick, read live" gets whichever anchor is highest. c3 "Works on a patchy bench connection" lands on the bucket, which means nothing.
   - The bucket rises to within 15 px of the middle anchor during the dump pose (measured), so the pairs can swap mid-cycle.
   - Fix: pair by index with a fixed map: c1 to the cylinder, c2 to the cab, c3 to a new roof-antenna or beacon anchor. Drop the sort, and route lines with an elbow if they cross.
3. **Copy contrast over the scene fails AA.** The scrim is in landing.css:335-345; the copy is in `.l-copy-left`.
   - The left scrim is ink at 55 % fading to 0 by 45 % of the width. At 1440 px the 440 px copy block ends where the scrim is about 15 %.
   - Over the v2 dawn terrain (docs/design/qa/l3v2-scene-4-1440.png, which includes `.l-grade`), the headline sits on about #9c8f86 to #a29483. Estimated contrast for `--on-frame` is about 2.6:1, below 3:1 for large text.
   - The 17 px body (`--on-frame` at 82 %) is about 3:1, against 4.5:1 required.
   - Fix: make the scrim ink 70 % to 0 across 0-55 % (or add a bottom-left radial at about 60 %). Then measure stages 2-4 at 1440, 768 and 375 with real pixels.

### Medium
4. **No handler for WebGL context loss.** scene/index.ts:156-168 and landing-engine.tsx:159-168.
   - On `webglcontextlost` the canvas goes black. `data-gl` stays "on", and that keeps the posters hidden (landing.css:71 and 607).
   - Fix: listen for `webglcontextlost` with `preventDefault`, stop the rAF, set `root.dataset.gl = "off"` (posters return), and remove the listener in `dispose`.
5. **No-JS stage 5 shows a flat ink panel instead of poster 5.**
   - `.l-ink` carries `.rv` (landing.tsx:238). The noscript rule `.landing .rv{opacity:1!important}` (landing.tsx:95) makes the full-bleed ink (z -1, landing.css:1122) cover the poster (z -2).
   - In the same way, `.leader.rv` is forced visible, which draws three dots at (0, 0) of the stage 2 pin.
   - Fix: add `.landing .l-ink,.landing .l-leaders{display:none!important}` to the noscript style.
6. **The no-JS stack shows no callout text and the wrong ledger story.**
   - `.callout-n` and `.callout-t` use `opacity: var(--e)`, which is 0 at `--p:0` (landing.css:407 and 415). This existed on main and is not covered by noscript.
   - `.lrow-flag` uses `opacity/max-height: var(--et)` (754), so "Row 4" is never named.
   - `.st-ok` shows "chain verified" (663).
   - Fix: in noscript, set `.landing .stage[data-stage="6"]{--p:1}` and `.landing .callout-n,.landing .callout-t{opacity:1!important;transform:none!important}`, mirroring the reduced-motion block.
7. **The hero line animation hides the LCP headline for up to about 0.92 s with JS on.**
   - The rule is `animation: ln-rise 0.8s both` plus a 60 ms × i stagger (landing.css:955-958).
   - The `<h1>` first paints fully clipped (translateY 105 % inside overflow:hidden). LCP then waits for it or falls back to the smaller `.l-sub`. This contradicts "the headline is the first thing painted".
   - Fix: paint the hero lines in place (no initial translate). Animate only non-LCP elements, or start from a partial offset with the text visible.
8. **The QA captures are stale.**
   - docs/design/qa/l3v2-page-s1..s7-*.png were added in 4785a53, before the v2 scene merged. They show the v1 box excavator on a flat plane, and s4 still says "A walker steps in".
   - The spec requires real captures of the new scene.
   - Fix: recapture all `l3v2-page-*` at 1440, 768 and 375 from head, with the scene running.
9. **The wipe resolves into an Ink Frame that the destination does not have.**
   - wipe-link.tsx:65-91 builds a 56 px band, a 64 px dock and paper. No route outside the landing uses `--frame` (grep), so the veil fades into a portal without the frame.
   - Fix: either land portal B's frame for `/op` (origin/design/portal-study) in the same geometry, or end the wipe on paper only and record the gap in decisions.md.

### Low
10. **The kicker's aria-label is on a `<p>`** (landing.tsx:42). Naming is prohibited for the paragraph role, and the visible digits are `aria-hidden`, so many screen readers announce nothing. Fix: use a visually-hidden text span instead of aria-label.
11. **Rail issues** (landing.tsx:102-111; landing.css:1020 and 1082).
    - There is no `aria-current` on the active tick.
    - The labels "Part n of 7" do not name the stages.
    - During stage 6, before the paper rises, the rail is ink on `--frame`, so it is invisible.
    - A rail click does not move focus.
    - Fix: set `aria-current="step"` from `data-now`, use stage titles in the labels, and switch to the ink colour only once `--e` > 0.5.
12. **The governor never decays its slow-frame count** (index.ts:704-713). Thirty janky frames spread over minutes permanently drop the DPR. Fix: reset `slow` after a run of fast frames, or use a rolling window.
13. **dt can be negative on resume** (index.ts:692). The rAF timestamp can be earlier than the `performance.now()` taken in `setRunning`, and `Math.min(0.25, neg)` passes it through. The camera then snaps and time steps backwards. Fix: `Math.max(0, …)`, or seed `last` on the first tick.
14. **Per-frame allocations.**
    - index.ts:512, `curve.getPointAt(tc)` without a target;
    - index.ts:635, `camera.position.clone()`;
    - index.ts:741, a `map` spread in `getAnchors`;
    - landing-engine.tsx:105-110, arrays on each scroll frame.
    - Fix: reuse scratch vectors and fill arrays in place.
15. **The tampered-row flash fails contrast in its ramps** (landing.css:773). Between ov 0.5 and 0.85, the `--on-frame` text sits on a 50-85 % red tint over `--surface`, about 2.4:1 at ov 0.5. It is brief: about 3 % of the stage scroll on each side. The peak (10:1) and the settled row (ink 18:1, critical flag 10.9:1) pass. Fix: switch the text colour at ov ≥ 0.85 rather than 0.5.
16. **Hindi wording.** `wipe.band` is "नकली शिफ्ट", which means "fake shift" (hi.json:777), while the caption uses "सिमुलेटेड". Fix: "सिमुलेटेड शिफ्ट".
17. **Draw calls and triangles.** The truck uses 22 meshes for 2.7k triangles, against the spec's "one merge per material". The 231k-triangle desktop terrain dominates the frame. Fix: merge the truck by material, and consider 260 segments on desktop.
18. **The reduced-motion wipe leaves `busy` set forever** (wipe-link.tsx:56-59). If the push is aborted, the CTA is dead. The rail is also hidden under reduced motion (landing.css, reduced block). Fix: reset `busy` after the push, and keep the rail static instead of `display:none`.

## Not verified
- I measured live contrast, LCP and 60 fps only indirectly. The browser pane ran hidden, so rAF and paint entries were suspended. The 1440 leader measurements were taken while the pane was active.
- I did not test real context loss. The finding comes from code reading.

## Re-check against head ea3ab77 (2026-11-12, fresh worktree)

Commits since 6c0f06c: bd0b983, 5e95f40, 6a264eb, ea3ab77.

**Verdict: PASS.** All Highs are fixed. Mediums 4-8 are fixed and 9 is deferred by decision. Four new Lows are open, and none of them blocks.

**Gates:**
- typecheck: exit 0, 0 errors.
- lint: exit 0, 0 problems.
- test: 22 files, 266/266 passed.
- build: compiled, 16/16 pages, exit 0.
- The three.js chunk (`3030bijau2umq.js`) is still absent from the 9 SSR scripts of `/`.

| # | Status | Evidence |
|---|---|---|
| H1 stale leaders | Fixed | The scene calls `opts.onFrame` after every render (index.ts, `renderOnce` and `tick`). The engine redraws there while `now === 2`. |
| H2 pairing by meaning | Fixed | Anchors now carry an `id`. The engine maps c1 to the cylinder, c2 to the cab and c3 to the beacon (`LEADER_ID`), with no sort and one elbow per line. The new beacon anchor is on the house, and the cab anchor moved to mid-cab (ea3ab77). |
| H3 copy contrast | Fixed (estimate) | The left scrim is now 74 % to 60 % at 30 % width, then 0 at 60 %, plus a 55 % bottom-left radial. Below 1100 px the bottom scrim is 90 %. Estimated headline contrast at the copy's right edge is about 7:1. The recaptured s2-s4 at 1440 read clearly. |
| M4 context loss | Fixed | A `webglcontextlost` handler calls `preventDefault`, stops the rAF and fires `onLost`. The engine then sets `data-gl="off"` so the posters return, and the listener is removed in `dispose`. |
| M5 no-JS ink and dots | Fixed | noscript has `.l-ink,.l-leaders{display:none!important}`. |
| M6 no-JS callouts and ledger | Fixed | noscript sets stage 6 `--p:1` and forces callout opacity to 1. |
| M7 hero LCP | Fixed | The `ln-rise` animation is removed, so the hero lines paint in place (no `animation` on stage 1). |
| M8 stale QA | Fixed | All `l3v2-page-*` were recaptured on the v2 scene, plus new s2b captures (6a264eb). |
| M9 Ink Frame on /op | Deferred | By decision, to the lead's portal phase 1. |
| L10 kicker | Fixed | Uses `.l-sr` hidden text. |
| L11 rail | Fixed | It now has `aria-current="step"`, stage names in the labels, an ink colour keyed to `data-paper`, and focus moves to the stage (`tabIndex=-1`). |
| L12 governor | Fixed | A good frame bleeds 0.5 from the slow count. |
| L13 negative dt | Fixed | dt is clamped with `Math.max(0, …)`. |
| L14 allocations | Fixed | Scratch vectors are reused and `getAnchors` returns the shared array. |
| L15 flash ramp | Fixed | Light text starts at ov ≥ 0.85. |
| L16 hi wording | Fixed | Now "सिमुलेटेड शिफ्ट". |
| L17 draws and tris | Fixed | Truck wheels are instanced (3 draws), and terrain is 260/200 segments. |
| L18 reduced-motion busy and rail | Fixed | `busy` resets after 1 s. The rail stays visible under reduced motion and is static. |

### Still open (Low, non-blocking)
19. **The callout labels at the right of stage 2 rely on a text-shadow only** (landing.css `.callout-t`).
    - In l3v2-page-s2b-1440.png, "Seatbelt, idle…" and "Works on a patchy bench connection" sit over the bright bench and the tracks, and read weakly.
    - Fix: give `.l-callouts` a right-side ink scrim like the left one, or a 70 % ink plate.
    - Not measured live, because the pane was hidden. The s2b capture also predates the mid-cab anchor (ea3ab77), so line crossings at head are not verified.
20. **After `onLost`, the engine can restart the loop on a dead context.**
    - `syncRunning` (IntersectionObserver or visibilitychange) still calls `ctl.setRunning(true)`.
    - Fix: in `onLost` set `ctl = null`, or add a `lost` flag that `syncRunning` checks.
21. **`drawLeaders` interleaves reads and writes on every frame.**
    - It calls `getBoundingClientRect` on each label after writing the previous polyline's points, which can force layout three times per frame on desktop.
    - Fix: read all the label rects first, then write.
22. **Under reduced motion `data-now` and `data-paper` are never set.** The static rail is `--on-frame` at 50 % everywhere, so it is invisible over the paper of stage 6 and over the footer. Fix: give it a contrasting plate (for example a `--frame` pill behind the ticks).
