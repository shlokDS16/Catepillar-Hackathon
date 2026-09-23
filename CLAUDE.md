# Caterpillar Hackathon

Placement hackathon run by Caterpillar (1500+ participants). Round 1 likely a PPT; final
deliverable a website and/or app for the problem statement. Hiring likely follows the result,
so quality beats speed at every trade-off.

## Load order at session start (in this order, nothing else until needed)
1. `STATE.md` — where we are, what is in flight, the next action. Source of truth.
2. `CHECKLIST.md` — phase gates and task status.
3. `docs/project-memory/timeline.md` — last 3 entries only.
4. `docs/project-memory/unanswered-questions.md` — open items.
5. Standards on demand: ./claude/engineering.md, ./claude/documentation.md,
   ./claude/project-memory.md, ./claude/architecture.md, ./claude/routines.md
6. Codebase questions: `graphify-out/` first (graphify query), grep second.

## Operating rules (standing instructions from Shlok)
1. **No phase starts until the plan for it is approved by Shlok.** Present, wait, then act.
2. **Validator gate after every phase.** A validator agent (fresh context, model opus) checks
   the phase output against its exit criteria in CHECKLIST.md and returns PASS / FAIL with
   evidence. FAIL blocks the next phase. Record the verdict in CHECKLIST.md.
3. **Research is validated.** Every web-sourced idea is challenged by a "billionaire software-
   services founder" reviewer agent (market, feasibility, differentiation, judge appeal)
   before it enters the idea shortlist. Claims need URLs; unverified claims are marked.
4. **Model policy.** Planning, research, PPT, validation: Opus. Coding: Fable 5.1 (switch the
   session model before build starts). Every code change is reviewed by a coder-reviewer agent.
   Subagents always get an explicit model.
5. **Token discipline.** rtk for CLI output; agent-browser `read` for web pages; markitdown CLI
   for PDFs/Office files (convert to disk, read slices); graphify for code navigation; subagents
   for read-heavy work with capped summaries; artifacts passed as file paths, never pasted.
6. **Best tool wins.** Not limited to Claude connectors. If a better external tool needs a key
   or install, stop and give Shlok the exact steps.
7. **Flexible.** Changes mid-phase are welcome: log them in `docs/project-memory/decisions.md`,
   update STATE.md and CHECKLIST.md, then continue.
8. **Session switching, not /compact.** When Shlok says switch (or context is heavy), run the
   End-of-Session Routine, update STATE.md, and print the prompt from `RESUME.md`.

Never overwrite historical project knowledge. Append; do not replace past decisions.
