# Gate P4 + P5 final validation (phase-validator, Opus, fresh context)

- **Date:** 2026-11-12. **Code:** main at ccfb219 (= 3bf6519 plus a STATE-only docs commit). **Production:** https://spotter-five-brown.vercel.app
- **Scope:** CHECKLIST.md P4 (lines 53-90) and P5 (lines 91-93), checked against docs/specs/idea.md (spec v3) and the winning thesis in docs/specs/master-plan.md:8-15.
- **Method:** read-only. I ran `pnpm --filter web typecheck | test | lint` fresh in the main folder. I walked production in an isolated headless Chromium (playwright-core 1.66, Chromium 1243): the MCP browser is shared with the in-flight QA session, which switched tabs under me, so I stopped using it after two shots. In every context the walk aborted `/api/sos-demo` at the network layer and never clicked an element whose text, label or class contains "SOS". Nothing called, texted or messaged anyone. Raw log: `docs/gates/P4P5-shots/walk-log.json`.
- **Not re-run:** SQL tests, migrations and shared/scripts vitest. For those I quote the STATE.md banner: shared+scripts 158, sqltest 14/14 at 3bf6519.
- **In flight, so not recorded as findings:** F19 Ask Spotter (the Ask sheet on main still reads "Coming in a later task") and the QA re-run of the wave-2 fixes.
- **Where this file is:** it was written in the validator's worktree (`.claude/worktrees/hungry-mclean-7c0f94/docs/gates/`) because a worktree hook blocks writes to the main checkout. Copy it to the main folder's `docs/gates/`. The screenshots were already copied to both places.

## Verdict: **FAIL** for Gate P4 as written ("feature-complete against spec"). P5 is **PASS-WITH-FIXES** on what can be measured.

The fixture demo path works end to end on production, and the code-quality evidence is strong. The gate fails on scope against the spec, and on one honesty item that conflicts with the hiring-filter thesis. Two of the three blockers need a decision or relabelling more than new code.

---

## P4: Build

| # | Exit criterion (CHECKLIST line) | Verdict | Evidence |
|---|---|---|---|
| 1 | H0 setup (l.55) | PASS | Fresh run: web typecheck exit 0, lint exit 0, vitest **35 files / 406 tests passed**. Production serves the current routes (below). |
| 2 | H0 phone smoke test (l.56, `[~]`) | NOT-VERIFIABLE | `/haptics-test.html` returns 200. Only Shlok's Android phone can confirm vibration and sound. |
| 3 | Track B umbrella "B0 → …" (l.58) | FAIL (tick hygiene) | The umbrella box is unticked, and the B-task list has no per-task status. Done: B0, B0b, B1, B2, B4, B5, B9, B10, B10b, B12, privacy 003d-003j. **Not done:** B6/B7 generator, B8 seed, B11 EWMA/Guardian, B13/B14 dispatch adapters, B15 RPCs, B16 ETA fit, B17 eval, B18/B19 RAG + `ask`, B21 demo-check, B22 demo-login, B23 audio, B24 corpus (docs/architecture/backend-tasks.md). |
| 4 | B5 / B0 / B0b / B1 / B2 / B4 / B9 (l.59-63, 77) | PASS (by record) | Each line cites a merge SHA and test counts. sqltest 14/14 is quoted from STATE.md and was not re-run (forbidden). |
| 5 | Track F umbrella "F01 → …" (l.65) | FAIL (tick hygiene + scope) | R3, R4, F10, F11, F14, F15, F17 and F20 are merged (STATE banner) but have no lines of their own in P4. **Not done:** F09 first launch / consent / pairing, **F13 SupabaseAdapter**, F16 live director, **F18 live wiring**, F19 Ask (in flight), F21 Hindi sign-off and Tamil. |
| 6 | F01-F05b, F06-F08, F12, R1, R2, training guide (l.66-76) | PASS | Production 375 px: Home, Task, Safety, Practice and Lesson all have scrollWidth 375 (no horizontal scroll), 0 unlabelled controls, 0 touch targets under 44 px and axe WCAG 2 A/AA clean (walk-log.json). `/dev/kit` returns 404. Shots v02-v05 and v08. |
| 7 | Showable 1 (l.79, `[~]`, "re-validation still due") | PASS (now) | Landing → /op, Hindi (lang=hi, 157 Devanagari characters on /op, only "WBGT" left in Latin script), map, and dry-run SOS (code path; not pressed). Shots v01, v02, v09. |
| 8 | Showable 2 (l.80) | PASS | Replay walked through all 4 phases on production: Brief → Investigate (3 cards opened, "Decide now" enabled) → Decide (2 single-choice steps, 1 order step) → Debrief with scores 100/83/100, "3 of 3 decisions right", the rule, and the re-enactment player. FM Inbox renders, and the ledger auto-verifies "213 verified · 1 sealed". Shots r1, r2, r3, v10. |
| 9 | Showable 3: live data, real Telegram + Twilio (l.81) | FAIL / needs a decision | Calls are banned by D15 (decisions.md:102). The live-data half is not built: `apps/web/src/components/chrome/providers.tsx:13,21` always uses `new FixtureAdapter()`, and grep finds **no** `@supabase`/`createClient` use anywhere in `apps/web/src`. The only network host the app contacted was spotter-five-brown.vercel.app (walk-log `op-console-errors.hosts`). |
| 10 | Final window line (l.82) | PASS (by record) | Matches the STATE banner. |
| 11 | Contracts frozen (l.84) | PASS | Tag contracts-v1.0.0, later 2.0.0 per D16. |
| 12 | Track F switched to live data (l.85) | **FAIL** | Same evidence as row 9. The backend (scenario engine, detectors, scoring, alert engine, ledger) is real and tested, but the UI never reads it. |
| 13 | G3 checkpoint: preview + judge-simulator + phase-validator (l.86) | FAIL (pending) | This report is the phase-validator part. No judge-simulator run is on file (lead-handoff Queue item 3). |
| 14 | graphify update after each milestone (l.87) | PASS (weak) | `graphify-out/.graph_memory_state.json` is dated 2026-11-12 16:36. No per-milestone record exists. |
| 15 | **Gate P4: feature-complete against spec** (l.88) | **FAIL** | Spec P0 items missing from the product: M8 Ask (RAG, role-based, refusal; F19 in flight), M10 first launch + consent + "my data" (no onboarding/my-data screen in `apps/web/src`; F09 not built), M10 Tamil (ta.json has 5 of 946 keys), M0 "one events table … nothing in the UI is faked" (row 12), and M0 director "guarded by a secret" (`/director` returns 200 publicly; it only drives the viewer's own tabs over BroadcastChannel, so the risk is low). |
| 16 | **Gate P4: demo path works end to end** (l.88) | PASS (fixtures) | On production via /director beats: (1) Start task shows "BLOCKED · Needs vest" → Beat 1 "vest detected" → Start → WORKING, ETA 52 min (spec §7 step 1). (2) Beat 2 shows the full-screen WARNING "Seatbelt off while moving", motion lock, "Supervisor alerted in 19 s" (shot d1). (3) Beat 3 raises the Guardian alert; two Acknowledge taps clear it. (4) Beat 4 puts Practice and Lesson on /op/training ("Seatbelt off on a slope, because of 09:40"). (5) Beat 5 makes the ledger read "Chain breaks at #187, entry changed" with Expected/Stored hashes (shot d2). Analytics evidence card: shot v12. |

### Demo-path caveats found in the walk (not failures, but rehearse them)
- After Beat 2 the motion lock and takeover intercept every tap. Practice is reachable only after Beat 3 (on foot) and **two Acknowledge taps**: my first scripted run timed out on the nav for exactly this reason. The demo script must say this.
- Spec §7 step 3 ("his phone rings", Telegram to Anita) and step 5's Telegram root comparison cannot run live under D15. idea.md §7 still describes them, so the demo script on file does not match what can be shown.

## P5: Quality

| # | Exit criterion | Verdict | Evidence |
|---|---|---|---|
| 17 | Tests | PASS | web 406/406 fresh. Quoted from STATE: shared+scripts 158 and sqltest 14/14. |
| 18 | Security: defenso guard_code / scan_repo | NOT-VERIFIABLE (scan) / PASS-WITH-FIXES (manual) | No scan ever ran: defenso guard_code was down (docs/sessions/track-b.md:35). My checks: 19 production JS chunks (1.24 MB) grepped for `sb_secret_`, `service_role`, JWTs, Twilio SID/token, Telegram bot token, `gsk_`, the director secret name: **0 hits**. `/api/sos-demo` is dry-run per STATE. **Missing response headers** on /op: no CSP, X-Frame-Options, X-Content-Type-Options or Referrer-Policy (HSTS is present). **Open:** secrets were printed into a local subagent transcript (timeline.md:85). Shlok has not decided on rotation. |
| 19 | Performance | PASS (desktop network, no throttling) | Landing at 375 px: load 935 ms, LCP 876 ms. Track-x reports a mobile run with 4x CPU and Slow 4G (docs/sessions/track-x.md:2). I did not reproduce it. |
| 20 | Accessibility | PASS-WITH-FIXES | axe WCAG 2 A/AA: 0 violations on /, /op, /op/task, /op/safety, /op/training, replay, lesson, /fm and /fm/ledger. **/fm/analytics: 3 serious color-contrast nodes**: `.bg-val.t-mono` inside `div[data-dim=true]`, #9f9e9a on #fbfaf6 = 2.56:1. |
| 21 | Mobile QA | PASS | 375 px: no horizontal scroll on any route, glove-size targets, SOS in the dock. Hindi has full key parity (946/946). |
| 22 | **Gate P5: validator PASS** | PASS-WITH-FIXES | Fixes 18 and 20 are small. The scan item stays NOT-VERIFIABLE until defenso works or another scanner is run. |

## Thesis check (master-plan.md:8-15)
- **Hiring filter (defensible):** strong on backend depth: hash-chain ledger with SQL↔TS golden vectors, scenario engine measured at 29,782/29,782 frames, and privacy migrations reviewed three times. **At risk:** the analytics evidence card. `apps/web/src/analytics/fixtures.ts:1,25-30` holds hand-typed values (precision 91 %, recall 84 %, ETA MAE 4.7 vs 8.6 min, repeat rate 12 % vs 27 %), but the card's visible caption reads "Evidence · simulated data · synthetic cohort". To a judge that means *measured on a synthetic cohort*. B16 (ETA fit) and B17 (eval) were never run, so none of these numbers was measured. A Caterpillar data-science judge will ask how 91 % was computed.
- **Caterpillar fit:** named users (Ravi the operator, Anita the fleet manager), the KPI set and the VisionLink / Cat Detect complement story are all present. PASS.
- **Proof over promise:** the UI runs on contract-identical fixtures. The FIXTURE chip is honest about this; it is visible in the band on every screen. The proof that the backend is real lives in SQL tests and cron measurements, which the demo never shows on screen.

## Persistence check
STATE.md's top banner plus docs/sessions/lead-handoff.md give a fresh session a clear next step. **Ambiguities:**
1. STATE.md lines 72-90 still carry 2026-09-23 "In flight" and "Next action" text that contradicts the banner.
2. decisions.md has two D14s, two D15s and two D16s (lines 79/95, 84/102, 89/105). "D15" is ambiguous: it means both "ledger export vs pseudonymity (PROPOSED)" and "No calls".
3. The CHECKLIST P4 umbrella boxes are not maintained (rows 3 and 5).

---

## Fixes, smallest first, for each FAIL

| Row | Smallest fix |
|---|---|
| 3, 5 | Tick per-task lines in CHECKLIST P4 for R3, R4, F10, F11, F14, F15, F17, F20, B10, B10b, B12, and list the open IDs explicitly as "descoped" or "open" (10 min). |
| 9, 12 | Either **(a)** Shlok records a decision: "final demo runs on fixtures; live wiring (F13/F18) is roadmap; Showable 3 descoped by D15 + time", and ticks the box as descoped; or **(b)** builds F13 for one read path: `my_snapshot` + events on Realtime into the existing DataPort (about 1 h per the task table, but it touches every screen's assumptions). (a) is the realistic choice tonight. |
| 13 | Run the judge-simulator (Opus) on the production URL, saving to docs/gates/ (Queue item 3). |
| 15 | Record a spec-scope decision that moves M8 (if F19 misses), F09/consent and Tamil to the roadmap; or hide the Ask button until F19 merges, so no "Coming in a later task" appears in the demo. Add a one-line guard to /director (env flag) or accept it in decisions.md. |
| Thesis | Change the evidence-card caption to "Illustrative values, not yet measured: how we will measure (B17 eval)", in en and hi (`apps/web/messages/*.json` analytics keys), or run B17/B16 and load real numbers. |
| 18 | Add `headers()` in `apps/web/next.config.*` setting `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a report-only CSP. Shlok rotates the leaked keys. |
| 20 | Raise the dimmed `.bg-val` colour to at least 4.5:1, or drop the dim on the value text only. |

## Ranked list for the hackathon final demo

**Blockers (fix or decide before recording or presenting):**
1. **Evidence-card numbers presented as measured** (fixtures.ts:25-30 vs the "synthetic cohort" caption). This is a direct hit on the defensibility thesis. Relabel (15 min) or measure.
2. **"Live" story vs a fixture-only UI** (providers.tsx:13). The deck and narration must not claim "nothing in the UI is faked / one events table drives every screen" unless F13 lands. A decision plus wording, not code.
3. **Ask button says "Coming in a later task"** if F19 is not merged before recording (in flight). Merge F19 or hide the button for the demo.
4. **The demo script is out of date.** idea.md §7 still has the phone ring and Telegram steps (banned by D15) and omits the Beat 3 + two Acknowledge taps needed to leave the motion lock. Write the beat-by-beat script that matches the walk above.

**Nice-to-haves (after the blockers):**
5. Rotate the secrets printed into the subagent transcript (a security must-do, but not a demo blocker).
6. Security headers in next.config.
7. /fm/analytics contrast (3 nodes).
8. Ledger red state: the static caption "The database agrees with itself" sits directly above "Chain breaks at #187" and reads as a contradiction. The "Expected"/"Stored" micro-labels are near-invisible dark red on red (shot d2).
9. /director is public. Guard it, or record it as an accepted demo affordance.
10. Tamil has 5 of 946 strings. Either add a screen's worth or drop the "Tamil proves the script switch" claim.
11. Housekeeping: CHECKLIST ticks, stale STATE body lines, renumbering of the duplicate decision IDs.
12. Phone haptics check on the Android device (H0 `[~]`).

## Evidence files
Screenshots in `docs/gates/P4P5-shots/` (copied to both the main folder and this worktree): v01-landing-375, v02-op-home-375, v03-op-task-375, v04-op-safety-375, v05-op-training-375, r1-investigate-open, r2-decide, r3-debrief, v08-lesson-375, v09-op-home-hi-375, v10-fm-inbox-1440, v12-fm-analytics-1440, d1-beat2-seatbelt-375, d2-ledger-tamper-1440, plus walk-log.json (per-route axe, overflow, target and header results). Walk scripts (validator scratchpad): walk.cjs, replay.cjs, demo.cjs, loop.cjs, ppe.cjs, bundle.cjs, an.cjs.
