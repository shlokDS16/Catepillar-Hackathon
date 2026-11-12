# Spotter landing: design dossier (from the aayushvisuals.com study)

Source: the local study replica of aayushvisuals.com (`Unique website testing/aayush-replica/ref/REFERENCE.md`,
measured at 1280x800 and 375x812) and the web-ui-studio manual (`references/motion.md`, `patterns.md`,
`lessons.md`). Values marked "measured" were read from the live site or its chunks; the rest are rules
from the manual. Tokens and fonts come from `docs/design/visual-language.md`; this file adds motion and pacing only.

## 1. Why that site felt exceptional (the five things worth copying)

1. **One long scroll told as pinned stages.** The page is a stack of `position: sticky; top: 0` stages (800 px tall)
   inside taller wrappers. Each stage's height sets its pace: hero 4300 px, about 2080, statement 2000,
   services 2400, work 2082, process 1040, lab 1851, gallery 1600. Pacing comes from section height, not timers.
2. **Scroll maths as formulas, not keyframes.** Each stage computes `p = clamp((vh - top) / height, 0, 1)` and
   remaps sub-windows (lead-in .22-.44, lead-out .60-.74) to 0..1 before easing. The hero frame shrinks with
   `scale(1 - .04f, 1 - .1f)`, `f = p^2`, over `min(850, max(500, .85vh))` px. The camera, not the text, moves.
3. **Native scroll, no smoothing.** No Lenis, no GSAP, no ScrollTrigger (measured: none in the chunks). The work is
   done with rAF writing transforms, CSS `animation-timeline: view()` and IntersectionObserver. Lesson: adding Lenis
   to fix "lag" adds lag and moves scrolling to the main thread.
4. **A small, strict motion vocabulary.**
   - Easings: `--ease-quint cubic-bezier(.22,1,.36,1)` (hover, reveals), `--ease-expo (.16,1,.3,1)` (menus),
     `--ease-inout (.76,0,.24,1)` (wipe, preloader exit), and `(.34,1.56,.64,1)` overshoot for small pops only.
   - Durations: `--dur-press .13s`, `--dur-hover .2s`, `--dur-state .26s`, `--dur-panel .42s`; route fade .52s.
   - Reveal: `opacity 0, translateY(28px)` to rest, .35 s, stagger with `--rd` (80 ms steps).
5. **Craft at the edges.**
   - Page wipe: a circle grows from the click point to the farthest corner (`scale 0 -> 1`, .5 s inout),
     route push at +500 ms, shrink back at 750 ms, unmount at 1310 ms.
   - Sticky curtain footer: `main` at z 2 scrolls off a sticky `bottom: 0` footer at z 1 (pure CSS).
   - Hover: lift `translateY(-1px)` plus soft shadow (.26 s); card image `scale(1.05)` over .7 s quint.
   - Cursor ring: lerp `pos += (target - pos) * .24` per frame, `(pointer:fine)` only.
   - Live gate: an IntersectionObserver (rootMargin 300 px) adds `.anim-idle` and pauses every off-screen animation.

## 2. Spotter story: a quarry shift in seven stages

Narrative: one simulated shift, dawn to hand-off. Each stage is one sticky 100svh stage; heights below are the
scroll budget (desktop). Every stage carries a mono caption: **"Simulated data. Illustrative shift, not a real site."**

1. **Dawn over the bench** (400vh).
   - The camera rises and dollies over the terrain.
   - The sky goes from blue hour to first light.
   - The headline lands at p .22-.44.
2. **The machine** (200vh).
   - A generic excavator (no Cat trade dress) turns into view.
   - The boom and stick move with p.
   - Three spec callouts reveal at p .3, .5 and .7.
3. **The operator's trail** (250vh).
   - The day's path draws itself across the terrain: `drawRange` or `stroke-dashoffset` = p * length.
   - A cycle counter counts up.
4. **Guardian rings** (250vh).
   - Safety rings expand around the machine: clear, caution, warning, critical.
   - A walker enters and the ring state steps up.
   - The scene holds at p .6-.75.
5. **Replay hand-off** (200vh).
   - A timeline scrubber rewinds the trail as the next operator takes over.
   - The frame shrinks to a card, using the hero-shrink formula.
6. **Tamper-evident ledger** (180vh).
   - Ledger rows stack, and each row's hash links to the previous one.
   - One row is tampered with, and the chain turns `--state-critical`.
7. **Close and footer curtain** (100vh plus the footer).
   - A CTA leads to the app.
   - The curtain uncovers the footer.

Rules for the story:
- Plateaus are deliberate: every stage holds its rest state for the last 10-15 % of its height before the next begins.
- One idea per stage. Text appears only while the scene is still (inside a hold), never during a camera move.
- Mobile: same stages, heights times 0.8. The trail and ring stages keep scroll scrubbing. Stage 2 rigging becomes three still frames.

## 3. Type, colour and surface

- Use the tokens from `visual-language.md`: dark stages on `--ink #16150F`; light stages on `--paper #F2F0EA`.
  The state colours (`--state-caution #FFC700`, `--state-warning #FF6A00`, `--state-critical #B3102A`,
  `--state-clear #0B6B37`) appear ONLY as Guardian ring and ledger states, never as brand, headings or backgrounds.
  This keeps the page clear of yellow-and-black trade dress.
- Display roles (copied from the study's proportions, set in Barlow Condensed 600-700):
  - stage headline 76.8/75.3, letter-spacing -0.045em
  - section title 48.6/51, -0.04em
  - mobile headline 44-52, -0.05em
  - body 15/22.5, ink at .66
  - mono captions and counters 12.5-13/19.5, +.04em, tabular numerals (`tnum`)
- Navbar: a fixed, centred pill (top 18 px, radius 16). It swaps between a glass, a light and a dark variant by stage
  (`data-surface`), with a .55 s transition. Resolve the variant from cached stage bands by `scrollY`, never with `elementFromPoint` on scroll.

## 4. WebGL: one canvas, budgeted

- One three.js renderer for stages 1-5. Terrain is a displaced plane with a baked normal map and a vertex-colour
  ramp, plus a low-poly excavator (under 15k triangles, Draco/meshopt). Trail and rings are line and ring meshes.
  Stages 6-7 are DOM/SVG.
- Camera: `p = scrollY / stageSpan`. FOV 35. Ease every camera key with quint, and lerp the camera toward the target
  each frame (factor .12) so wheel steps never show.
- Budget (measured lesson from the study): fill rate was the cost, not draw calls.
  - `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`; `antialias` only when DPR < 1.5.
  - A governor drops DPR to 1.0 after 30 frames over 22 ms.
  - One rAF, and only while the canvas is on screen (IntersectionObserver). No post-processing blur.
- Fallback when WebGL is missing or reduced motion is on: create no context, and show per-stage poster images
  (AVIF/WebP, captioned the same way).

## 5. Loading, LCP and transitions

- **LCP under 2.5 s on mobile.**
  - The LCP element is the stage-1 poster plus the headline, both server-rendered. Poster: AVIF under 60 KB at
    750 px, `fetchpriority="high"`, preloaded.
  - three.js and the models load after `requestIdleCallback`, or on first scroll, whichever comes first.
  - The canvas fades in over the poster (`opacity .7s quint`) when the first frame is ready.
- **No blocking preloader.** At most a 600 ms brand mark that the page never waits on. Never fake a percentage.
- Fonts: `next/font` with `display: swap` and adjusted fallback metrics. Load only two weights of Barlow Condensed and two of Barlow.
- Route change to the app: the circle wipe from 1.5 in `--ink`, centred on the CTA. Under reduced motion it becomes a 150 ms crossfade.
- Live gate every loop (ring pulse, ledger ticker) with `.anim-idle`. Nothing animates off-screen or behind the footer.

## 6. Hover and micro-craft

- CTA buttons: ink fill, `translateY(-1px)` with `0 3px 12px rgba(22,21,15,.28)`, .26 s quint; the arrow nudges
  `translateX(3px)`. Press: `scale(.98)` .13 s.
- Spec callouts and ledger rows: hairline draws in (`scaleX 0 -> 1`, .42 s), then the label rises 18 px.
- Ledger hash: hover shows the previous row's hash and draws a 1 px link line between them (.26 s).
- Counters (cycles, tonnes, hours) count up over 1.2 s with ease-out, and only once. The SSR text already holds the final value.
- No custom cursor: it adds little here and costs a rAF loop.

## 7. Reduced motion (`prefers-reduced-motion: reduce`)

- No WebGL context. Each stage shows its poster and caption, and stages are 100svh with no pinning.
- The trail and rings appear fully drawn. The ledger shows the broken chain as a static diagram.
- Reveals are visible at once; loops get `animation: none`; the wipe becomes a crossfade.
- Check it: no element runs an infinite animation under reduced motion, and keyboard order follows the story.

## 8. Acceptance checks for the L3 lane

- Mobile LCP under 2.5 s, CLS under 0.05, INP under 200 ms (throttled 4x CPU, Slow 4G in Lighthouse; re-run on a quiet machine).
- p50 frame time in stages 1-5 under 16 ms at DPR 1.5 on the laptop iGPU; 0 rAF loops when the canvas is off screen.
- Every stage shows the "Simulated data" caption. No Caterpillar marks or yellow-and-black brand surfaces
  (state colours only inside rings and ledger states).
- Reduced-motion pass with the checks in section 7; WebGL-off pass shows the posters.
