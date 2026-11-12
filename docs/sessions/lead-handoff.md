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

## Merged and deployed (main)
R3 Decide, R4 Debrief (stateAt re-enactment), F10 Task, F14 Inbox, F15 + F15b Ledger (verified_with_sealed,
np= witness, full-range browser re-check), L1 near-miss privacy 003d-003g (contracts 2.0.0), L3 landing v1,
portal redesign study (docs). Decisions D14 (portal direction B), D15 (no calls), D16 (privacy).

## In flight when this was written (branches; check each for a newer head)
- lane/l2-qa1: browser-QA fixes; review asked for spec scoring per data-model §2.8 and a lazy-loaded answer key.
- lane/l1-b10: rule detectors, migration 005 APPLIED to the DB; Opus backend review running.
- lane/l2-portal-chrome: portal B phase 1 (ink band, 4-slot dock + SOS slot, FM rail).
- lane/l3-landing-v2: owned by the "Spotter frontend Track F" session (Shlok asked it directly); lead merges.

## Queue (priority order)
1. Portal B phase 2: Debrief on the ink theatre + plain words + [Listen] per section; no per-step feedback in Decide (D14).
2. Portal B phase 3: learning loop (Home loop card, Training assignment list, Lesson route) so a replay is reachable from the UI.
3. L1 B10b/B11: replay scoring server-side (must match apps/web/src/replay/fixture-scoring.ts scoreReplay and data-model §2.8; weights chosen there because §2.8 gives none: procedure = 1/2 protocol Kendall pairs + 1/2 investigation, investigation = 1/2 net relevance + 1/2 order agreement with ideal; safety over safety-axis steps; efficiency = ms within time_limit_s; record them in §2.8 as the canonical weights); add additive contract fields reenactment.event_ms and machine_track[].seatbelt_fastened.
4. Portal B phase 4: FM Inbox split view / mobile triage, FM map sizing fix, Ledger auto-verify on open.
5. F11 Safety + A13, F17 Lessons, F20 Analytics (currently a stub), F19 Ask.
6. Phase 5 QA across 360/375/768/1440, en/hi, reduced motion; then a demo video (video-studio skill).

## Gotchas
- Realtime partitions exist through 2026-11-15: run `pnpm exec tsx scripts/b0/realtime-wake.ts` before SQL tests after that.
- New L1 asserts can only pass after `supabase db push`; the rule is "full sqltest green after push, red only on the new asserts before".
- Lane branches touching apps/web/messages/*.json and fixture-adapter.ts conflict often: ask the implementer to merge origin/main and resolve, rather than resolving JSON by hand.
- Merge gate: `bash scripts/lead/gate.sh <lane-branch> "<merge message>"` (merges, runs every check, pushes only if all pass).
