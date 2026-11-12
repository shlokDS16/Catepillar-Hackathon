# Lead (L0) handoff, 2026-11-12 (session 2)

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
