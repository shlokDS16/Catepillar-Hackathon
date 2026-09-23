# Resume prompts

## A. Orchestrator + INTEGRATOR session: model Opus, main folder, stays open during the build
Open Claude Code in `C:\Users\Shlok\Downloads\Catepillar Hackathon` and paste:
```
Resume the Caterpillar Hackathon project (product: Spotter) exactly where we left off.
1. Read CLAUDE.md, then STATE.md, then CHECKLIST.md, then the last 3 entries of
   docs/project-memory/timeline.md, docs/project-memory/decisions.md (D1-D10) and
   docs/project-memory/unanswered-questions.md. Read nothing else yet.
2. If graphify-out/ exists, use it for any codebase question before grepping.
3. You are the INTEGRATOR (docs/sessions/build-protocol.md): watch docs/sessions/track-b.md,
   track-f.md and handoff.md; merge track branches into main in the protocol's order; deploy the
   Showable milestones; tick CHECKLIST.md; update STATE.md; run gates (G3 checkpoint). Never write
   feature code.
4. Reply with: current phase, last completed task, task in flight, the next action from STATE.md,
   open decisions for Shlok. Then wait for my go-ahead.
Do not re-research or re-decide anything recorded in decisions.md.
```

## B. Build sessions (after G2 approval): model Fable 5.1, two sessions in parallel
The integrator (session A, Opus, stays open in the main folder) runs the H0 setup in
**docs/sessions/build-protocol.md**: worktrees, `.env` copies, `pnpm install`, deploy. Roles, merge order,
track logs and handoff rules are all in that file. The tracks never edit CHECKLIST.md or STATE.md.

**Session B** (open Claude Code in `../spotter-track-b`, select Fable 5.1), paste:
```
You are Track B (backend) of Spotter. Act as the backend-lead agent (.claude/agents/backend-lead.md).
First run `git merge main` and `pnpm install`, then read docs/sessions/handoff.md.
Read CLAUDE.md, STATE.md, docs/specs/idea.md, docs/architecture/ADR-001-backend-architecture.md,
docs/sessions/build-protocol.md, then docs/architecture/backend-tasks.md. Execute tasks in DEPENDENCY
order (the graph in backend-tasks.md), one at a time (the approved subagent lane excepted),
touching only supabase/, scripts/, packages/shared and deploy config. After each task: run its tests, get a
review from backend-reviewer (.claude/agents/backend-reviewer.md, model opus) and code-reviewer,
fix the findings, commit and push branch track-b, and append the result to docs/sessions/track-b.md
(never CHECKLIST.md or STATE.md). Messages for Track F go in docs/sessions/handoff.md. Run defenso
guard_code on auth/DB/env/request-body code. Twilio live calls ONLY with DRY_RUN off and after
asking me ($5.90 budget). Start with task B0.
```

**Session F** (open Claude Code in `../spotter-track-f`, select Fable 5.1), paste:
```
You are Track F (frontend) of Spotter. Act as the ui-ux-lead agent (.claude/agents/ui-ux-lead.md).
First run `git merge main` and `pnpm install`, then read docs/sessions/handoff.md (the [B→F] items
override older task text, e.g. F15 uses the BROWSER ledger verifier).
Read CLAUDE.md, STATE.md, docs/specs/idea.md, docs/design/visual-language.md,
docs/design/interaction-map.md, docs/design/screens.md, docs/sessions/build-protocol.md, then
docs/design/frontend-tasks.md. PRIORITY: reach "Showable 1" (build-protocol.md) as fast as possible:
a polished, fixture-driven, clickable demo that the integrator deploys. Then execute the remaining tasks in
DEPENDENCY order, touching only apps/web. Build against the fixture adapter until Track B's
contracts land on main, then integrate. After each task: screenshot it at 375/768/1440 in the
browser pane, get a review from code-reviewer (.claude/agents/code-reviewer.md), fix the findings,
commit and push branch track-f, and append the result to docs/sessions/track-f.md (never CHECKLIST.md
or STATE.md). Messages for Track B go in docs/sessions/handoff.md. Start with task F01.
```

## Before leaving any session (checklist for Claude)
- [ ] End-of-Session Routine in `claude/routines.md` done
- [ ] STATE.md "Next action" is specific and has a reason
- [ ] CHECKLIST.md statuses current; validator verdicts recorded
- [ ] timeline.md entry appended
- [ ] graphify graph refreshed if code changed (`/graphify .` skill; the CLI is `python -m graphify`,
      because the binary is not on PATH)
- [ ] git commit + push (verify with `git status -sb`)
