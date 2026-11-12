# Review: lane/l3-bay-machine @ 471b650 (D17 T2 + T3, Machine Bay drawing and parts list)

Reviewer: code-reviewer (Opus), 2026-11-12. Spec: interior-revamp/study.md (c) Direction 1 and (e) T2/T3;
decisions.md D17; visual-language.md §1.1. Part ids boom_ram|tracks|engine|cab|bucket|rear_sensor are
lead-approved, so they are not a finding.

## Checks run (in the lane worktree agent-a3078496b7cb7f203, branch untouched)
- web `pnpm typecheck`: "TypeScript: No errors found". `pnpm lint`: clean (no output). `pnpm test`: 437 passed (437).
- shared `pnpm typecheck`: no errors. `pnpm test`: 3 files, 147 passed (147).
- `next dev` + Playwright at 360x800, /op: scrollWidth 345 <= 360 in en and hi (no horizontal scroll);
  `.bay-tags` display none; only `boom_ram:caution` filled; rows 228/106x5 px (en), 203/93x5 px (hi), all >= 80.
- en/hi `bay.*` key parity: 22 keys each, none missing.

## Passed
- Contract: `parts: z.array(MachinePart).optional()` is additive; CONTRACTS_VERSION unchanged; tests parse with and
  without the field and reject an unknown id/state. Reducer spreads `state.machine`, so `parts` survives events.
- Cab derived from seatbelt + motion (warning moving, caution parked), never hidden by a milder given entry.
- SVG unbranded: tokens only, no logo, no livery; caution yellow appears only as a live state fill.
- Replay variant of the drawing sets no `data-state`, so no state fills; highlight becomes dashed ink.
- Every row carries the SIM caption; the stage carries "A drawing, not a photo. Readings simulated (SIM)".
- `--bay` / `--bay-grid` match the study values.

## Findings

1. **Medium** `apps/web/src/components/machine/machine-parts.tsx:35`: an unknown note key falls back to
   "Nothing to report" whatever the state, so a part can read "Critical · Nothing to report". The test at
   `parts.test.ts:25` builds exactly that case (tracks critical, `bay.note.ok`). Fix: fall back to "Nothing to
   report" only for ok, and use a generic per-state note (for example "Check at the next stop") otherwise.
2. **Medium** `apps/web/src/components/machine/machine-parts.tsx:19,38`: `variant="replay"` drops only the row
   stripe. The Chip still renders a filled caution/warning/critical plate, which breaks §1.1 ("inside Replay
   hazards are ink outlines; filled safety colour always means now"). Fix: in replay, use tone `outline`, keep the
   pictogram and word.
3. **Medium** `apps/web/src/components/machine/machine-drawing.tsx:125-130`: on >= 768 a tag shows its state by
   background colour only (number + part name, no state word). Caution and warning (yellow/orange) are
   indistinguishable to many colour-blind users, and the study type scale and bay-home-1440.png give each tag a
   mono caption ("OK", "PRESSURE RISING · CHECK AT BREAK"). Fix: add a caption span with `state.*` (and optionally
   the note) under the name.
4. **Medium** `apps/web/messages/hi.json:166-167`: "नकली" means fake/counterfeit. Elsewhere the app uses
   "सिम्युलेटेड" for "simulated" (hi.json:139, 276, 330, 472). In a safety app, "fake reading" damages trust and
   breaks the glossary. Fix: "रीडिंग सिम्युलेटेड (SIM)" and "SIM · सिम्युलेटेड रीडिंग".
5. **Low** `apps/web/src/machine/parts.ts:43-46` (with `worse` at :24): the cab branch is hard to explain in two
   sentences. Inside the `if`, `worse(p.state, d.state)` always equals `d.state`, and `derived` (:21) is read only
   by tests. Fix: compute `state = worse(given, derived)` and take the note from whichever side won. Drop
   `derived`, or use it in the UI.
6. **Low** `apps/web/src/styles/bay.css:55`: at 360 px the text column is 85 px wide because the chip keeps its
   full width, so the boom row is 228 px tall with one or two words per line. Fix: below about 480 px, wrap the
   chip under the text (`flex-wrap: wrap`) or stack it on top.
7. **Low** `apps/web/src/styles/bay.css:57,17-18`: `--stripe` is documented in tokens.css as "motion lock only",
   and spacing tokens `--s-1`/`--s-2` are used as stroke widths. Fix: use `--bw-heavy` for the row edge, and add
   or reuse border-width tokens for the thick lines.
8. **Low** `apps/web/src/components/machine/machine-drawing.tsx:57-65`: the tracks state fill sits under the
   inner rect and rollers, which are drawn outside the group, so a tracks state shows only as a thin rim. The rear
   sensor is 14x22 units (about 7x12 px at 360). Fix: move the inner track pieces into the `tracks` group (filled
   with state), and enlarge the sensor or add a state ring.
9. **Low** `apps/web/src/components/machine/machine-drawing.tsx:52` and `machine-parts.tsx:23-24`: the SVG label
   always says "six numbered parts", even below 768 and with `callouts="none"`, where no numbers are drawn. The
   parts section has both `aria-label` and an h2 with the same text. Fix: choose the label by `callouts`, and use
   `aria-labelledby` on the h2.
10. **Low** `apps/web/src/machine/parts.test.ts`: only the pure mapping is tested. Nothing locks in the T3
    acceptance points: replay renders no `data-state` (drawing, tags, chips) and tags exist only for
    `callouts="tags"`. Fix: add one render test per variant with Testing Library.

## Verdict
**CHANGES REQUIRED.** No High findings. Fix Medium 1-4 before merge; the Low findings can ride along.

## Re-review @ 1f1ff7d

Diff 471b650..1f1ff7d. Checks in the lane worktree (HEAD 1f1ff7d, clean): web typecheck "No errors found", lint
clean, vitest 437/437; shared vitest 147/147. With `next dev` + Playwright on /op at a 375 viewport, scrollWidth is
360 = clientWidth (no horizontal scroll) and rows are 162/142 px. At 1440, rows are 86 px and all six tags sit inside
the stage with a state word.

| # | Status | Evidence |
|---|---|---|
| M1 note fallback | Fixed | `machine-parts.tsx:37`: "note.ok" is used only for ok; a non-ok state with no key or with the ok key gets the new `note.generic` ("Check at the next stop", en/hi). |
| M2 replay chips | Fixed | `machine-parts.tsx:40`: in replay the tone is `outline`; the pictogram and the word stay. |
| M3 tags colour-only | Fixed | `machine-drawing.tsx:130-133`: a `state.*` caption under each name; in the live DOM the tags read "Boom and ram Caution", "Tracks OK" and so on. |
| M4 Hindi "नकली" | Fixed | hi.json:167-168 now uses "सिम्युलेटेड", matching the rest of the catalogue. |
| L5 cab logic | Fixed | `parts.ts:40-44`: one rule, "derived wins when it is non-ok and at least as bad, else given", with its note. `derived` and `worse` are removed and the tests are updated. Easy to explain. |
| L6 phone rows | Fixed (trade-off) | <= 480 px the chip wraps under the text. The text column is now 265 px instead of 85 px, but every row grows to 142 px (was 106), so the list is about 230 px longer on phones. Acceptable. |
| L7 tokens | Fixed | `--bw-heavy` for the row edge and the thick line, `calc(--bw-heavy * 2)` for the thicker one. |
| L9 a11y labels | Fixed | The label depends on `callouts`; the section uses `aria-labelledby` + `useId`. en/hi parity holds (24 keys each). |
| L8 geometry | Skipped, accepted | Cosmetic; the list carries every state. |
| L10 render tests | Skipped, accepted | Still open: a node-env render test with `react-dom/server` `renderToStaticMarkup` + `NextIntlClientProvider` would need no new dependency. |

New finding (regression from M3):
11. **Low** `machine-drawing.tsx` CALLOUT (engine `ty: 146`, rear_sensor `ty: 120`): the two-line tags are taller,
    so at 1440 the Engine tag (783-889 x 354-407) overlaps the Rear sensor tag (665-812 x 325-378) by about 29x24 px.
    Only the borders and the empty corner overlap; no text is hidden. At 768 the stage is narrower, so expect more
    overlap. Fix: raise rear_sensor `ty` (to about 100) or lower engine `ty` (to about 170).

Verdict: **APPROVE.** All four Mediums are fixed with no functional regression. Low 11 and the open L10 can follow up
in T5 (Bay layout).
