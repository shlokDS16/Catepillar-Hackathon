# Review: lane/l1-live-path @ b1f56b5 (D18 thin live path)

Reviewer: backend-reviewer (Opus), 2026-11-12. Scope: `git diff origin/main...origin/lane/l1-live-path` (16 files),
covering both the seed and smoke scripts and the web LiveAdapter. I did not run the seed or the smoke script.

## What I ran
- `pnpm exec tsx scripts/sqltest.ts` (main checkout. `supabase/tests` and `scripts/sqltest.ts` are byte-identical to the lane. Every file runs in a rolled-back transaction): **11/14 passed**. FAIL 002_core_rls "FM sees all profiles", FAIL 005_ledger "one incident.logged per entry", FAIL 010_replay "nothing is built inside the inserting transaction (N2)". The last recorded run, track-b 003j, was 14/14. This lane changed no SQL, so the cause is new rows in the shared DB.
- Lane tree exported to the scratchpad with node_modules junctions: `vitest run src/data` (web) 37/37; web `tsc --noEmit` 0 errors; `vitest run scripts/seed-demo-users.test.ts` 3/3; scripts `tsc --noEmit` 0 errors.
- I grepped the diff for secrets (`sb_secret`, `service_role`, JWTs, `postgres://`, `PASSWORD=`, `sbp_`). The only hit is a test fixture (`pw`).
- defenso `guard_code` could not run because the tool returned an HTTP method error. Supabase MCP `execute_sql` was refused (no permission), so I counted rows indirectly through the sqltests.

## Confirmed OK
- No secret is committed. `live-config.ts` holds only the URL and the `sb_publishable_` key, which the D18 amendment allows. The seed and smoke scripts never print a credential: the seed log line names no values, and the smoke script prints only error notes trimmed to 60 or 120 characters.
- No real dispatch. `private.alert_dispatch_status()` is hard-coded to `dry_run` (007_alert_engine.sql:39), and the seed never calls `sos_raise`. In the web app, SOS uses the separate fixture `SosPort` (sos/port.ts:72), so live mode never changes the emergency number.
- LiveAdapter checks every live response against its zod schema. Network errors, RPC errors and schema mismatches all fall back to fixtures. The SOS and incident paths are delegated to fixtures, and the tests prove that no RPC is made.
- Tests mock the RPC caller, and `supabase-js` is never imported in tests.
- No SSR access to `window`: `restoreLive` runs only from effects, and `useSyncExternalStore` returns DEMO as its server snapshot.
- No token appears in the URL (`detectSessionInUrl: false`). Nothing is stored beyond supabase-js's own `sb-*-auth-token`.
- `/director/live` is linked only from the hidden `/director` page and from no judge-facing nav. Sign-in failures show a generic message, so the page does not reveal whether an email exists.
- The locale `ta` falls back to English for `chrome.source` (i18n/request.ts withFallback).
- The paused-run deviation causes no crash: `run`, `machine` and `operator_state` are nullable in `MySnapshotOut` and are handled in home-screen.tsx.

## Findings

1. **High: the seed broke 3 shared sqltests.** scripts/seed-demo-users.ts:28-96 (reference rows, the breach event, the replay) and :128-133 (profiles).
   - **Cause:** the rows persist in the one shared project. Three tests count rows across the whole table:
     - 002_core_rls.sql:116 expects the fleet manager to see 3 profiles. `profiles_read` lets staff read every profile, so the 2 seeded profiles make it 5.
     - 005_ledger.sql:137 expects exactly 3 `incident.logged` events.
     - 010_replay.sql:107 expects `replay_scenarios` to hold 0 rows.
   - **Process gap:** the track-b row says "no SQL changed so no sqltest", but the seed changed the data.
   - **Evidence:** the sqltest run above, 11/14.
   - **Fix:** scope those three assertions to the test's own ids (site, run, operator), then re-run sqltest to 14/14. Make sqltest a required check after any seed run.
2. **Medium: "Live data" is shown over a fixture stream.** live-adapter.ts:62 hands `subscribe` to the fixtures, so the fixture 1 Hz clock (`status: "playing"`, speed 10), director beats over BroadcastChannel and fixture events all flow into the live store.
   - **Effect:** the status band reads "Live data · Simulated shift · HH:MM · 10× speed" (status-strip.tsx:52) while the live run is null or paused. `lastFrameMs` is fed by the fixture ticker, so live data can never be flagged as stale.
   - **Fix:** in live mode, make `subscribe` emit nothing, or connectivity only. Drop the fixture clock text when `source === "live"`.
3. **Medium: a successful call clears the fallback notice for every screen.** live-adapter.ts:37 calls `reportLive`, and live-session.ts:39 then sets `source: "live"` for the whole app.
   - **Repro:** `my_snapshot` fails, so the fixture snapshot is rendered. Then `replay_get` succeeds. The band now says "Live data" while Home still shows demo data, which breaks the rule that every fallback carries the en+hi notice.
   - **Fix:** keep the fallback state per call, or keep it on until `my_snapshot` itself succeeds.
4. **Low: a paused, non-current run gives a thin live Home.** `my_snapshot` uses only the run with `is_current` (003g:39, 49-52). It therefore returns run, machine, paired_machine_id and operator_state as null, with no tasks or alerts. Only the Loop card has live content.
   - **Fix:** say so on the switch page, or have the snapshot fall back to the operator's latest pairing.
5. **Low: live and fixture writes can disagree.**
   - `lessonComplete` goes to the fixtures (live-adapter.ts:78), so a live assignment is never completed on the server and comes back after a reload.
   - If `replay_submit` commits on the server but its response fails the schema check (live-adapter.ts:50), the user sees fixture scores that differ from the stored attempt.
   - **Fix:** document both as limits of the thin path, or show the notice on those screens.
6. **Low: sign-out logs the shared demo account out everywhere.** live-session.ts:90 calls `signOut()` with the default scope `global`, which revokes the demo account's sessions on every device. A phone and a laptop sharing the account in a demo would both be logged out.
   - **Fix:** `signOut({ scope: "local" })`.
7. **Low: `--also-env` can write passwords to a tracked file.** seed-demo-users.ts:139-145 writes plaintext demo passwords to any path and logs "git-ignored" without checking. `.gitignore` covers only `.env` and `.env*.local`, so a path such as `apps/web/.env.production` would be committable.
   - **Fix:** refuse any target that fails `git check-ignore`.
8. **Low: the seed can overwrite a real account, and sign-up may be open.**
   - `ensureUser` (seed-demo-users.ts:103) resets the password, and the profile upsert resets the role, for whatever email `.env` holds. If someone points `.env` at a real account, that account is overwritten.
   - The header says "Sign-up stays closed", but supabase/config.toml:176 and :221 set `enable_signup = true`, and the publishable key now ships in the bundle. I could not check the hosted setting.
   - **Fix:** allow only `@spotter-demo.test` emails, and confirm that sign-up is disabled on the hosted project.
9. **Low: the seed reports success even when no replay was built.** seed-demo-users.ts:89-93 loops `step_loop` 5 times and still prints "ready" with no replay. `step_loop` also drains the global `loop_queue`, which is the same work the 1 s worker cron does.
   - **Fix:** throw if the replay count is still 0.
10. **Low: a rate limit reads as a wrong password.** live-session.ts:74 maps a 429 to "Email or password not accepted".
    - **Fix:** map 429 to its own "try again shortly" message.

**Counts:** High 1, Medium 2, Low 7.

**CHANGES REQUIRED**

## Re-review @ ab4074b

Scope: `git diff b1f56b5 origin/lane/l1-live-path`, which covers the fix commit c0faaed, the merge of an earlier main (1e92963) and a docs commit. Current main is d02084e, and this lane does **not** yet contain it.

### What I ran
- The lane's own `supabase/tests` through its `scripts/sqltest.ts`, run once. I used a lane export in the scratchpad, with env loaded by a wrapper and no values printed. Every file rolls back. Result: **14/14 passed**.
- Lane export: web `vitest run src/data` 41/41, web `tsc` 0 errors, `scripts/seed-demo-users.test.ts` 4/4.
- `git merge-tree --write-tree origin/main origin/lane/l1-live-path`: **3 conflicts**, in `status-strip.tsx`, `messages/en.json` and `messages/hi.json`.

### Earlier findings, checked one by one
| # | Status | Evidence |
|---|---|---|
| 1 High (sqltests) | Fixed | 14/14. The rescoped checks still test real behaviour. 002: the fleet-manager "sees all" checks still have to find 3 profiles, 2 tasks and so on, which include other operators' rows on the same site. 005: the chain-shape block (005:144-156) still walks the **whole** `incidents` table, checking genesis zeros, every link and every hash. The export, verify and role checks use a `seqbase` offset with a positive count of 3, and `ledger.verified` is limited to this transaction's `now()`. 010: the counts are scoped to the test operators and still assert 0, then 1, then 1. |
| 2 Med (fixture stream) | Fixed | live-adapter.ts:67-70 forwards only `clock` and `connectivity`, with a test at live-adapter.test.ts:84-94. In live mode the band shows "Live data · run paused/none" and never the fixture clock. |
| 3 Med (fallback cleared) | Fixed | Fallbacks are now tracked per call in the `failed` list (live-session.ts:37-48), with 3 tests in live-session.test.ts. |
| 4, 5 Low | Documented | Both are listed on `/director/live` (live-panel.tsx:58-63). |
| 6 Low (global sign-out) | Fixed | Both sign-outs now use `scope: "local"`. |
| 7 Low (`--also-env`) | Fixed | `git check-ignore` runs for every target **before** any DB or auth write. A tracked or unknown path is refused, and so is a missing directory, because the spawn returns a null status. |
| 8 Low (real account, sign-up) | Partly fixed | `isDemoEmail` checks both emails before any write. Hosted `enable_signup` is still unverified: the header now says to confirm it in the dashboard, and `config.toml` still sets it to `true`. |
| 9 Low (silent seed) | Fixed | The seed throws if no replay was built. |
| 10 Low (429 message) | Fixed | A 429 now maps to its own `rate` message. |

### New findings
1. **Medium: the lane conflicts with main d02084e, and the obvious resolution doubles the label.**
   - **Cause:** main moved the band caption into `apps/web/src/chrome/data-label.ts`, whose comment says a live variant should switch only there, and changed `chrome.fixtureStatus` to "Demo data · {time} · {speed}× speed". The lane's demo branch (status-strip.tsx:59) prefixes `chrome.source.demo` to that caption.
   - **Effect:** if the conflict is resolved by keeping both, the band reads "Demo data · Demo data · 14:02 · 10× speed".
   - **Fix:** merge main into the lane and move the `source` switch into `dataLabel()`, with fallback, live plus run state, and demo meaning main's text unchanged. Keep main's `syncText` cell, merge the `chrome.source` keys into both catalogues, then re-run the web tests.
2. **Low: one isolation check was weakened without need.**
   - **What changed:** 002_core_rls.sql:80, "OP sees own overrides", is now limited to the test site's operators. It passed unfiltered at b1f56b5, because the earlier failure was at line 116, and the seed writes no `ppe_overrides`.
   - **Effect:** an RLS leak of another site's override to an operator would no longer be caught.
   - **Fix:** restore the unfiltered count on that one line.
3. **Low, carried over from finding 8: hosted sign-up is still unverified.** The publishable key is in the bundle, so confirm in the dashboard that email sign-up is off.

Note: live mode still lets the fixture clock tick reach `store.clock` and `lastFrameMs` as a heartbeat (live-adapter.ts:62-66 comment). As a result the band can never show NO SIGNAL for live data. The band no longer displays the fixture clock, so I accept this as a stated limit.

**Counts:** Medium 1, Low 2.

**CHANGES REQUIRED**: merge main and fold the source label into `dataLabel()`. Every earlier finding is fixed or documented, so the merge is the only blocker.

## Merge check @ 36ac9c4

The lane now contains main a720218. Main is still at a720218, and `git merge-tree --write-tree origin/main origin/lane/l1-live-path` reports no conflicts.

| Check | Result |
|---|---|
| Live/demo switch inside `dataLabel()` | `chrome/data-label.ts` now takes `source` and `runStatus`. "fallback" shows the notice. "live" shows `chrome.source.live · run.<status or none>`. Demo leaves main's text unchanged, so there is no doubled "Demo data". `data-label.test.ts` adds a case for live and fallback. |
| `status-strip.tsx` | Calls `dataLabel` and keeps main's `strip-cells` and offline `syncText` cell. The `liveParts` tooltip shows only when live. |
| en/hi parity | Both catalogues have the same keys (key-set diff empty both ways), including all 8 `chrome.source` keys. |
| `director-panel.tsx` | The only change against main is the added Live link. Lane A's 8 beats (1, 2, 2b, 3, 4, 5, ledger tamper with re-hash, ledger reset) and the Reset section are intact. |
| 002 restored checks | Line 80 (`ppe_overrides` = 1, "OP sees own overrides") and line 153 (`shifts` = 2, "TR sees shifts") are back to their original form, with no filter. |
| Tests | Lane export: web `vitest run src/chrome src/data src/components/chrome` 73/73, web `tsc` 0 errors. I did not re-run sqltest. Line 80 passed unfiltered on the seeded DB earlier. Line 153 sits after the old failure point at line 116, so it was never exercised against the seed. The seed writes no shifts, so it should pass, but the implementer should confirm 002 on the next sqltest run. |

Carried over from the re-review, not blocking: confirm in the dashboard that hosted email sign-up is off.

**APPROVE**
