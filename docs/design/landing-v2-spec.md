# Landing v2 spec (Track F, 2026-11-12)

Shlok: "Landing page motion and design could be much better." This spec upgrades landing v1
(main 3854cb7+, docs/design/landing-dossier.md) to the highest-impact changes only. The dossier's
rules still hold (one canvas, DPR cap 1.5, frame governor, three.js on idle, posters for reduced
motion and no-WebGL, honest "simulated data" caption, no Caterpillar logos, no yellow-and-black
trade dress). The changes below override the dossier where they conflict.

## What is wrong with v1 (Track F browser review at 1440x900)
1. **The excavator reads as a toy.** It is a white box with a blue box for a boom. It has no
   counterweight, no hydraulic cylinders, no bucket teeth and no track detail. Its proportions are
   off: the cab is as big as the house.
2. **The terrain is a flat brown plane** with banded noise. There are no quarry benches, no
   highwall, no haul road and no rocks, so nothing gives scale or place.
3. **The lighting is flat.** There is no low dawn sun, no long shadows, no rim light, no sky and
   no atmospheric depth. The scene looks like a clay render on beige.
4. **The camera jumps between waypoints and the shots are empty.** Stage 3's top-down trail is a
   thin white line on an empty plane. Stage 4's rings are barely visible.
5. **The copy fights the scene.** Stage 2's headline is cut off at the bottom of the viewport.
   Stage 2's callouts and the copy for stages 3 and 4 were not visible at the scroll points tested.
   Stage 5's card is crushed into the bottom-right corner.
6. **The move from stage 5 to the ledger is a hard cut** from a 3D scene to a beige page.
7. **The CTA circle wipe lands on nothing.** Shlok chose portal direction B, "Ink Frame"
   (docs/design/portal-redesign-study.md §3 B, on branch origin/design/portal-study). The wipe must
   end in the portal's ink frame.

## Targets

### Scene (implementer A owns `apps/web/src/components/landing/scene/*` only)
- **Excavator, built procedurally at hero quality.**
  - Undercarriage: two track frames with sprocket, idler and 5 rollers. Track shoes are instanced,
    with grousers.
  - Upper: a slewing house with a rounded counterweight, engine hood with louvres, handrails, and
    a cab with a dark tinted glass material (glass is `MeshPhysicalMaterial` with transmission off
    and roughness 0.1, plus an env map). The cab sits front-left and is about 30 % of the house.
  - Front: a two-part curved boom (bezier-extruded box section), the stick, and a bucket with 5
    teeth.
  - Cylinders: three pairs of hydraulic cylinders (boom, stick, bucket). Each has a chrome rod and
    a barrel, and its ends are re-aimed every frame so it tracks the pivots.
  - Paint: a warm industrial off-white `#E9E4D6` body. Graphite `#2A2924` for the undercarriage and
    boom joints. One small state-coloured beacon on the cab roof, the only saturated colour.
    Vertex-colour dirt darkens the lower 40 %.
  - Animation: the arm keeps a slow dig cycle, the house slews, and the tracks scroll their texture
    offset when the machine moves.
  - Budget: under 40k triangles, one geometry merge per material.
- **Quarry terrain.**
  - A stepped heightfield: 3 benches about 8 m high with steep faces and flat floors, plus a ramp
    haul road. The faces get fbm noise and the floors stay nearly flat.
  - A highwall silhouette on the far side.
  - About 400 instanced rocks, plus scree at the bench toes.
  - Vertex colours shift from ochre faces to grey floors, with a tyre-track tint on the haul road.
- **Light and atmosphere.**
  - A low dawn sun (elevation 8-12°, warm `#FFB37A`) casts PCFSoft shadows (2048 map on desktop,
    1024 on mobile, with tight shadow-camera bounds around the machine).
  - A cool hemisphere fill, plus a PMREM `RoomEnvironment` env map at low intensity for reflections
    on the glass and chrome.
  - ACES tone mapping, SRGB output.
  - A gradient sky dome with a soft sun disc. Exponential height fog makes the benches recede.
  - About 300 drifting dust motes catch the sun (Points, additive blending). Under reduced motion
    there is no scene at all, as today.
  - No post-processing pass is needed. If you add one, it must be `three/addons` only and run at
    half resolution, and the governor must turn it off first.
- **Camera.**
  - Replace the per-stage waypoint jumps with one Catmull-Rom path through all the waypoints,
    driven by global scroll progress. The camera eases toward the target point with critical
    damping, not a fixed per-frame lerp.
  - Add a pointer parallax of ±1.5° on desktop only.
  - Each stage gets a composed shot: hero 3/4 low angle; stage 3 a high oblique (not straight top
    down) so the trail reads over bench relief; stage 4 a 45° oblique with the rings.
- **Trail (stage 3).** A tube or fat line, 0.35 m, `--on-frame` colour, drawn with a dashoffset or
  drawRange growth tied to stage progress. A glowing head dot leads it, and 14 small cycle ticks
  sit along it.
- **Rings (stage 4).** The rings become flat annuli that hug the terrain (sampled heights) with a
  soft inner glow (shader: alpha falls off across the band). When the second machine crosses a
  boundary, that ring pulses once. The second machine is a small haul truck, built procedurally the
  same way (cab, dump body, 6 wheels), that drives the haul road into the rings.
- Posters (`public/landing/poster-*.{avif,webp}`) must be re-rendered from the new scene. Use the
  existing `?still` dev path and keep each file under 60 KB.

### Page, motion, hand-off (implementer B owns `landing.tsx`, `landing-engine.tsx`, `wipe-link.tsx`, `dawn-poster.tsx`, `styles/landing.css`, `styles/tokens.css`, `messages/*.json` landing keys)
- **Copy layout.**
  - Every stage's copy block must be fully inside the viewport at 1440x900, 768x1024 and 375x812,
    and readable over the scene. Use a left-side scrim (ink gradient at 0→55 % opacity, 0-45 % of
    the width), not a box.
  - The type follows the portal B scale: display Barlow Condensed 800 with −0.03em tracking, mono
    captions uppercase with +0.04em.
- **Text motion.**
  - Headlines reveal by line with a mask: each line slides up 100 % from overflow-hidden in the
    quint ease, staggered 60 ms, driven by stage progress (CSS `--p`, as today).
  - Stats count up with `data-count`. The kicker "0N / 07" counter rolls digits.
  - No letter-by-letter effects.
- **Stage progress rail.** A fixed 7-tick vertical rail on the right edge (desktop) shows the
  current stage. Each tick is a link to its stage, and the rail is hidden on mobile.
- **Stage 5 to 6 transition.**
  - Replace the hard cut with an "ink to paper" hand-off. The canvas darkens to `--frame` (ink).
  - The ledger rows then fall into place one by one on a paper panel that rises from the bottom
    like a sheet of paper (translateY plus a 1 px ink rule).
  - The tampered row flashes the critical state once when the chain breaks, and "Row 4" is named.
- **Stage 2 callouts.** These are spec-callout leader lines from points on the machine to labels.
  The scene exposes 3 screen-space anchor points per frame (see interface below), and the DOM draws
  a 1 px SVG line from each label to its anchor.
- **CTA wipe ends in the Ink Frame.**
  - The circle wipe fills `--frame` and then resolves into the portal's frame: an ink status band
    (top) and dock (bottom) that stay, while the middle opens to `--paper`. Then navigation to
    `/op` happens.
  - Add the portal B tokens to tokens.css if they are missing: `--frame #16150F`,
    `--on-frame #F2F0EA`, `--on-frame-2 #B9B5AA`, `--frame-rule #3A382F`. The landing uses these
    names for every ink surface.
  - Reduced motion: an instant cut, no wipe.
- **Hero (stage 1)** keeps the SSR poster as the LCP.
  - Upgrade `dawn-poster.tsx` so it matches the new scene: bench silhouettes, sun glow, and a
    machine silhouette with a proper boom, stick and bucket.
  - The headline is the first thing painted. The canvas fades in over the poster only after its
    first rendered frame.
- **QA PNGs.** Replace the bad captures `docs/design/qa/l3-landing-1440-rings.png` and
  `l3-landing-375-hero.png` with real ones from the browser. Add `l3v2-*` captures for each stage
  at 1440 and 375.

### Interface between A and B (the only shared surface)
`SceneController` gains `getAnchors(): Array<{ x: number; y: number; visible: boolean }>`. It
returns 3 points in CSS pixels relative to the canvas: the cab, the boom-cylinder and the bucket.
It is called by the engine each frame while stage 2 is active. A implements it. B consumes it and
must tolerate `[]` until A lands. Everything else about the controller stays as it is.

## Acceptance (the lead's Opus review checks these)
- typecheck, lint, test and build all green, with counts quoted.
- LCP is the SSR poster plus headline, and three.js is still not in the initial JS.
- 60 fps target. The governor still steps the DPR down, and the WebGL context is released on
  teardown.
- Reduced motion is a stack of still posters. With no WebGL you get the posters.
- No horizontal scroll at 360 px. Copy is fully visible in every stage at 375, 768 and 1440.
- The en and hi strings exist for any new copy.
- No calls, SMS, Telegram or SOS (lane-rules.md ABSOLUTE).
