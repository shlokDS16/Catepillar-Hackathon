# STATE (source of truth — update at every task boundary)

- **Updated:** 2026-09-23, session 1 (Opus 5.5)
- **Phase:** P3, backend design. G1 approved with changes (spec v3, decision D6).
- **Problem statement:** docs/brief/01-problem-statement.md, 'Smart Operator Assistant for CAT Machinery'. Inputs: teammate prompt (03, highest emphasis), Shlok directives (04), UI framework (docs/design/ui-framework.md, guidance only). Traceability: docs/brief/02-requirements.md (R1-R31).
- **Rounds:** the presentation round is done. First review is about 24 h after the statement; the target is a complete website. The mobile app (TestFlight and an Android build) comes after review 1.
- **In flight:** backend-lead writing docs/architecture/ (backend-options, ADR-001, data-model, event-pipeline, api-contracts, backend-tasks).
- **Next action:** backend-reviewer red team + program-architect + phase-validator on docs/architecture → G2 approval by Shlok → switch session to Fable 5.1 → build. Reason: directive 3 + rule 1.
- **Open decisions for Shlok:** Hindi TTS provider for pre-generated alert audio (Sarvam free credit vs ElevenLabs free vs Azure F0); non-Groq LLM fallback (Gemini free vs none); the sample dataset file → docs/brief/data/.
- **Pending with Shlok:** G1 decisions; accounts (Supabase, Anthropic, Sarvam, Twilio, Telegram, Voyage); `vercel login` (token invalid); `npx eas-cli login` (mobile phase). gh not needed (git push works).
- **Key insight:** this is a hiring filter, so every line must be defensible. Complement Cat (AI Assistant, VisionLink Coaching, eLearning), never copy it. Offline and voice are NOT differentiators, because the Cat AI Assistant already has both.

## Key files
- Runbook for statement arrival: docs/specs/ps-arrival-runbook.md
- **Spec v3: docs/specs/idea.md** (decisions: docs/brief/05-g1-decisions.md; AI research 15-16) · reviews: docs/gates/G1-*.md · env: .env.example + docs/research/12
- Draft thesis (superseded by spec): docs/specs/thesis-draft.md (founder review: docs/research/08-founder-review.md)
- Master plan: docs/specs/master-plan.md
- Pitch skeleton: docs/pitch/review-1-outline.md
- Research: docs/research/01-08 (05 and 06 carry correction banners)
- Briefing notes: docs/brief/00-briefing-notes.md
- UI framework (pending from Shlok): docs/design/ui-framework.md
- Decisions: docs/project-memory/decisions.md · Gates: docs/gates/
- Agents: .claude/agents/ (ui-ux-lead, backend-lead, backend-reviewer, code-reviewer, founder-validator, phase-validator, judge-simulator)
- Code: apps/web (Next.js 16), apps/mobile (Expo SDK 57), packages/shared (@cat/shared, zod)
