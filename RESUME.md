# Resume prompt

Paste this into a fresh Claude Code session opened in this folder:

```
Resume the Caterpillar Hackathon project exactly where we left off.
1. Read CLAUDE.md, then STATE.md, then CHECKLIST.md, then the last 3 entries of
   docs/project-memory/timeline.md and docs/project-memory/unanswered-questions.md.
   Read nothing else yet.
2. If graphify-out/ exists, use it for any codebase question before grepping.
3. Reply with: current phase, last completed task, task in flight, the next action from
   STATE.md, and any open questions. Then wait for my go-ahead before doing anything.
Do not re-research or re-decide anything recorded in docs/project-memory/decisions.md.
```

## Before leaving a session (checklist for Claude)
- [ ] End-of-Session Routine in `claude/routines.md` done
- [ ] STATE.md "Next action" is specific and has a reason
- [ ] CHECKLIST.md statuses current; validator verdicts recorded
- [ ] timeline.md entry appended
- [ ] graphify graph refreshed if code changed (`/graphify .` skill; CLI is `python -m graphify`,
      binary not on PATH)
- [ ] git commit of docs + code
