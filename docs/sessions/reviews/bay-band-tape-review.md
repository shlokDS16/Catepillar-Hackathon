# Review: lane/l2-bay-band-tape @ 5b19f03 (D17 T1 honest band + T4 shift tape)

Reviewer: code-reviewer (Opus), 2026-11-12. Spec: study.md (c) Direction 1, (e) T1/T4, Deviations 4-5; D17.

## Verification (run in the implementer worktree, clean at 5b19f03)
- `rtk tsc --noEmit`: TypeScript: No errors found.
- `rtk lint`: ESLint: No issues found.
- `vitest run`: 448/448 passed (174 suites).
- New tests (shift-segments, sync-state, data-label) run 6 times in a row: 17/17 each time. They are pure: fixed ISO times, no `Date.now`, no `new Date()`, input sorted before use. The reported flake is not in these files; look at the older suites.

## Passes
"FIXTURE" never shown (en/hi `fixture`/`fixtureStatus` now "Demo data", test asserts it); one `dataLabel()` decides the caption, so a "Live data" variant is a single `case`; Saved cell hides below 760 px; `body { overflow-x: clip }` (base.css:17) rules out horizontal scroll at 360; now floored to the sim minute, no transition; pins `aria-hidden` with row twins; rows `min-height: var(--hit)` (80 px) below 768; en/hi key parity (14 tape + 4 chrome); replay route exists.

## Findings
1. **High** `apps/web/src/home/shift-segments.ts:90-102`: a late planned task, and a paused or blocked one, stop at now with no remaining Planned part, so the gap to the next task is drawn as a Break. It shows in the implementer's own shots: 09:42 to 11:00 is blank (Break) while Excavation still has 77 min to do. Fix: after now, push Planned for `p50 * (1 - progress)` and set `end` to `now + left` (as the in_progress branch does), then update the paused test.
2. **Medium** `components/chrome/status-strip.tsx:37-38,59`, `chrome/sync-state.ts:12`: the Sync cell is not wired to any writes. "Saved" on desktop in demo mode claims a save that nothing measured, and "Waiting to send" (reconnecting, n = 0) suggests pending writes that may not exist. Fix: until an outbox exists, render the cell only for `nosignal` ("Offline"), and keep `syncState` and its tests for when the outbox lands.
3. **Medium** `shift-segments.ts:107-114`: every assignment with a `replay_id` becomes a "Seatbelt off while moving" mark, and when its event time is unknown it borrows the seatbelt alert's `first_seen`. An assignment from another event gets the wrong label and the wrong time. Fix: mark only assignments whose `because_event_id` has a known time (or matches the seatbelt alert), and skip the rest.
4. **Medium** `styles/shift-tape.css:54-66`, `components/home/shift-tape.tsx:55`: the Now label is centred with no edge handling and sits on the hour row. It covers "09:00/10:00" in both shots, and at the start of the shift half of it is clipped off. Fix: reuse the pins' `data-edge` logic and hide the tick under the label (or move the label below the hours).
5. **Low** `shift-tape.tsx:44`: the lane's `role="img"` label gives only the time range. Working/Waiting/Break/Planned never reach a screen reader (`title` inside `role=img` is ignored). Fix: put a short segment summary in the label or a visually hidden list.
6. **Low** `status-strip.tsx:59`: an `aria-label` on a plain `span` (generic role) is not reliably announced. Fix: use visually hidden "Sync:" text.
7. **Low** `shift-segments.ts:95-97`: a completed task is drawn as solid Working from `planned_start` for its p50 (the reducer deletes `taskWork` on completion), so an estimate looks like a measurement. Fix: say so in the doc comment so Shlok can explain it, or draw it as Planned.
8. **Low** `shift-segments.ts:59`: `startMs` ignores `heatMs`, so a past heat peak is clamped to 0 %. Pins that sit close together overlap. Fix: drop peaks before `startMs`, and offset or merge pins closer than about 15 %.
9. **Low** `messages/{en,hi}.json` `home.tape.empty`: an unused key, because `ShiftTape` returns null when there are no tasks. Fix: remove the key or render the empty state.

## Verdict
CHANGES REQUIRED (finding 1 is visible in the default demo state; 2-4 are defensibility and visual issues).

## Re-review @ cc02f16

Diff 5b19f03..cc02f16. Run in the implementer worktree (clean at cc02f16): `tsc --noEmit` no errors; `eslint` no issues; `vitest run` 41 files, 450/450 passed; `src/home` + `src/chrome` run 3 more times, 19/19 each time. en/hi key sets are identical (script diff: 0 en-only, 0 hi-only); none of the removed keys is still referenced.

| # | Status | Evidence |
|---|---|---|
| 1 High | Fixed | `shift-segments.ts`: paused, blocked and late tasks keep `p50 * (1 - progress)` as Planned after now and set `end` to match. A new test covers late, paused and blocked tasks before an 11:00 task: no Break. The 375 shot shows dotted 09:00-09:41, then hatched, and no blank gap. |
| 2 Med | Fixed | `status-strip.tsx`: the cell renders only when offline, with a comment saying why. |
| 3 Med | Fixed | A mark is made only when the assignment's event time is known. Its name comes from its own `lesson_code` through `useLessonTitle`, falling back to "Safety event". The fixture's `recent_events` holds the breach event, so the Replay link still appears in the demo. |
| 4 Med | Fixed | The now label sits below the hour row and uses the same `data-edge` logic as the pins. The 375 shot shows it clear of the ticks. |
| 5, 6, 7, 9 Low | Fixed | Segment summary in the lane's `aria-label`; visually hidden "Sync:" prefix; completed-task estimate stated in the doc comment; `empty` key removed. |
| 8 Low | Partial (accepted) | A heat peak before the tape start is dropped (tested). Close pins can still overlap. |

New Low items (none blocking):
10. **Low** `docs/design/qa/bay-band-tape-1440.png`: the new shot is a broken capture (two narrow panes, the tape is not visible), so the desktop now-label fix has no visual evidence. Fix: retake the shot at 1440 wide.
11. **Low** `status-strip.tsx:62` uses `.tape-sr`, which is defined in `shift-tape.css` and duplicates the existing `sr-only` utility. Fix: use `sr-only`.
12. **Low** dead leftovers: the `chrome.syncSaved` and `chrome.syncQueued` keys (en/hi) and the `.strip-sync[data-state="saved"]` rules in `components.css` no longer render. Fix: remove them, or keep them with a comment saying they wait for the outbox.
13. **Low** `shift-tape.tsx` Pin/Row: every non-heat mark uses the seatbelt pictogram, even when its lesson is about another event. Fix: pick the pictogram from the lesson code, or use a neutral one.

APPROVE
