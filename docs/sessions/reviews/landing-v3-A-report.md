# Landing v3, implementer A (scene and generators): report

Branch `lane/l2-landing-v3-a` (from `origin/lane/l0-landing-v3-docs`).

## Built

- `scene/shift.ts` is at `components/landing/shift.ts`. It was missing from the branch, so I created it verbatim from spec 8.3. The content is identical to what B should have, so the merge is clean.
- `scene/route.ts` (new, pure): truck route, `ringLevel`, `truckF/truckDistance`, `TRAIL_XZ`. The schedule is a monotone Hermite over "metres still to go", so every ring crossing lands exactly on its p. The closest-approach point is placed at 7.4 m from the machine centre by geometry.
- `scene/camera-path.ts` (new, pure): camera t and orbit from `ps`. Stage 1 holds the hero to .35, then pulls back. Each later shot arrives over p 0-.2, holds .2-.8 and leaves in .8-1, so a move is continuous across the band boundary. The orbit builds while a shot holds and unwinds with the move out.
- `scene/index.ts`:
  - New view offsets: desktop action in the right 62% with the bottom 120 px clear, phone action in the 120 px to 55% band.
  - `getReadout()` as in 8.3. `getAnchors()` returns a 4th point, `{id:"truck"}`.
  - The beacon is caution during `S2.seatbeltOff`.
  - The truck follows `truckF(ps[3])`. Ring 3 is entered at .45, the closest approach is 7.4 m, ring 4 is never entered, caution is back at .80 and clear at .90.
  - Stage 5: the trail and machine rewind to `REWIND_T = 0.82` by p .55, then redraw ghosted to 1.
  - Compact devices (width under 768 or coarse pointer): DPR 1, no dust, no pulses, 30 fps cap, render only when `ps` changed or the scene is still moving, governor threshold 40 ms. Desktop budgets are unchanged.
- `scripts/landing-contours.ts` plus the `landing:contours` npm script. It uses `terrainHeight` as the only source, with marching squares on a 0.6 m grid over x ±300 and z ±125.
  - Output: `public/landing/contours.svg`, 224.8 KB raw, 69.6 KB gzip (limit 75).
  - It uses only the custom-property classes `cm cM cf trail road ring`, in one path per class.
  - The output is deterministic (same sha1 on each run).
- Posters: `poster-1..5` and `poster-1-m..5-m` (.webp and .avif), rendered from the real scene with `?still=` at 1:0, 2:.5, 3:.7, 4:.45 and 5:.3. They are rendered with only the canvas visible, so there is no Next dev badge and no baked-in scrim. All are at most 23 KB. The mobile ones are 750x1300. `poster-1` is new, because the hero is currently the inline SVG.
- Tests: `scene/timeline.test.ts` has 12 tests.
  - Truck route: 12 m at .45 ±0.5 m, ring 3 entered at .45 ±.02, caution at ≈.30, closest approach 7.4 ±0.3 m and held, ring 4 never entered, back to caution at .80 and clear at .90 (±.02), monotone approach.
  - Camera: 60% hold plateau, continuity across the four band boundaries, never backwards.
  - Tape sync: a shift-clock check.

## Counts

- Typecheck: clean.
- Lint: clean.
- Web tests: 544 passed (including the 12 new ones).
- `pnpm --filter web build`: green.

## Even density (lead answer, section 16)

- The ground sets the contour interval locally. The finest interval is 0.00625 m on flat ground and 1.6 m on faces; 3.2 m is used on very steep faces. The 8 m lines always stay.
- Line length per letter box (m of line per m², seven glyph boxes from the mockup): S .56, P .57, O .47, T .50, T .48, E .54, R .51. Max/min is 1.22. The mockup was about 2.
- Screenshot: `docs/design/qa/landing-v3/A-footer-contours.png`. It is the contour map dropped into the mockup footer.

## Screenshots looked at

All are in `docs/design/qa/landing-v3/`:

- `A-footer-contours.png`
- `A-1440-s2-0.5.png`
- `A-1440-s4-0.45-warning.png`
- `A-1440-s5-0.3-replay.png`
- `A-750-phone-stills-s1-s5.png`

I also looked at the 1440 frames S1 0, S3 .8 and S4 .45 (truck on the 12 m ring boundary), and the 750 phone framing.

## Deviations and notes

1. **`SceneAnchor.id` stays 3-valued in the types.**
   - The runtime array has a 4th element, `{id:"truck"}`. It is exported as `SceneAnchorId` and is typed through a cast.
   - Reason: widening it breaks `landing-engine.tsx`'s own narrower `Anchor` type, and that file is B's. B should widen its `Anchor.id` to include `"truck"`.
2. **The "closest" window .62-.80 is not constant.**
   - The truck holds 7.4 m (within ±0.3) from .62 to .74, then backs out. It crosses 12 m at exactly .80, because caution has to come at .80.
   - The test checks min = 7.4 over .62-.80 and the hold over .62-.72.
3. **`REWIND_T = 0.82` is my choice.** The spec only names the "entry 4 point". Entry 4's clock lies past the end of the trail, so I rewind the machine's last 18% of travel.
4. **`nearestM` is the route's front point to the machine centre** (the same value the rings use), not the bumper.
5. **`?still=` only exists outside production.** The posters were therefore rendered from `next dev` with only the canvas visible, rather than from a production build. The result has no badge.
6. **The footer legend text "every 1.6 m" is no longer literally true** on very steep faces (every 3.2 m there). B could say "Bench contours, 1.6 m and 8 m".
7. **The `next start` I tried on :3210 hit a port that was already served.** The prod screenshot I looked at was probably B's server. I did not verify my own prod build visually, only that it builds. The still-mode frames were checked in dev.
8. I did not add a line to the track-f lane log.

## Needs from B

- Widen `Anchor.id` to include `"truck"`, and read `getReadout()`.
- Use `poster-N-m` on phones, `contours.svg#map`, and the `use.dim/.lit` styling from the mockup.
