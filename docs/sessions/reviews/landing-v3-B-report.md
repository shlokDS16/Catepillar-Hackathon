# Landing v3, implementer B report (page, engine, copy)

Branch `lane/l2-landing-v3-b`. A merged at 9a1d778 (polished 3D wordmark), docs at e7688db (HEADED audit). Round 2 after the Opus review (CHANGES REQUIRED, 2 High, 9 Medium, 11 Low).

## Audit results (round 2, production build, A merged)

| Run | Frames | Dead / thin / flat | Path audited |
|---|---|---|---|
| 1440 x 900 / 450 | 30 | 0 | poster fallback (headless, no WebGL) |
| 375 x 812 / 406 | 25 | 0 | poster fallback |
| 1440 x 900 / 450, `HEADED=1` | 30 | 0 | **live WebGL: true** |
| 375 x 812 / 406, `HEADED=1` | 25 | 0 | see its report.md for the WebGL line |
| 1440 and 375, tape excluded (§12.2) | 30 / 25 | 0 / 0 | poster fallback, outputs not committed |

Reports and contact sheets: `docs/design/qa/landing-v3/B2-1440/`, `B2-375/`, `B2-1440-headed/`, `B2-375-headed/`. Wordmark screenshots (headed, 1440): `B2-wordmark-top.png` (plate arriving, near top-down) and `B2-wordmark-oblique.png` (end of the page, oblique). In both the 3D letters are Barlow Condensed (the canvas resolves `--font-barlow-condensed` to "Barlow Condensed" and the face is loaded).

What the audit does not prove (review finding 11): the probe ignores overlays and text-on-text overlap. The overlay case is now fixed structurally (the dim sits under the card), and I looked at every contact sheet frame by eye, but there is no automated overlap check.

## Review findings

High
1. Replay card dim: `.l-dim` moved inside stage 5, under the card, so it darkens the scene only. Fixed.
2. Footer collision at 375: legend and closing line are in flow on phones. Fixed.

Medium
3. Headings behind the tape: ledger heading smaller and higher; tape hides before the proof heading (0.85 of the viewport) and on phones as soon as the paper rises. Fixed.
4. Phone readouts keep their label and the SIM mark. Fixed.
5. No-JS page: `NOSCRIPT` now mirrors the reduced-motion rules (proof sheets, callouts, notes, ledger end state). Fixed.
6. Honesty of the proof copy: title "The same product, in the app.", tag "demo data, captured from a production build", caption "captured from a production build of the app, on demo data" (en and hi). Fixed.
7. Joint angles: the plate shows magnitudes (no sign). The convention is still not agreed with A; open.
8. Layout reads per frame: label and plate offsets are cached in `measure()`; canvas and stage rects are no longer read (anchors are already in block coordinates). Fixed.
9. First-paint assets: `contours.svg` is no longer referenced (the footer plate is the 3D wordmark with stills); stage stills are `display:none` until current or next stage and only without WebGL, so they do not load with WebGL on. Fixed.
10. Accessibility tree: inactive stage blocks are now `opacity:0` + `pointer-events:none` (not `visibility:hidden`), so the h1, h2s and bodies stay readable; stage 1 (links) is `inert` when not current. Fixed.
11. Report overstated the audit: stated above; headed runs added.

Low: 12 nav hides at the footer (fixed); 13 caption has a z-index and shows on phones (fixed); 14 phone bar wraps (fixed); 15 `width`/`height` on the `<source>`s (fixed); 16 WebP before AVIF (fixed); 17 op alt no longer mentions the status band (fixed); 18 ledger annotation tag sits inside the box (fixed); 19 tick targets read from `ENTRIES` (fixed); 20 S2 plate over the machine (not changed, camera is A's); 21 units are catalogue strings (`ro.tonnesFmt`, `ro.pctFmt`; fixed); 22 for A.

Also fixed: the pinned proof squashed its role rows on short or narrow screens (found in a headed run); the grid rows are `max-content` and short screens get tighter spacing.

## 3D footer wordmark

`landing-footer.tsx` holds a canvas plus two stills. The engine mounts `mountWordmark` through a dynamic import when the plate is within 700 px of the viewport (desktop, WebGL, motion allowed), drives `setProgress` with the footer's scroll-in progress (0 when the plate reaches the bottom edge, 1 a little after it has fully arrived), calls `resize()` on resize and disposes it when the plate leaves. Stills: `wordmark-top` is the no-script picture; `wordmark-3d` is shown on phones, with reduced motion and when WebGL is off or fails. The legend says "Contour lines of the simulated terrain", "Haul road" and "Today's trail", and "How it is made" says the lettering is built in code from the terrain function.

## Checks

typecheck and lint clean; `pnpm --filter web test` 570 passed (all files); `pnpm --filter web build` green. The 375 headed run has 26 frames (the headed window scrolls a little differently) and 0 dead/thin/flat; an earlier headed 375 run showed 2 thin frames caused by the language sheet being opened by a stray pointer event, plus a real overlap of the caption on the last S2 callout, which is fixed.

## Deviations

- `?still=s:p&ui=1` keeps the UI for the sync check (plain `?still=` hides it so posters stay clean).
- The tape rounds to whole minutes (stage 4 p .45 reads 10:44, entry 4 stamped).
- Hi screens are not captured; hi reuses the en captures.
- Hindi copy still needs Shlok's read.
