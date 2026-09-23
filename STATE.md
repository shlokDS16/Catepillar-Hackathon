# STATE (source of truth — update at every task boundary)

- **Updated:** 2026-09-23, session 1 (Opus 5.5)
- **Phase:** PW, pre-work. Done except PW.6 (Shlok's logins). Next is P1 when the problem statement arrives.
- **Problem statement:** not yet received. When it lands, follow `docs/specs/ps-arrival-runbook.md` exactly.
- **Rounds:** the presentation round is done. First review is about 24 h after the statement; the target is a complete website. The mobile app (TestFlight and an Android build) comes after review 1.
- **In flight:** nothing. Waiting for (a) the problem statement and (b) Shlok's ChatGPT UI framework, into `docs/design/ui-framework.md`.
- **Next action:** runbook step 1: save the statement verbatim to docs/brief/01-problem-statement.md. Reason: every later step keys off it.
- **Pending with Shlok:** `gh auth login`, `vercel login`, `npx eas-cli login`; confirm D4 (web only until review 1).
- **Key insight:** this is a hiring filter, so every line must be defensible. Complement Cat (AI Assistant, VisionLink Coaching, eLearning), never copy it. Offline and voice are NOT differentiators, because the Cat AI Assistant already has both.

## Key files
- Runbook for statement arrival: docs/specs/ps-arrival-runbook.md
- Draft thesis: docs/specs/thesis-draft.md (founder review: docs/research/08-founder-review.md)
- Master plan: docs/specs/master-plan.md
- Pitch skeleton: docs/pitch/review-1-outline.md
- Research: docs/research/01-08 (05 and 06 carry correction banners)
- Briefing notes: docs/brief/00-briefing-notes.md
- UI framework (pending from Shlok): docs/design/ui-framework.md
- Decisions: docs/project-memory/decisions.md · Gates: docs/gates/
- Agents: .claude/agents/ (ui-ux-lead, backend-lead, backend-reviewer, code-reviewer, founder-validator, phase-validator, judge-simulator)
- Code: apps/web (Next.js 16), apps/mobile (Expo SDK 57), packages/shared (@cat/shared, zod)
