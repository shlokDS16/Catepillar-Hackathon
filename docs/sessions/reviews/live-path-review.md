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
