# Lead (L0) handoff, 2026-11-12

Paste this into a fresh Claude Code session (model Opus, never Fable) opened in the main folder
`C:\Users\Shlok\Downloads\Catepillar Hackathon`:

> You are the lead (L0) for Spotter's final build window. Read, in order: STATE.md (top banner),
> docs/sessions/team-plan-2026-11-12.md, docs/sessions/lane-rules.md, docs/project-memory/decisions.md
> D14-D16, docs/design/portal-redesign-study.md §3 (Direction B) and §5. Then check get_usage.
> Rules: no Fable; implementers Sonnet, reviews Opus (code-reviewer / backend-reviewer), mechanical
> checks Haiku; explicit model on every Agent call; at most 5 agents at once; every task gets an
> Opus review before merge; merge only through a gate (typecheck, lint, web tests, build, plus
> shared/scripts tsc + vitest when those change) because every push to main deploys production;
> soft stop 92 % weekly, hard stop 96 %. ABSOLUTE: no Twilio call, SMS, Telegram or SOS trigger.
> Continue from "Queue" below.

## Merged and deployed (main c0e4426; 63 % weekly at handoff)
Everything from the previous list plus: F20 Analytics (honest verdict, demo data labelled), F11 Safety + A13 incident
sheet (near-miss wording true to the backend, harm never sealed, demo failure via /director), L1 003h + 003i (harm is
never sealed at the source), lesson seeds matching the web lessons. sqltest 13/13 (twice), web 404 tests.

## In flight at handoff
- lane/l2-qa2: fixes for docs QA wave 2 (map marker focus ring, Debrief readouts frozen during playback, "Right steps"
  label vs "3 of 3 right", landing stage-3 digits wrap at 375, Hindi gaps, lows). Merge through the gate when pushed.

## Queue (priority order)
1. Merge lane/l2-qa2 (gate). Then a short QA re-run of the routes it touched.
2. F19 Ask Spotter (S6): fixtures first; refusal copy; A18 opens a prefilled A13 (docs/design/frontend-tasks.md:59).
3. Final Opus judge-style review of the whole site (judge-simulator agent) + phase-validator against CHECKLIST P4/P5.
4. Demo video (video-studio / ultrademo skill): landing → operator Home → Replay end to end → Lesson → FM Inbox/Ledger.
   Never trigger SOS while recording.
5. Open, non-blocking: Replay retake policy; transient loop-error retry; native Hindi read of new strings; Tamil
   strings; contract gaps logged in docs/sessions/track-f.md (recurrence RPC, my_snapshot completed assignments).
6. Shlok decides: rotate the secrets that were printed into a local subagent transcript (see timeline 2026-11-12).

## Gotchas
- Realtime partitions exist through 2026-11-15: run `pnpm exec tsx scripts/b0/realtime-wake.ts` before SQL tests after that.
- New L1 asserts can only pass after `supabase db push`; the rule is "full sqltest green after push, red only on the new asserts before".
- Lane branches touching apps/web/messages/*.json and fixture-adapter.ts conflict often: ask the implementer to merge origin/main and resolve, rather than resolving JSON by hand.
- Merge gate: `bash scripts/lead/gate.sh <lane-branch> "<merge message>"` (merges, runs every check, pushes only if all pass).
