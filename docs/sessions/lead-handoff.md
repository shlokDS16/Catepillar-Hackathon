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

## Merged and deployed (main 2fefd43; 62 % weekly)
Screens: R3 Decide, R4 Debrief (contract 2.1 event_ms + seatbelt_fastened), F10 Task, F14 + phase-4 Inbox (split view,
mobile triage), F15/F15b + phase-4 Ledger (auto-verify), QA1 fixes, map redesign (mapStateAt, provenance, B frame),
animated lessons (3 SVG diagrams, ink-only hazards), portal B phases 1-4 (chrome, Debrief theatre, learning loop, FM),
landing v1 + v2 (wipe ends in the real B frame). Backend: near-miss privacy 003d-003g, B10 detectors 005-005c,
B10b replay build + server scoring 006/006b/006c (parity with web scoring; random shuffle), B12 alert engine 007-007d
(dry-run SOS escalator job running on the shared DB). sqltest 11/11, web 363 tests, shared+scripts 158.

## In flight
- Wave: phase-5 QA (browser, every screen), F11 Safety, F20 Analytics (check branches lane/l2-qa2, lane/l2-f11, lane/l2-f20).

## Queue (priority order)
0. DONE (map redesign + animated lessons merged). Was: Shlok feedback (2026-11-12, relayed): (a) "Map could be better" (op /op/map and FM /fm/map: design pass in the B ink frame, fix the ~400x320 FM canvas, richer Guardian rings/trail within Site Signage); (b) "visual animated learning": animated lesson cards and illustrations on the Lesson route (motion carve-out, visual-language §5.1; reduced-motion stills; no autoplay audio). Check with the Track F session first that it is not already building either.
3. L1 B10b/B11: replay scoring server-side (must match apps/web/src/replay/fixture-scoring.ts scoreReplay and data-model §2.8; weights chosen there because §2.8 gives none: procedure = 1/2 protocol Kendall pairs + 1/2 investigation, investigation = 1/2 net relevance + 1/2 order agreement with ideal; safety over safety-axis steps; efficiency = ms within time_limit_s; record them in §2.8 as the canonical weights); add additive contract fields reenactment.event_ms and machine_track[].seatbelt_fastened.
4. Portal B phase 4: FM Inbox split view / mobile triage, FM map sizing fix, Ledger auto-verify on open.
5. F11 Safety + A13, F17 Lessons, F20 Analytics (currently a stub), F19 Ask.
6. Phase 5 QA across 360/375/768/1440, en/hi, reduced motion; then a demo video (video-studio skill).

## Gotchas
- Realtime partitions exist through 2026-11-15: run `pnpm exec tsx scripts/b0/realtime-wake.ts` before SQL tests after that.
- New L1 asserts can only pass after `supabase db push`; the rule is "full sqltest green after push, red only on the new asserts before".
- Lane branches touching apps/web/messages/*.json and fixture-adapter.ts conflict often: ask the implementer to merge origin/main and resolve, rather than resolving JSON by hand.
- Merge gate: `bash scripts/lead/gate.sh <lane-branch> "<merge message>"` (merges, runs every check, pushes only if all pass).
