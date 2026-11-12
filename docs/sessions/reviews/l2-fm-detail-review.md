# Review: lane/l2-fm-detail (4f505e7) against origin/main

**Verdict: CHANGES REQUIRED** (0 High, 2 Med, 6 Low)

Checks (this worktree, `pnpm install --frozen-lockfile` exit 0): `typecheck` exit 0, `lint` exit 0,
`test` 47 files / 503 tests passed. No build run here.

Safety: nothing in the diff can send anything. Verify and Compare are `href="/fm/ledger"` links, the seal line is a
`<Link>`, and the timeline only renders store lines. The "Dry run, nothing sent" caption is true by construction
(server `private.alert_dispatch_status()` always writes `dry_run`, 007_alert_engine.sql:39). No Cat branding. en/hi
key parity holds. The 360 px capture shows no horizontal scroll (I checked the capture only, not a live browser).

## Implementer deviations
1. Band verify: effect deps `[enabled, port, tamper]`. The FM layout mounts once, so this is one verify per page load
   plus one per change in the tamper count, not one per render. It is still not sound; see 1 and 2 below.
   `showSafety=false` is FM today (shell.tsx:34, ShellRole has only 2 values), but it is implicit; see 4.
2. Drawing only when the machine code matches the store machine: correct (it never draws another machine's state).
3. Tier chips with non-zero tiers only: acceptable reading of the spec.
4. Verify/Compare as links: correct and safe.

## Findings
1. **Med**: the band and the Ledger page can disagree. status-strip.tsx:26-27,51 re-verifies only when the
   count of `ledger_tamper` alerts changes, and it counts any status. ledger-screen.tsx:123-147 never calls
   `setLastVerify`. In the demo, beat 7 (fixture-adapter.ts:242) restores an intact ledger without any alert change,
   so the band keeps "check needed" while /fm/ledger shows verified. Fix: publish from `runVerify` (server ok and
   local ok), and re-verify the band on `ledger.*` events, not on the alert count.
2. **Med**: Live mode can show a false "verified". `LiveAdapter.live` (live-adapter.ts:31-43) returns the fixture
   verdict on any failure (forbidden, network, `ledger_busy`). The band then shows "214 entries · verified" for a
   chain nobody checked. Fix: show `unknown` when `useLiveState().failed` includes `ledger_verify`.
3. **Low**: on a direct load of /fm/ledger, two full-chain `ledger_verify` calls run at once. Each takes advisory
   lock 4210001, so the drain waits twice. This is solved by finding 1, or skip the band verify on /fm/ledger.
4. **Low**: status-strip.tsx:77 `const fm = !showSafety`. Pass an explicit `role` or `ledgerCell` prop from shell.tsx.
5. **Low**: `triageFocus` (fm-band.ts:39) is dead code. The phone lead already comes from `triage()`
   (split.ts:40) and `orderInbox`. Delete it with its test, or use it in inbox-screen.
6. **Low**: the `inbox.ledgerSealOpen` key is unused (en.json, hi.json). Remove it.
7. **Low**: inbox-detail.tsx:205 gives every open alert the same "#215". This is a guess (head + 1), not a
   reservation. Either word it as "next entry #215" or drop the number. "Recorded in the ledger" also shows for
   suppressed rows without any check.
8. **Low**: inbox-screen.tsx:174 renders an empty bordered `<ul>` when nothing is open; render it only when there
   are chips. The QA captures show no drawing because the selected alert is on EXC-014, and study.md:105's "person
   tag" is missing. Add a 1440 capture with an EXC-007 alert selected and note the missing tag as a deviation.

## Re-review @1335073

**Verdict: APPROVE** (0 High, 0 Med, 4 Low, none blocking)

Checks (this worktree, `pnpm install --frozen-lockfile` exit 0): `typecheck` exit 0, `lint` exit 0, `test` 47 files / 504
tests passed. `src/ledger/witness.test.ts` passed 27/27 in 3 isolated runs. The lane does not touch it: `ledger/witness*`
is not in `git diff origin/main...HEAD`. Its flake is most likely the 12000-row `exportAll` cases (lines 217, 279)
running past the time limit under full-suite load. That is not this lane's doing.

Earlier findings:
- Med 1, fixed. ledger-screen.tsx:151 publishes its verdict. The server verdict and the browser re-check must both
  pass. The band skips /fm/ledger and re-verifies on mount, on each FM route change and on tab focus.
  Demo flow Director tab -> FM tab: beats reach the FM tab's fixture adapter over BroadcastChannel
  (fixture-adapter.ts:47-51) as soon as they are sent. So when the FM tab comes back into view, the re-verify reads
  the current scenario: beat 5 shows "check needed", beat 6 "verified" (the rewrite passes the internal check, as
  on the Ledger page), and beat 7 "verified". Correct.
- Med 2, fixed. `publishVerify` reads `getLiveState().failed`, which `reportFallback` has already set before the
  fallback resolves. A fixture answer in Live mode becomes `unavailable`, and the seal number becomes null. Demo
  mode is unaffected (role null). Tested in fm-band.test.ts.
- Lows 3-8, done. The person tag is still absent (a deviation the implementer stated). The EXC-007 capture shows
  the drawing.

New Lows (optional):
1. Focus flood (status-strip.tsx:47-53). Returning to the tab fires both `visibilitychange` and `focus`, so each
   return makes 2 full-chain `ledger_verify` calls. Each one takes advisory lock 4210001, and nothing guards against
   overlapping calls or limits how often they run. This is human-paced, so it is not a flood, but in Live mode it
   doubles the load on the drain. Fix: keep one listener (visibilitychange), add an in-flight ref, and skip a run
   less than about 10 s after the last one.
2. On /fm/ledger, neither the band nor the page re-verifies on focus. After a beat they both stay stale until
   Verify is pressed. They stay consistent with each other, so this is acceptable. Optionally note it in the demo
   script.
3. ledger-screen.tsx:151 passes `localOk = true` when the browser re-check could not run (`local` is null after an
   export error). The band then trusts the server verdict alone. Consider passing `false`, or storing
   `unavailable`, in that case.
4. The drawing shows the machine's current state. On an acknowledged seatbelt alert the caption reads "Cab: OK",
   which a judge could read as a contradiction. Consider captioning it "Now:", or hiding it when the part is ok.
