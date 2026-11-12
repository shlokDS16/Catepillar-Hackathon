# Lead (L0) handoff, 2026-11-12 (session 3; session 2 notes kept below)

Paste this into a fresh Claude Code session (model Opus, never Fable) opened in the main folder
`C:\Users\Shlok\Downloads\Catepillar Hackathon`:

> You are the lead (L0) for Spotter's final build window. Shlok is unavailable (final exam): build autonomously,
> ask him nothing new. Read, in order: STATE.md (top banner), docs/sessions/lead-handoff.md (this file: Queue),
> docs/sessions/lane-rules.md, docs/project-memory/decisions.md D14-D18, docs/design/interior-revamp/study.md
> (c) Direction 1 "Machine Bay", (d), (e). Then call get_usage.
> Rules: no Fable; implementers Sonnet in their own worktrees (isolation worktree, branches lane/l1-*, l2-*, l3-*);
> every task gets an Opus review (code-reviewer / backend-reviewer) before merge; mechanical checks Haiku; explicit
> `model` on every Agent call; at most 5 agents at once; merge only via `bash scripts/lead/gate.sh <branch> "<msg>"`
> (every push to main deploys production); stop spawning at 92 % weekly, hard stop 96 %. ABSOLUTE: no Twilio call,
> SMS, Telegram or SOS trigger, never /api/sos-demo (D15). Hand off again at ~250k tokens of context.
> Note: subagents in worktrees cannot write to the main folder (write guard); ask them to write reports in their own
> worktree and give the absolute path.

## Session 4 (lead L0, 68 % -> 70 % weekly): status at handoff (main 8522211, nothing in flight)
- MERGED (each with an Opus review APPROVE after one fix round; reviews in docs/sessions/reviews/):
  ccfbd3b lane/l3-wait-fleet (T6 While-you-wait card, pure `showWhileYouWait`; T8 fleet strip, 6 cells, LDR-001 and
  DMP-005 invented and captioned, phone strip below the triage lead), 590b442 lane/l2-fm-detail (T7 inbox detail with
  dry-run dispatch timeline and "next entry #n" seal line; T9 band ledger cell fed by a shared last-verify store, one
  visibilitychange verify with in-flight guard and 5 s throttle; Live fixture fallback shows "unavailable"),
  8522211 lane/l2-bay-home (T5 Bay layout; Lows: tag overlap, per-kind tape pictograms, operator-only inert incl. the
  strip via InertRegion; SOS never inert, live-checked under Beat 2/3/5 at 375 and 1440).
- Production: main pushes 6668dd1..f47f124 produced no Vercel deployment (lane previews did); the next push e23dcfa
  deployed and later ones too. An agent-triggered production deploy is refused by auto mode: never retry it.
- Lead session 2 (local_320a868c) owns the landing revamp: apps/web/src/components/landing/**, styles/landing.css,
  public/landing/**, `landing.*` keys (lanes lane/l2-landing-v3-*). Phase 4 may only IMPORT landing/scene/excavator.ts
  and parts.ts; they were asked to keep those exports stable.
- Open Lows (non-blocking): FM strip goes inert during the operator's motion lock with no overlay (status-strip.tsx
  ~45, pre-existing, owner: whoever next touches the strip); phone parts rows < 80 px (machine-parts.tsx); no
  render-level inert test (vitest is node-only); fleet focus hand-off untested; phone FM queue ~590 px down; fleet
  caption hard-codes machine codes; reducer `pausedSince` for the wait card (now measured from first sight, ~18 s late
  after reload at 10x); no person tag on the FM stage; Drawing/3D segmented control not rendered yet (phase 4);
  Listen hidden until audio clips exist; web test ledger/witness.test.ts flakes under full-suite load (12000-row export
  timeouts; passes in isolation).

## Queue after session 4 (priority order)
1. D17 phase 4: T10 paper-model 3D stage on desktop Home + T11 perf/a11y gate (study.md (e) phase 4; D17 rules: no
   WebGL on phones, reduced motion, Save-Data, or while moving; render on demand; no auto-rotate; parts list is the
   text twin). Add the Drawing/3D segmented control to the Bay stage then. One L3 lane; Opus review.
2. Fix the FM-strip-inert-during-motion-lock Low (one small L2 lane, can run beside 1).
3. Phase 5 QA (study.md (e)): en/hi parity, 360/375/768/1440 shots, --bay contrast, axe, reduced motion, no FIXTURE,
   no brand marks; then judge-simulator re-score (Opus) and a Haiku production pass.
4. Demo video (video-studio skill), never SOS.
5. Session 3/2 open items below.

## Session 3 (lead L0, 66 % -> ~68 % weekly): status at handoff
- Judge-content (17aac73) and F19 (6668dd1) were already merged; their review files are now in docs/sessions/reviews/.
- MERGED: lane/l3-bay-machine (D17 T2+T3) at 0389806: optional `machine.parts`, machine drawing, parts list. Review: reviews/bay-machine-review.md (APPROVE; open Low: Engine and Rear-sensor tags overlap ~29x24 px at 1440, move one tag's `ty`).
- See "Merged in session 3" and "In flight at handoff" below.
- D18 design changed (decisions.md D18 amendment): seeded demo users, passwords only in the main folder .env
  (DEMO_OPERATOR_*/DEMO_FM_*), sign-in page /director/live; judges see fixtures. The shared DB now holds the seeded
  DEMO-LIVE site (scripts/seed-demo-users.ts). sqltests must scope to their own rows (live-path review High).
- Gate gotcha: implementers' Playwright sometimes writes screenshots into the MAIN folder's docs/design/qa/, which
  blocks the merge ("untracked files would be overwritten"). Move them to a scratch folder first, then rerun the gate.

## Merged in session 3 (all with an Opus review APPROVE; files in docs/sessions/reviews/)
- 0389806 lane/l3-bay-machine (D17 T2+T3). d02084e lane/l2-bay-band-tape (D17 T1+T4: band "Demo data · hh:mm · 10×
  speed", Sync cell only when offline, shift tape). a720218 lane/l2-lane-a (judge #2/#3/#4/#5/#9, idea.md §7, ETA
  provenance, takeover clear of SOS, Lesson buttons; browser-checked at 360/768/1024/1440 by the reviewer).
- Open Lows: bay tags Engine/Rear-sensor overlap ~29x24 px at 1440; every shift-tape mark uses the seatbelt
  pictogram; ppe.restored not scoped per operator; IDS.anomaly stands in for EXC-014's id; nav/shell not `inert`
  under a Beat 3 Warning (keyboard can Tab beneath).

## D18 live path: MERGED 4205ddd (backend-reviewer APPROVE @36ac9c4, sqltest 14/14 by the lane)
- Sign in at /director/live with DEMO_OPERATOR_* or DEMO_FM_* from the main folder .env. Nothing is in flight.

## Queue after session 3 (priority order)
1. A quick browser pass on production of /op, /op/training, /director.
2. D17 phase 2: T5 Bay layout (home-screen.tsx + new styles/home.css; MachineBay, LoopCard, ShiftTape are now
   separate mounts on Home to arrange) and T6 While-you-wait (loop-card variant). Phase 3: T7 inbox detail, T8 fleet
   strip, T9 band ledger cell + triage. Specs: study.md (e). Up to 3 lanes on disjoint files.
3. D17 phase 4 (3D desktop stage, T10-T11), phase 5 QA, judge-simulator re-score.
4. Demo video (video-studio skill), never SOS.
5. Open items from session 2's list below.

## Done in session 2 (63 % -> ~66 % weekly)
- QA3 re-run of the wave-2 fixes: 12/12 PASS (docs/design/qa/QA3-report.md).
- Judge-simulator: 6.75/10 avg (docs/gates/final-judge-review.md). Phase-validator: P4 FAIL, P5 PASS-WITH-FIXES
  (docs/gates/P4P5-final-validation.md): 4 blockers = typed analytics numbers (fixed on lane/l2-judge-content),
  fixtures-only UI (D18 thin live path), F19 (lane/l2-f19-ask), stale demo script in docs/specs/idea.md §7.
- Interior revamp study (docs/design/interior-revamp/, reference screenshots in ref/); Shlok chose D17.

## In flight / ready at handoff (check `git log origin/<branch>`)
- lane/l2-f19-ask @2af4fce: F19 Ask + review fixes; Opus re-review was running (docs/sessions/reviews/F19-review.md).
  If APPROVE and not yet merged: gate-merge it.
- lane/l2-judge-content @df893bb: judge items #1,#6,#7(honest),#8,#10a + polish; Opus review was running
  (JC-review.md in the reviewer's worktree). `next build` was unverified offline: the gate runs it.

## Queue (priority order)
1. Merge F19 and judge-content when approved (F19 first; judge-content then merges main and resolves messages/*.json).
2. Lane A (after 1): judge items #2 (no "Ledger changed" alert until Beat 5; "Telegram: sent (simulated)"),
   #3 (seed the 09:40 replay assignment so /op/training is not empty on a cold visit), #4 (baseline vest on or a
   PPE caution that blocks Start; "Moving" from the motion state), #5 (persist FixtureAdapter state to sessionStorage;
   a Director beat that clears the Beat 2 takeover), #9 (ledger display names, simulated tag, varied seed); plus the
   stale demo script docs/specs/idea.md §7 (no call/Telegram steps; add the two Acknowledge taps after Beat 3).
3. D18 thin live path: a SupabaseAdapter (or LiveAdapter) behind a Live switch for my_snapshot, replay_get,
   replay_submit, ledger_verify; fixtures stay default; askViaFunctions (F19) maps failures to provider_down.
   Backend-reviewer + code-reviewer. Never DRY_RUN=false.
4. D17 Machine Bay revamp, study.md (e) phases 1-5 (foundations; operator Home with the 2D bay drawing, part tags,
   shift tape, Now/While-you-wait/Practice rail; FM fleet strip + queue|focus; phase 4 desktop-only 3D reusing
   apps/web/src/components/landing/scene/excavator.ts; QA). SIM part states additive in packages/shared.
   Up to 3 lanes in parallel on disjoint files; Opus review per phase; judge-simulator re-score at the end.
5. Demo video (video-studio skill): landing -> operator Home -> Replay end to end -> Lesson -> FM Inbox/Ledger.
   Never SOS. Only after 4 (or after 2-3 if budget is short).
6. Open, non-blocking: Replay retake policy; transient loop-error retry; native Hindi read; Tamil; contract gaps in
   docs/sessions/track-f.md; Shlok decides on rotating the secrets printed into a subagent transcript (timeline).

## Gotchas
- Realtime partitions exist through 2026-11-15: run `pnpm exec tsx scripts/b0/realtime-wake.ts` before SQL tests after that.
- New L1 asserts pass only after `supabase db push`.
- Lane branches touching apps/web/messages/*.json and fixture-adapter.ts conflict often: have the implementer merge origin/main.
- Offline `next build` fails on Google Fonts (Turbopack); the gate's build is the real check.
- The reference site's sign-in must not be bypassed by agents (classifier denied passing its session flags); use ref/ screenshots.
