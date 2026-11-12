# Review: lane/l3-wait-fleet (c7cac8c) against origin/main

Reviewer: code-reviewer (Opus), 2026-11-12. Scope: T6 While you wait, T8 Fleet strip (phase23-lanes.md; study.md (e) T6/T8, (c) Direction 1; lane-rules.md).

## Verdict: CHANGES REQUIRED

High 0 · Medium 3 · Low 9. No SOS was pressed and /api/sos-demo was never called.

## Checks (real output, this worktree)
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm --filter web typecheck`: tsc --noEmit, 0 errors.
- `pnpm --filter web lint`: eslint clean (no findings).
- `pnpm --filter web test`: first run 1 failed / 505 passed (506), 48 files. The failure was `src/ledger/witness.test.ts` ("match: the published line equals the browser recompute..."), which this lane does not touch. A rerun passed 506/506 (48 files), so the test is flaky, not broken by this branch.
- Browser (dev server, fixtures): at 360 px `scrollWidth` = 360, so there is no horizontal scroll. 3 cells are visible, "+3 more" is 80 px tall, and the page has one `section.fleet` with one `aria-current`.

## Implementer deviations
1. **DEMO_ROSTER (LDR-001, DMP-005).** It does not leak. The two codes appear only in `fleet.ts` and `fleet.test.ts`. `map-state.test.ts` uses LDR-001 on its own, and that use is older than this lane. Nothing reaches alerts, the ledger, the map or the store. The caption "Demo fleet · tasks and movement simulated" is visible at every width in en and hi. It is not fully accurate, though: two whole machines are invented, not only their tasks and movement (see L12). The roster also has a real honesty bug: see M1.
2. **Two mounts in inbox-screen.tsx.** This is safe at runtime. `if (desktop) return ...` makes the two branches mutually exclusive, the strip has no ids, and the browser showed one landmark and one aria-current. It is still outside the lane's "one mount line" rule (L4).
3. **Idle measured from the first time the store sees the parked state.** Motion is handled correctly: the predicate and the reset both run in the same render, so the card hides on the next store update. Reload and remount are conservative: the card appears late, never early. Offline works in fixture mode. Live NO SIGNAL has a gap (L5).

## Findings
**M1 (Med) `apps/web/src/components/inbox/fleet.ts:16`, `:61`. Ravi is shown operating two machines.** The roster gives EXC-014 to Ravi. The `operatorByCode` override also copies the name from the guardian_hazard row, where `operatorName` is the person in danger, not the driver. The strip shows "Ravi · Trenching" and "Ravi · Excavation" side by side, and a judge will notice. Fix: give EXC-014 a different roster name (Sunita is already in `DISPLAY_NAMES`), drop the alert-row override or exclude guardian_hazard from it, and update the "prefers the operator named on an alert row" test.

**M2 (Med) `apps/web/src/styles/fleet.css:24-25`. The plates overflow their cells at 1024 px.** Six columns leave about 103 px of content, and `.chip` is `white-space: nowrap`. Measured: the WARNING plate ends 22 px past the EXC-014 cell border and CAUTION ends 18 px past EXC-007, running into the next cell. Fix: use 6 columns only from 1280 px (3 columns from 1024 to 1279), or a smaller plate size in the strip.

**M3 (Med) `apps/web/src/components/inbox/inbox-screen.tsx:280`, `fleet.css:56-57`. On phones the strip pushes the triage focus below the fold.** At 360×780 the strip ends at y=690 and the lead alert heading starts at y=824, under the dock. Study (c) FM 375 puts the triage focus first. Fix: make the phone cells compact (3 cells in one row: code and plate only, operator line hidden) so the lead stays above the fold. Moving the mount below the lead card would also work, but that file is L2's, so coordinate.

**L4 (Low) `apps/web/src/components/inbox/inbox-screen.tsx:8,213,280`.** Three lines changed in L2's file where the lane allowed one. The change is justified, but tell L2 before T9 merges.

**L5 (Low) `apps/web/src/components/home/loop-card.tsx:30-33`.** `idleSince` is local state, so it resets on reload and on Home remount. On live NO SIGNAL, `sim_now` freezes and the stale `moving=false` keeps a card that is already showing on screen. Fix: add a reducer `pausedSince` from the `task.paused` sim time, which the reducer already reads for `taskWork`, and pass `moving: null` when connectivity is no-signal.

**L6 (Low) `apps/web/src/components/home/loop-card.tsx:26`.** Subscribing to `sim_now` re-renders LoopCard at 1 Hz and recomputes `trainingItems`. Wrap it in `useMemo` keyed on assignments, progress and times.

**L7 (Low) `apps/web/src/components/inbox/fleet-strip.tsx:35`.** The `near_miss` branch is dead code: `sanitise` strips `machineCode` (inbox.ts:61-80). The `as` cast hides the type. Narrow the kind in `worstOpen` and use a type guard for the tier state.

**L8 (Low) `apps/web/src/components/inbox/fleet-strip.tsx:23,42`.** The section's `aria-label` repeats the h2. Use `aria-labelledby`, and add `aria-controls` from the "+3 more" button to the list.

**L9 (Low) `apps/web/src/components/home/loop-card.tsx:48`.** When the assignment is replay-only, the WaitCard says "One short lesson" but its button is Practise. Swapping cards on motion also drops focus if it was inside the card. Fix: neutral copy, and move focus to the Practice card's action on swap.

**L10 (Low) `apps/web/src/components/home/loop-card.tsx:31-33`.** The idle tracking that carries the risk (set on the first parked render, cleared on motion) has no tests. Extract a pure `nextIdleSince(prev, parked, nowMs)` and unit-test it.

**L11 (Low) `apps/web/messages/hi.json` `fleet.task.trenching`.** "खाई" means "ditch". Use "खाई खुदाई". en/hi parity is otherwise complete (25/25 keys).

**L12 (Low) `apps/web/messages/en.json` `fleet.note` (and the hi pair).** The caption understates what is invented. Use "Demo fleet · simulated roster" or similar.

No Cat branding was found in the new code or strings. The fleet unit tests do test real behaviour: worst tier wins, only open rows count, the selected machine is swapped into the phone cells, and the roster codes are unique.

## Re-review @c156e76

### Verdict: APPROVE

High 0 · Medium 0 · Low 3. All three are follow-ups and none blocks the merge. No SOS was pressed and /api/sos-demo was never called.

### Checks (real output, this worktree)
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm --filter web typecheck`: exit 0, no errors.
- `pnpm --filter web lint`: exit 0, clean.
- vitest: 48 files, 509/509 passed (3 new `nextIdleSince` tests).
- The lane diff against origin/main touches only apps/web, the QA PNGs and track-x.md. STATE.md and unanswered-questions.md appear only through the merge of main.

### Browser (dev server, fixtures)
- **1024 px:** 3 columns. Each plate ends at least 117 px inside its cell, so the overflow is gone. Page `scrollWidth` 1009 against a 1024 viewport.
- **1280 px:** 6 columns on one row. The tightest plate (WARNING) ends 21 px inside its cell.
- **375×780:** the lead alert heading is at y=254, above the fold. The strip starts at y=981 and the queue at y=1571. 3 cells are visible (EXC-014 selected, EXC-007, DMP-003), "+3 more" is 80 px tall, `aria-controls` points to the UL, `aria-labelledby` resolves to "Fleet", and `scrollWidth` is 375.
- The strip has one landmark and one `li[aria-current]`. The other aria-current element is the dock's Inbox link, which is unrelated.

### Earlier findings
- **M1:** fixed. EXC-014 is now Sunita, the alert-row override is removed, and a test pins Ravi to EXC-007 only.
- **M2:** fixed. The strip uses 6 columns from 1280 px and 3 columns from 768 to 1279 px.
- **M3:** fixed. The strip now mounts after the lead card in the triage branch.
- **L4:** acknowledged only. Two mount lines remain in L2's file, the branches are still mutually exclusive, and L2 should be told before T9 merges.
- **L5:** partial, and acceptable for a demo.
  - Fixed: a dropped feed now sets `moving` to null, which hides the card (`loop-card.tsx` `live` selector).
  - Remaining: after a reload or a Home remount the card shows up about 3 sim-min late, which is about 18 s of wall time at 10× speed. It is never early or wrong, which is the safe direction for a safety app.
  - Keep as a follow-up: a reducer `pausedSince` from the `task.paused` sim time.
- **L6 to L12:** fixed.
  - `useMemo` for `trainingItems`.
  - `isTier` guard; `near_miss` is excluded in `worstOpen`, so the dead branch is gone.
  - `aria-labelledby` and `aria-controls`.
  - "Practise while nothing moves" copy.
  - Focus hand-off on unmount.
  - `nextIdleSince` extracted and tested.
  - "खाई खुदाई".
  - The caption now names the invented machines.

### Remaining (Low, follow-up only)
- **R1** `apps/web/src/components/home/loop-card.tsx` `WaitCard`. The focus hand-off relies on `onBlur` not firing before the unmount cleanup, and on `.loop a, .loop button` matching the first loop card in the document. It has no test. Check it once by hand with a keyboard on /op during a pause.
- **R2** `apps/web/src/styles/fleet.css:56-57`. On phones the single-column cells push the queue about 590 px further down. Compact phone cells (code and plate only) would win that space back.
- **R3** `apps/web/messages/en.json` `fleet.note`. The caption puts the machine codes inside the copy string. If the roster changes, the caption can go stale. Interpolate the codes from `DEMO_ROSTER` instead.
