# Landing v3, implementer B: review

Reviewer: code-reviewer (Opus), 2026-11-12. Branch `origin/lane/l2-landing-v3-b` at 486c445 (A's e29e014 merged in).
Scope: B's diff (`git diff origin/lane/l2-landing-v3-a...origin/lane/l2-landing-v3-b`), excluding `scene/**` and the main merge.
Production build, served on port **3227** (3220 was already held by another worktree's `next start`, which I left running).

## Verdict: CHANGES REQUIRED

High 2, Medium 9, Low 11.

## What I re-ran (real output)

| Check | Result |
|---|---|
| `pnpm --filter web lint` | clean (no output) |
| `pnpm --filter web typecheck` | TypeScript: No errors found |
| `pnpm --filter web test` | 53 files, 556 tests passed |
| `pnpm --filter web build` | green, `/` is dynamic |
| Audit 1440 x 900 / 450 | 30 frames, 0 dead, thin or flat (lowest 17 words, frame 18) |
| Audit 375 x 812 / 406 | 25 frames, 0 dead, thin or flat (lowest 12, frame 21) |
| Audit 1440, tape excluded | 30 frames, 0 (lowest **11**, frame 18: the clipped ledger heading) |
| Audit 375, tape excluded | 25 frames, 0 (lowest 12, frame 21) |
| axe 4.10.2 (cdnjs), 8 scroll positions at 1440 | 0 serious or critical at rest; `page-has-heading-one` (moderate) from y 9600 down; one transient `color-contrast` while a ledger row fades in (y 9000) |
| Tab order | skip, language, hero CTAs, 6 ticks (48 x 48), 3 role links, 4 footer controls. This matches §10. 3 px ring on every stop, no focus inside hidden blocks, ticks skipped once the tape is inert |
| Screen-reader noise | tape now line `aria-live="off"`, clock `aria-hidden`, readouts not live. No spam |
| Console (headed Chrome, WebGL on) | no errors, no hydration warnings |
| three.js | not in the 10 initial chunks (~637 KB raw / ~197 KB gzip of JS); imported lazily |
| LCP | `SPAN.ln-i` (H1 line) at 1.55 s |
| en/hi keys | 121 / 121, no missing or extra; EXC-007 in both |
| Proof captures | no Caterpillar marks, model shown as "22 t excavator"; caution-yellow share 0.6 % (op), 2.3 % (fm), at most 1.9 % on phone |

Outputs: `C:\Users\Shlok\AppData\Local\Temp\claude\98d8ad1d3b5380d0\1d34afbb-5c7b-4346-b184-e6987363f489\scratchpad\audit\{d1440,d375,t1440,t375}\` (frames, contact sheets, reports). Ad-hoc captures are in `...\scratchpad\rvb\`.
Not re-verified: the §12.4 sync check. `?still=` is stripped in production builds by design (landing-engine.tsx:40).

**Is the audit honest?** Partly. No copy is parked on screen only to satisfy the probe: each stage block holds for its own band, as the spec asks. The probe has three blind spots, though:
- Headless agent-browser has **no WebGL** here (`getContext("webgl2")` is null, `data-gl="off"`). Every audit frame, B's and mine, is the poster fallback, not the live scene.
- The probe ignores overlays (`.l-dim` has `pointer-events:none`), so the faded replay card counts as readable.
- It ignores text-on-text overlap, so the colliding footer lines at 375 count as readable.

## Findings

### High

1. **Replay card fades to failing contrast (S5 → S6).**
   - Where: landing.css:297 (`.l-dim`, z 3, sits above the `.l-st` blocks at z 2); landing-engine.tsx:168.
   - Failure: the 60 % ink dim covers the card's own text. At 1440, y 7200-8100, and at 375 frame 12, the title, body and "Practice from today's shift" chip render at about 3.7:1 on ink and look disabled.
   - Fix: put the dim under the card (dim the scene, not the card), or fade the card out deliberately before the paper rises.
2. **Footer text collides at 375 (en and hi).**
   - Where: landing.css:2163-2178.
   - Failure: `.l-plate-legend` stays `position:absolute; bottom:16px` while `.l-plate-close` becomes static and flows into the same strip. "Shift closed. Six entries, chain checked." prints on top of "Bench contours, every 1.6 m…" (frames 22-23). This is the last screen a judge sees.
   - Fix: put the legend in flow on phones.

### Medium

3. **Headings clipped behind the tape.**
   - Where: landing-engine.tsx:203-206; landing.css:1047-1059.
   - Failure at 1440: the ledger H2 "quietly edit" is half under the docked paper tape at y 8100 (frame 18), and the proof H2 "The same shift," is under it at y 9450 (frame 21).
   - Failure at 375: the paper tape stays at the top through S6 and covers the ledger heading together with the nav (frame 14).
   - Fix: reserve the tape's height in the ledger pin, or hide the tape earlier (on phones, from the start of S6).
4. **Phone readouts show bare numbers.**
   - Where: landing.css about 1954 (`.l-ro-head, .l-ro-rows, .l-ro-what {display:none}` inside the 767 px query).
   - Failure: "34°", "28.9 m" and "8.1 m" have no label and no SIM mark. This breaks "every number labelled SIM" and the reader cannot tell what 34° measures.
   - Fix: keep a one-line label and the SIM plate.
5. **No-JS page is incomplete.**
   - Where: landing.tsx:85 (`NOSCRIPT`).
   - Failure: with scripts disabled, proof sheets 2 and 3 stay hidden, because `data-active="1"` keeps their `.l-shotwrap` and `.l-bar` at `visibility:hidden`. The three S2 callouts stay at opacity 0. Reduced motion is complete; it has rules that no-JS lacks.
   - Fix: mirror the reduced-motion proof and callout rules in `NOSCRIPT`.
6. **Copy claims what the captures do not show.**
   - Where: en.json:981 and :1001.
   - Failure: "The same shift, in the app." sits over screens from a different shift (09:00-17:00, "Now 09:40", 214 ledger entries) right after a 06:00-14:00, six-entry story. "Captured from the deployed app" is not true either: B's report (deviation 4) says the captures came from a local production build.
   - Fix: reword both (for example "The same product, in the app" and "captured from a production build on demo data"), in en and hi.
7. **Raw joint angles shown.**
   - Where: readout.tsx:119-121.
   - Failure: with WebGL on, the S2 plate reads "Stick −117°" and "Bucket −19°". These are scene-relative angles that a Caterpillar engineer will question.
   - Fix: map them to the display convention (for example 0-180°) before rounding, or agree a convention with A.
8. **Layout thrash on every frame.**
   - Where: landing-engine.tsx:117-176 and 258-260.
   - Failure: `drawLeaders` calls `getBoundingClientRect` on the canvas, the stage, three labels and the plate right after `textContent` and style writes, on every scene frame in S2 and S4. Each frame forces a synchronous layout, which breaks §11.
   - Fix: cache the label, plate and canvas rects in `measure()`.
9. **Assets that should be lazy load at first paint.**
   - Failure: `contours.svg` (230 KB, 73 KB gzip) loads with the page (resource timing at y 0), and the footer has no `content-visibility:auto`, which §11 asks for. `poster-2` to `poster-5` (about 85 KB) also load at first paint despite `loading="lazy"`, because they sit inside the sticky view.
   - Fix: attach the `<use>` near the footer, or add `content-visibility`. Load the poster for stage N+1 only.
10. **Hidden stage blocks remove headings from the accessibility tree.**
    - Where: landing.css:306-322.
    - Failure: the inactive `.l-st` blocks are `visibility:hidden`, so the h1 and the S2-S5 h2s and bodies leave the accessibility tree whenever their stage is not current. axe reports `page-has-heading-one` from the proof onwards, and a screen-reader user reading linearly never meets the S2-S5 copy.
    - Fix: add an sr-only copy of each block's title and body to its band.
11. **The audit report overstates what it proved.**
    - Where: landing-v3-B-report.md.
    - Failure: "0 dead" was measured on the poster path only (no WebGL), with the overlay and overlap blind spots above.
    - Fix: say so in the report. Add a dim-overlay check and a headed (WebGL) spot check to §12.

### Low

12. **Two SPOTTER wordmarks on screen** at y 12150-12330: the fixed nav brand stays over the footer wordmark. At y 11700 the proof lede also runs under the nav plate. Fix: hide or fade the nav once the footer plate enters.
13. **The "Simulated data. Illustrative shift…" caption is never readable** (landing.css:150):
    - it has no z-index, so it sits under the `.l-st` layer (posters hide it; with WebGL the scrim hides it);
    - it is `display:none` on phones.
14. **Phone proof bar truncates the honesty tag** to "demo data, captured fr…" (landing.css:2123-2126).
15. **Phone captures reserve the wrong space** (proof.tsx:57): the `<img>` keeps width and height 1320 x 825 while the phone source is 390 x 520. Fix: put `width` and `height` on the `<source>` elements.
16. **The AVIF captures are bigger than the WebP ones** but are listed first: `proof-fm.avif` 86 KB against 75 KB, `proof-op.avif` 67 KB against 61 KB.
17. **The op alt text describes a removed part** (en.json:986): it mentions "a status band", which the crop removes.
18. **The ledger annotation tag covers what it annotates** (proof.tsx:17): "Checked against the copy kept outside" sits on the capture's own "Compare with Telegram" heading.
19. **Duplicated entry positions** (landing-engine.tsx:326-333): `ENTRY_AT` repeats `ENTRIES[].stage` and `.p` from shift.ts. Read them from `ENTRIES`.
20. **The S2 plate covers the machine** at 1440: the plate sits over the excavator's cab and boom, and the "01 Boom and stick" callout prints on the white tracks (frame 04).
21. **Units are hard-coded** (readout.tsx:144-145): "t" and "%" are not localized.
22. **Cross-lane, for A:** with WebGL on, the S3 counters reach 96 % of the trail and 13 cycles at p .60, against the `S3.draw` window of [0, .85]. The figures finish well before the trail story does.

## Re-review (origin/lane/l2-landing-v3-b at 3821063, A's 9a1d778 wordmark merged)

### Verdict: CHANGES REQUIRED

One new High, in the wordmark: it fails to remount. One Medium (the S2 plate). The rest are Low. Every original High and Medium is fixed or reduced to Low.

Production build on port 3227:
- lint clean;
- typecheck: no errors;
- tests: 54 files, 572 passed;
- build green.

### Audits

| Run | Result | Lowest frame |
|---|---|---|
| 1440 x 900 / 450, headless (WebGL false) | 30 frames, 0 dead, thin or flat | 17 words |
| 375 x 812 / 406, headless | 25 frames, 0 | 17 words |
| 1440, tape excluded | 30 frames, 0 | 11 words (frame 18: the paper rising, the heading now fully visible) |
| 375, tape excluded | 25 frames, 0 | 17 words |
| 1440, `HEADED=1` (WebGL true) | 30 frames, 0 | 17 words |

Outputs are in `C:\Users\Shlok\AppData\Local\Temp\claude\98d8ad1d3b5380d0\1d34afbb-5c7b-4346-b184-e6987363f489\scratchpad\audit2\`.

I read the headed contact sheet frame by frame. The S5 → S6 hand-off is now clean:
- frame 17: the card is crisp and the dim sits under it;
- frame 18: the ledger heading sits fully above the docked tape;
- frame 21: the tape is gone before the proof heading arrives.

At 375, the footer is in flow and nothing collides; the tape leaves when the paper rises.

### axe 4.10.2 (8 positions, 1440)

No serious or critical findings at any position. Two moderate ones:
- `landmark-unique`, at every position: the S2 and S3 plates are both `<aside aria-label="Simulated readout">`. This is new, because hidden stages now stay in the accessibility tree.
- `page-has-heading-one`, from the proof onwards.

### Status of the original findings

| # | Status | Evidence |
|---|---|---|
| H1 dim over card | Fixed | headed frames 14-18; 375 frame 12 |
| H2 footer collision at 375 | Fixed | 375 frames 22-24 |
| M3 headings under tape | Fixed | 1440 frames 18 and 21; tape hidden on phone paper |
| M4 phone readout labels | Fixed | "Simulated readout · SIM · 34° Boom" at 375 |
| M5 no-JS | Fixed | scripts disabled: 5 stages opacity 1, 3 sheets visible, callouts 1, "chain broken" shown, top still shown |
| M6 honesty copy | Fixed | "The same product", "captured from a production build" |
| M7 angles | **Low** | see item (6) below |
| M8 per-frame layout reads | Fixed | rects cached in `measure()` |
| M9 first-paint assets | Fixed | no `/landing/*` resource at first paint; contours.svg gone |
| M10 accessibility tree | **Partly fixed, now Low** | S2-S5 copy stays in the tree, but `heroEl.inert = curSt !== 1` (landing-engine.tsx, in `frame()`) removes the h1 and the hero copy from the tree once stage 1 ends. Fix: take only the two hero links out of the tab order (`tabIndex=-1`) instead of making the whole block inert |
| M11 report wording | Fixed | report names the audited path |

Reduced motion is complete: every stage is shown, all three captures, the oblique wordmark still, and the hero is not inert.

### New findings

**R1 (High). The wordmark goes blank after scrolling away and back.**
- Where: wordmark.ts:493 (`renderer.forceContextLoss()`), wordmark.ts:293-297, and `mountWm` in landing-engine.tsx.
- Cause: `unmountWm` disposes the wordmark when the plate leaves its 700 px margin, and `dispose()` forces context loss on that same canvas. On the next approach, `new WebGLRenderer({canvas})` gets the lost context back, and three.js logs `THREE.WebGLRenderer: Cannot read properties of null (reading 'precision')`. `mountWordmark` catches this and returns a no-op controller, which the engine cannot tell from success, so it sets `data-wm="canvas"` and hides both stills.
- Reproduced in a headed run: footer, then up to y 2000, then back down. The result is a blank white plate with "14:00" white on white (screenshot `...\scratchpad\rvb\wm-back.png`). Any judge who scrolls back down will see it.
- Fix: do not force context loss on a canvas that will be reused (or swap in a fresh `<canvas>` on each mount), and return null on failure so the engine sets `data-wm="poster"`.

**R2 (Medium). The S2 plate sits over the excavator at 1440 (B's point 5).**
- Failure: across headed frames 2-5, the 336 px plate covers the boom pivot and upper boom, the very part whose angle it reports. The beacon leader ends at the plate's lower edge, and callout 01 prints on the tracks.
- Severity: this is the frame that explains the product, so a design-literate judge will notice. It is not broken, though.
- Fix: A frames the machine further left, or B moves the S2 plate to the bottom left above the tape, under the copy column. It should not wait for the next round.

**Wordmark code (A's, consumed by B):**
- DPR is capped at 1.5 (dpr 1 measured, canvas 1425 x 593).
- No render loop: one rAF per progress or size change.
- Disposal covers geometry, materials, the shadow map and the renderer.
- The mount is lazy (dynamic import, 700 px margin), and a token guards stale mounts.
- Phones, reduced motion and no-JS get stills; WebGL failure gets a still once R1's no-op case is handled.

**Legibility.** At 1440 it reads as SPOTTER. The top bench follows the Barlow Condensed glyph edge, the face comes from `.l-h1`, and the S, P, T, E and R are clear. Three things weaken it:
- the parked excavator sits on the O and hides most of its counter;
- the first-light trail zig-zags across every letter;
- the two lower benches fan out, so the word reads heavier and wider than condensed type.

On phones the still is about 300 px wide and the word is hard to read.

**Low:**
1. `MeshLambert` plane with 150k vertices plus a 4096² PCF shadow map, re-rendered on every footer scroll tick (wordmark.ts:379-380). Use 2048 and fewer segments.
2. The proof caption is clipped by the footer's top edge at 1440 (headed frame 27): "Screens are captured…" is cut through.
3. `foot.made` says the lettering is "built in code from our terrain function". It is drawn from the Barlow glyphs, then mixed with the terrain. Say "from the type and our terrain function".
4. The `landmark-unique` duplicate described under axe.
5. At 375 the SIM caption sits tight under callout 03 (frame 2). It no longer overlaps.

### (6) Joint angles: is anything untrue?

No.
- The plate is titled "Simulated readout" with a SIM mark. It shows `Math.abs` of scene-relative joint angles (readout.tsx:122-125), and those move with the visible pose.
- The convention is undefined, though. The reduced-motion and no-WebGL settled values (34 / 61 / 22) and the live values for a similar pose (44 / 107 / 55) are on different scales.
- Low: agree one convention with A (for example the included angle at each joint) and derive the settled values from the same pose function.
