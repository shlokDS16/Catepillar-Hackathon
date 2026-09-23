# STATE (source of truth — update at every task boundary)

- **Updated:** 2026-09-23, session 1 (Opus 5.5)
- **Phase:** P1, problem understanding. Statement received 2026-09-23 (T0).
- **Problem statement:** docs/brief/01-problem-statement.md, 'Smart Operator Assistant for CAT Machinery'. Inputs: teammate prompt (03, highest emphasis), Shlok directives (04), UI framework (docs/design/ui-framework.md, guidance only). Traceability: docs/brief/02-requirements.md (R1-R31).
- **Rounds:** the presentation round is done. First review is about 24 h after the statement; the target is a complete website. The mobile app (TestFlight and an Android build) comes after review 1.
- **In flight:** gate G1: spec v2 (docs/specs/idea.md, product 'Spotter') presented to Shlok with 5 decisions (UI direction, Ask Spotter P0?, organiser dataset files?, Twilio upgrade?, team split).
- **Next action:** on G1 approval → Shlok creates Supabase (Mumbai) + accounts per .env.example → backend-lead backend brainstorm (options → red team → ADR-001 → schema → contracts) → backend-reviewer + program-architect + phase-validator → G2. Reason: directive 3 (backend only after feature approval).
- **Pending with Shlok:** G1 decisions; accounts (Supabase, Anthropic, Sarvam, Twilio, Telegram, Voyage); `vercel login` (token invalid); `npx eas-cli login` (mobile phase). gh not needed (git push works).
- **Key insight:** this is a hiring filter, so every line must be defensible. Complement Cat (AI Assistant, VisionLink Coaching, eLearning), never copy it. Offline and voice are NOT differentiators, because the Cat AI Assistant already has both.

## Key files
- Runbook for statement arrival: docs/specs/ps-arrival-runbook.md
- **Spec v2: docs/specs/idea.md** · reviews: docs/gates/G1-*.md · env: .env.example + docs/research/12
- Draft thesis (superseded by spec): docs/specs/thesis-draft.md (founder review: docs/research/08-founder-review.md)
- Master plan: docs/specs/master-plan.md
- Pitch skeleton: docs/pitch/review-1-outline.md
- Research: docs/research/01-08 (05 and 06 carry correction banners)
- Briefing notes: docs/brief/00-briefing-notes.md
- UI framework (pending from Shlok): docs/design/ui-framework.md
- Decisions: docs/project-memory/decisions.md · Gates: docs/gates/
- Agents: .claude/agents/ (ui-ux-lead, backend-lead, backend-reviewer, code-reviewer, founder-validator, phase-validator, judge-simulator)
- Code: apps/web (Next.js 16), apps/mobile (Expo SDK 57), packages/shared (@cat/shared, zod)
