# Review: lane/l2-bay-home (HEAD 51ab749) against origin/main

Reviewer: Opus code reviewer, 2026-11-12. Scope: T5 Bay layout, Lows 1-3, the 360 px `.tape-pin` fix.

## Verdict: CHANGES REQUIRED

High 1 · Med 2 · Low 7

## Checks (real output, this worktree)
- `pnpm install --frozen-lockfile`: exit 0
- `pnpm --filter web typecheck`: exit 0
- `pnpm --filter web lint`: clean (no output)
- `pnpm --filter web test`: 48 files, 498 tests passed

## Browser QA (local dev server, fixture adapter, no API requests made)
| Viewport | Callouts | Overlaps | H-scroll | Page scroll |
|---|---|---|---|---|
| 1440x950 en | tags | 0 | no | none (950 = 950) |
| 1440x950 hi | tags (compact) | 0 | no | none |
| 1280x800 | tags | 0 | no | yes (by design) |
| 1024x768 | number pins (6) | 0 | no | yes |
| 768x1024 | number pins | 0 | no | yes |
| 375 / 360 | none | n/a | no | yes; tape pins 38 px wide |

Inert and SOS were checked live with director beats sent over the BroadcastChannel (Beat 3 Warning, Beat 5 Critical, Beat 2 lock).
SOS was never pressed. In every state (Caution, Warning, Critical, motion lock; 1440 and 375) the SOS button is outside any `[inert]`, not disabled, at z 40, and it is the top element at its own centre. The takeover is never inert and receives focus.

Present and working: the work-state word on the stage, and task, %, p50 and "up to" p90 in Now. Safety shows in the strip chip (the hero chip is hidden by an existing rule). Also present: conditions, today's tasks, Simple/Detailed, ProvenanceLine, LoopCard (zero props) and ShiftTape. No raw colours, and en/hi parity holds (2 keys each). This lane adds no branding.

## Findings

1. **High: the fleet-manager portal goes fully inert with no takeover.** `apps/web/src/components/chrome/lockable.tsx:19` and `nav.tsx:30` call `shellInert(shown, alerts)` for both roles, but `AlertLayer` mounts only for the operator (`shell.tsx`). The fixture store is shared through the BroadcastChannel and sessionStorage, so it carries the operator's open Warning/Critical. Verified at /fm after Beat 3: nav and main are `inert`, the "View it" button cannot take focus and nothing can be clicked. That is exactly when the FM must act (Beats 2, 3, 5). The same problem already existed under the motion lock (`s.operator.motion_locked`).
   **Fix:** pass `role` into `LockableBody` and `Nav` and return false when the role is not `operator`. Add an FM case to the test.

2. **Med: under a takeover the strip's actions can still be reached but cannot be seen or used.** Under Critical, the takeover uses `inset: 0`. Tab still reaches "Open safety", Language and Ask, all fully covered (measured), which fails WCAG 2.4.11. Under Warning, the Ask (and Language) sheet opens at z 20 behind the takeover at z 30, and focus moves into that hidden dialog (verified). SOS is not affected.
   **Fix:** in `shell.tsx` (owned by this lane), wrap the `actions` in a small client wrapper that sets `inert` when an operator takeover is up. The safety chip lives in `status-strip.tsx` (owned by l2-fm-detail): ask that lane for the same `inert`, or accept it and log it.

3. **Med: the fallback seatbelt mark lost its seatbelt pictogram.** `apps/web/src/home/shift-segments.ts:122` builds the live breach mark from a `seatbelt_off_moving` alert with `lessonCode: null`. `mark-picto.ts:10-15` then returns `"fault"`. Before Beat 4 the tape shows a triangle for a belt event, which is a regression. The substring heuristic (`includes("belt")`, `"zone"`) is also brittle and hard to defend.
   **Fix:** carry the alert kind on `ShiftMark` and map it through the existing `KIND_PICTO`. Use an explicit lesson-code table (`seatbelt_slopes`, `faulty_machine_nearby`) with `fault` as the fallback.

4. **Low: `aria-label` on the stage word `<p>`** (`home-screen.tsx:55`). ARIA prohibits naming a paragraph, so screen readers may drop it or read "Work state" in place of the state itself.
   **Fix:** remove it and add a visually hidden "Work state:" prefix span.

5. **Low: global rules live in a page stylesheet.** `styles/home.css:46-49` changes the operator `.shell` grid on every operator route, which fixes a real bug: the banner fell below the body at 1024 px and up. Lines 39-44 restyle `.tape`. Line 60 hard-codes the banner height.
   **Fix:** move the shell rules next to the shell grid (or into a shell-owned stylesheet) and the `.tape` rules into `shift-tape.css`.

6. **Low: the Now card sits far down the page on tablet and phone.** Parts rows are 142-162 px tall at 375 (study: 80 px rows), so Now starts at y 1448 at 375 and y 1263 at 768.
   **Fix:** at 768, put the parts list after Now/Practice (the study does not fix its order there). On phones, keep the chip on the row's line and show the meta lines only in Detailed.

7. **Low: the caption appears with no drawing.** "A drawing, not a photo" renders when `parts` is empty (`machine-bay.tsx:36`).
   **Fix:** render the caption inside the `parts.length > 0` branch.

8. **Low (existing before this lane):** tape rows are 48 px tall at 1024 px and up (`shift-tape.css`), below the operator's 80 px target. The new row layout keeps them.
   **Fix:** use `min-height: var(--hit)` for operator rows.

9. **Low: tests and docs.** `inert.test.ts` covers only the predicate. Add a render test that asserts `.sos-slot` and `.takeover` are never inside `[inert]` and that the FM is never inert. The `lockable.tsx:9-12` doc comment still says "while the motion lock is shown". `mark-picto.test.ts` uses invented codes; use fixture codes.

10. **Low: readability.** In `home-screen.tsx:97-136` the extras block was not re-indented after it was wrapped. Run Prettier.

## Implementer deviations
1. Viewport fit only at 1280x900 and up, a rail of `clamp(340px, 28vw, 400px)`, tags from 1280 and pins from 768 to 1279: **accepted.** 1440x950 fits in en and hi, nothing overlaps at 1024, 1280 or 1440, and below the fit size the page scrolls normally.
2. Listen only when a clip exists: **accepted** (no dead button).
3. Out-of-list files: `inert.ts`, `lockable.tsx` and `mark-picto.ts` are **accepted** as needed for Lows 2 and 3. The `.shell` grid rows are accepted in substance, but in the wrong file (finding 5).
4. Strip not inert: **not accepted** as it stands (finding 2). SOS and the takeover are never trapped by inert (verified).

Note (outside this lane): the Now card's machine line reads "EXC-007 · Cat 320", a fixture model name. Check it against the no-branding rule.

---

## Re-review @191bb78 (2026-11-12)

### Verdict: APPROVE

Remaining open items: 0 High, 0 Med, 3 Low (none blocking).

### Checks (rerun on 191bb78)
- `pnpm install --frozen-lockfile`: exit 0
- `pnpm --filter web typecheck`: exit 0
- `pnpm --filter web lint`: exit 0, no findings
- `pnpm --filter web test`: 50 files, 518 tests passed

### Live inert and SOS check
Local dev server, fixture adapter, beats sent over the `spotter-director` BroadcastChannel. Tab walks were real keypresses (Tab only). SOS was never pressed or held, and /api/sos-demo was never requested.

| State | Viewport | Inert regions | Reachable outside the takeover | Takeover controls | SOS |
|---|---|---|---|---|---|
| Caution (baseline) | 1440, 375 | none | everything | n/a | in tab order, top element |
| Beat 3 Warning | 1440 | strip wrapper, nav, shell-body | skip link only | Acknowledge, Show on map | Tab: Ack, Map, skip, **SOS**, Ack; top element, z 40 |
| Beat 5 Critical | 1440 | same | skip link only | Acknowledge | Tab: Ack, skip, **SOS**, Ack; top element |
| Beat 2 lock (+ Critical) | 1440 | strip wrapper, strip, nav, shell-body | skip link only | none (the "fix it" text, by design) | Tab: skip, **SOS**; top element |
| Warning / Critical / lock | 375 | same as at 1440 | skip link only | same as at 1440 | in tab order every time, top element, never inside `[inert]`, never disabled |

Nav items and main content were covered by the takeover under pointer tests at 1440. Under a takeover, `inert` also blocks clicks on them.

/fm after Beat 3, steady state: **0 `[inert]`**. Nav, the main "View it" button and Language all take focus.

### Prior findings
1. High (FM inert): **fixed.** `shellInert(role, …)` returns false unless the role is `operator`, and there is an FM test case. Verified live.
2. Med (strip reachable under a takeover): **fixed.** The operator-only `InertRegion` (`display: contents`) wraps the strip. The Ask/Language sheets can no longer be opened behind a takeover.
3. Med (tape pictogram): **fixed.** `ShiftMark.alertKind` is mapped through `KIND_PICTO`, with an explicit lesson-code table and `fault` as the fallback.
4. Low (aria-label on the `<p>`): **fixed** with an sr-only prefix.
5. Low (CSS location): `.tape` rules moved to `shift-tape.css`. The shell grid rules stay in `home.css` with a comment. Accepted.
6. Low (phone parts rows 142-162 px): **open.** It is in `machine-parts.tsx`, so it is deferred.
7. Low (caption with no drawing): **fixed.**
8. Low (48 px tape rows): **fixed.** Rows are 80 px at 1024 px and up. 1440x950 still fits without page scroll, with 0 tag overlaps (measured).
9. Low (tests): the FM case was added. The render-level inert test is **open** (vitest is node-only). The live check above stands in for it this round.
10. Low (indentation): **fixed.**

### New
11. **Low, existing before this lane (route to l2-fm-detail):** `components/chrome/status-strip.tsx:45` sets `inert={lockShown}` without checking the role. On /fm, after the operator's Beat 2 motion lock, the FM strip (Language) goes inert with no lock overlay. Seen live; it clears when Beat 3/8 lifts the lock.
   **Fix:** gate it on `showSafety` or on role, the same way `shellInert` now does.
