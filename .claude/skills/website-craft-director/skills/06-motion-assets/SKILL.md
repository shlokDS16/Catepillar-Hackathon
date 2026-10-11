---
name: website-motion-assets
description: Specify purposeful web motion, cursor/hover behaviors, 3D/media and original visual assets with accessible fallbacks and performance budgets.
---

# Motion, Cursor, and Asset Direction

Use for elaborate transitions, pointer effects, scroll choreography, draggable interfaces, 3D/canvas, video, generated imagery or an immersive site. Keep motion subordinate to content and task completion.

## 1. Build the motion map

For each moving element specify:

```text
Element and purpose:
Trigger: load / hover / focus / click / scroll / drag / data response
Initial and resulting state:
Direction/relationship:
Timing/easing intent (measured or chosen):
Interrupt/cancel behavior:
Reduced-motion alternative:
Touch/keyboard alternative:
Performance budget/fallback:
Test evidence:
```

Choose motion to orient, show cause/effect, reveal hierarchy, confirm response or express brand mood. Limit simultaneous moving focal elements. Do not block click, reading, keyboard or scrolling. Avoid forced long loaders and scroll-jacking. If exact timing is not documented, choose and test an intentional value instead of claiming it was copied from a reference.

## 2. Cursor and hover specifics

Audit actual pointer separately from other floating UI. Define pointer type and target: standard OS cursor, custom graphic, follower, hover label, spotlight, crosshair, or drag affordance. State exactly where active; don't hide the native cursor over touch/keyboard contexts. Preserve clickable affordance, focus ring and touch action. Ensure custom cursor never obscures text/targets; test iframe/video/scrollbar/fixed layers. Provide no essential information solely on hover. Respect reduced motion and save-data/device fallback.

For references, record actual mouse movement and observed result. A persistent assistant orb is not a cursor effect. Do not assume a CSS `cursor` replacement adds a follower animation; use a real browser test.

## 3. 3D, video and heavy media

- First make core content usable without the canvas/video.
- Use optimized format, dimensions, poster/placeholder, reserved aspect ratio, lazy loading and suitable quality tiers.
- Respect GPU/device capability, reduced-motion and context loss; include 2D or static fallback.
- Keep text and essential controls in semantic DOM; expose equivalent labeled buttons/data list for canvas/3D interaction.
- Do not use a visually complex model if it does not help the product job.

## 4. Generated/original asset workflow

Use image generation for original artwork, illustration, texture or exploration only when it serves the design thesis. Prompt with subject, composition, art direction, color, lighting, focal placement, crop ratio, negative space for typography and prohibited content. Generate alternatives, inspect artifacts/crops, choose, document prompt/source and export responsive assets. Don't generate text/logos/UI screenshot/data evidence. For a real brand asset use approved original files or licensed source. Record attribution/licensing and alt text.

## 5. Implementation and validation

Pair with frontend owner after semantic DOM and content order are stable. Keep state in actual user action/API response. Prefer compositor-friendly transforms/opacity; monitor layout shift and frame drops. Test initial/hover/focus/pressed/drag, interruptibility, keyboard/touch, reduced-motion, slow load, mobile GPU fallback and scroll. If using GSAP/Three.js/Framer Motion or any library, inspect current installed version/docs; do not assume APIs.

Delegate motion/asset work to a creative developer/asset producer with exact assets/components assigned. Handoff includes motion map, asset manifest, fallbacks and observed browser states.
