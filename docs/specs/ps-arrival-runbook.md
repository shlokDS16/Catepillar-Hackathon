# Problem-statement arrival runbook (T0 = statement received)

Goal: website complete and demo-ready at first review (≈T+24 h). Mobile app starts after review 1.
Gates stay, but they run fast: one validator pass plus one message from Shlok (approve / change).

## First 3 actions (T0 → T+15 min)
1. Save the statement verbatim to `docs/brief/01-problem-statement.md` (a PDF or doc goes through
   the markitdown CLI to disk first). Save Shlok's ChatGPT UI framework to `docs/design/ui-framework.md`.
2. Extract into `docs/brief/02-requirements.md`: deliverables, judging criteria, constraints,
   review times, what "done" means at review 1. List anything ambiguous for Shlok.
3. Map the statement onto `docs/specs/thesis-draft.md`: keep, reshape or replace (the narrowing
   rules are in that file). Get Shlok to confirm D4 (web only until review 1) if it is still
   PROPOSED in decisions.md. Update STATE.md.

## Timeline
| Window | Work | Who | Gate |
|---|---|---|---|
| T+0:15 – 1:15 | P1 research fan-out: 3 scouts on the statement's specifics, run in parallel. Founder-validator and judge-simulator score 3 idea variants | scouts (sonnet), founder-validator, judge-simulator (opus) | — |
| T+1:15 – 1:45 | Idea freeze: `docs/specs/idea.md` (users, 5 features, demo script, KPI, cuts) | orchestrator | **Shlok approves** (G1) |
| T+1:45 – 2:45 | P3: ADR-001 architecture (backend-lead), data model, API contracts in @cat/shared, task list in CHECKLIST (≤1 h tasks), design tokens from the UI framework (ui-ux-lead) | backend-lead, ui-ux-lead | phase-validator + **Shlok approves** (G2) |
| T+2:45 | **Switch session to Fable 5.1** (new session via RESUME.md) | Shlok | — |
| T+3 – 9 | Build slice 1: the demo-critical path end to end (the core AI flow + main screens), using mock data where needed | ui-ux-lead, backend-lead → code-reviewer / backend-reviewer after each task | — |
| T+9 – 10 | Checkpoint: deploy a preview, then judge-simulator plus phase-validator on the running app | validators | **Shlok reviews** (G3) |
| T+10 – 17 | Build slice 2: remaining features, offline (Serwist), polish, error, empty and loading states | same | — |
| T+17 – 20 | P5 quality: tests, defenso scan, accessibility, perf, mobile-width QA, offline test in airplane mode | quality, security reviewers | phase-validator |
| T+20 – 22 | Demo hardening: seed data, cached demo content, backup video, pitch slides from `docs/pitch/review-1-outline.md` | orchestrator, ui-ux-lead | — |
| T+22 – 23 | Full dry run with judge-simulator Q&A | judge-simulator | **Shlok approves** (G4) |
| T+23 – 24 | Buffer. No new features after T+22. | — | — |

Session switches: at T+2:45 (model change) and at any gate if context is above ~60 %.
Rules: never build features in parallel; the demo path works before breadth; every AI output has a
fallback; commit after each reviewed task.
