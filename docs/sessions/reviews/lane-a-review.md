# Code review: lane/l2-lane-a @ 96132a7

Reviewer: code-reviewer (Opus), 2026-11-12. Scope: `git diff origin/main...origin/lane/l2-lane-a` (25 files, +565/-66),
judge-review rows 2, 3, 4, 5, 9, addendum 7, 8, 9, and the idea.md §7 rewrite.

## Checks run (in the lane-a worktree, read-only)
- `rtk tsc --noEmit -p tsconfig.json` (apps/web): TypeScript: No errors found
- `rtk lint` (apps/web): ESLint: No issues found
- `rtk vitest run` (apps/web): 452 tests, 452 passed, 0 failed (JSON report)
- Browser check: `next dev` on port 3117 at 1440x900, then Beat 3 sent over the `spotter-director` BroadcastChannel and the page reloaded.
  Results: the takeover box is `[0, 104, 1425, 796]`; `elementFromPoint(60, 50)` hits the rail link `/op`; `nav.inert` is false;
  the SOS slot is `[0, 384, 120, 376]`, and the left edge of the Acknowledge button (x 32-193, y 651-759) hits **SOS**. The Warning
  came back after the reload (persistence works), and `/op/training` shows the seeded Replay and Lesson cards with no Director step.
  The `/op/training/lesson/[code]` and `/replay/[id]` routes return 404 in this dev environment (every dynamic route does, so it is an
  environment problem, not this lane). That leaves #9 (the Lesson buttons) unverified in a browser.
- I removed the `.vitest/` and `.next/` folders I created in that worktree, so its tree is clean again.

## What is right
- Row 2: the baseline inbox has no ledger_tamper row. Beat 5 raises it together with a `dispatch.sent` event whose status is `dry_run`.
  The static rows now read `telegram:dry_run`.
- Row 3: the baseline seeds `base.assignments`, and Beat 4 re-uses the same assignment id, so a single assignment remains (tested).
- Row 4: the vest is off at baseline, task 0 is `blocked_ppe` and there is one PPE caution. That caution shares its id with the FM inbox row,
  so the live store status wins there. The map "Moving" flag comes from `machine.moving`.
- Row 5: sessionStorage access is wrapped in try/catch throughout and guarded with `typeof window`, so the server render is safe.
  Reset reaches the other tabs over the BroadcastChannel, and `persistOn` stops late timers from writing old state back. Beat 8 is correct.
- The reducer change for `parked` matches the server semantics: the scenario engine sets `parked` only when the machine is not moving
  and unlocked (004c_cab_state_staleness.sql), so a motion lock while moving keeps the `moving` reason.
- D15: no new network path is added, and every dispatch the fixture emits is a dry run.

## Findings

1. **High.** `apps/web/src/styles/components.css:712-721`: at 1024 px and wider, the takeover now starts at x=0 while the SOS slab
   (z 40, above the takeover's z 30) sits over x 0-120 from y 384. The slab covers the left 88 px of the **Acknowledge** button and the
   start of the protocol steps, so a tap on the left half of Acknowledge presses SOS (measured above).
   Fix: keep painting over the rail, but pad the takeover content clear of the rail (`padding-inline-start: calc(var(--rail-w) + var(--gutter))` at 1024 px and up).
2. **Medium.** Same rule (addendum #8 not fully closed): the takeover starts at `--strip-h` but the strip only spans grid column 2, so the
   rail's top 120 x 104 px area stays visible. The Home link and 8 px of the next item remain clickable during a Warning with no
   motion lock (Beat 3: `nav.inert` is false). The deviation "only the status strip stays visible" is therefore not what ships.
   SOS stays reachable in every tier (z 40), which is the right call.
   Fix: make `nav` inert while a takeover is open, as is already done for the motion lock, and cover the rail's top cell (or start the takeover at y 0 inside the rail column).
3. **Medium.** `apps/web/src/data/fixture-persist.ts:11,43`: `VERSION` is a hand-bumped constant, and restored events are checked only
   for `seq` and `type`. The reducer casts payloads without validating them (`reducer.ts` `payload()`), so if a code change reshapes a
   payload (for example `ppe.restored.items`), an old tab replays an event that throws inside the reducer and the store breaks with no recovery short of Reset.
   Fix: parse each restored event against the shared `EVENT_REGISTRY` schema and drop the ones that fail, or derive the version from a build id.
4. **Medium.** `docs/specs/idea.md:211,216,226`: §7 does not match what runs.
   (a) Step 1 says ETA 52 min (P90 61) with heat +22 %. The fixture shows 77 min (P90 92), and the merged weather and heat row is about +30 %.
   Separately, `fixture-adapter.ts:379` recomputes the ETA from 52, so the ETA drops from 77 to 47 on the first progress tick (this predates the lane but is visible in step 1).
   (b) Step 3 says the app shows the call to Ravi as a dry run, but Beat 3 emits no `twilio_voice` dispatch, so no call line appears anywhere.
   (c) Step 5 says Anita uses "her own Telegram message (pasted; nothing is sent)", which contradicts itself.
   Fix: quote the numbers the fixture actually produces, either emit a `twilio_voice:dry_run` dispatch in Beat 3 or drop the sentence, and say the checkpoint line is copied from /director.
5. **Medium.** `apps/web/messages/en.json:561,574` (and the matching hi keys): the ledger compare copy still reads "Open the
   SPOTTER-LEDGER message in your Telegram" and "Matches your Telegram checkpoint". Under D15 no message exists, so this repeats the row 2 honesty problem on the ledger page.
   Fix: reword it as "the checkpoint line (sent by Telegram in a live run; this demo sends nothing)".
6. **Medium.** `apps/web/messages/hi.json:47`: "बनियान चाहिए" means "needs an undershirt", and the same file translates vest as "जैकेट" (lines 660 and 1045).
   This is the first word on the state plate in the Hindi opening of the demo. Fix: use "जैकेट चाहिए".
7. **Low.** `en.json:47`: the work-state word "Needs vest" is hard-coded for every `blocked_ppe` task, so in the live path a missing helmet
   would also read "Needs vest". Home's task chip (`home-screen.tsx:84`, `enums.taskStatus`) still says "BLOCKED" beside it.
   Fix: use "Needs PPE" (or interpolate the missing item) and align the task chip with it.
8. **Low.** `fixture-adapter.ts:82,114`: after a reload mid-task the progress timer is not restarted, so progress freezes. `simMs` goes back to
   its value at the last `persist()`, and the 4 s sensor resolve after an Acknowledge is lost if the reload lands inside that window (Beat 8 recovers it).
   Fix: restart `startProgress` when the restored log shows the task in progress, and note the Beat 8 recovery in the runbook.
9. **Low.** `reducer.ts:307-318`: `ppe.restored` resolves every open `ppe_missing` alert and unblocks every `blocked_ppe` task, whoever
   they belong to. That is correct for the operator store but wrong for an FM-scoped store in the D18 live path.
   Fix: scope it by `task_id` or by operator.
10. **Low.** `alert-layer.tsx:81`: a 300-character one-liner repeats the dispatch formatting in `inbox-detail.tsx:171`.
    Fix: extract a `dispatchLabel(t, line)` helper into `inbox/inbox.ts` and use it in both places.
11. **Low.** `task-state.ts:142` and `provenance.ts:22`: the merged-row source is a hard-coded string that bypasses `FIELD_PROVENANCE`.
    The same literal is duplicated in `SOURCE_MESSAGE_KEY`, and no test covers it.
    Fix: reference the constant, and add a `factorRows` test for the merged row's tag. The label itself fixes addendum #7: weather is organiser data and temperature is Open-Meteo.
12. **Low.** `packages/shared/src/fixtures/ids.ts:35` and `ledger/fixtures.ts:27-29`: `IDS.anomaly` stands in for EXC-014's machine id, and
    the operators are picked by string prefix. The seed of 213 rows now spans about 18 hours and is shown in UTC.
    Fix: add an explicit machine id for EXC-014, list the operator ids explicitly, and keep the seed inside one shift.
13. **Low.** `components.css:712-721` repeats the base `inset` values, and the critical override at 1024 px is now dead.
    `training.css:152`: the sticky Lesson actions look correct (no ancestor sets overflow, and the offset clears the dock) but are unverified.
    Fix: delete the redundant rules, and check #9 at 1440x900 and 375x812 in a working dev environment before merging.

Implementer deviations, judged: takeover over the rail is accepted only once findings 1 and 2 are fixed (SOS reachable: yes). The
#9 CSS is plausible but unverified. The "Needs vest" wording: see findings 6 and 7. The reducer `parked` change is accepted (no
unintended effect found). The `ppe.restored` change is accepted for this lane (finding 9). The witness line changed with the re-seed;
that is expected, and the copy in finding 5 is the bigger issue. Tests are meaningful: the baseline, Beat 8, persistence and
reset each have real assertions; the gaps are the merged-row tag and the takeover layout.

Counts: High 1, Medium 5, Low 7.

**Verdict: CHANGES REQUIRED** (finding 1 blocks the merge; findings 2-6 should be fixed before the demo).
