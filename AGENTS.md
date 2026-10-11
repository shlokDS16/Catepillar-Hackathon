# Spotter: agent instructions (read by every agent and subagent)

Spotter is an operator companion for Cat machines (Next.js 16 web app in `apps/web`, Supabase backend in
`supabase/`, shared contracts in `packages/shared`, scripts in `scripts/`). Hackathon project, now a
side project. Live site: https://spotter-five-brown.vercel.app

## Read first, in this order
1. `STATE.md`: the PAUSED banner at the top is the truth about where work stopped.
2. `CHECKLIST.md`: what is merged.
3. `docs/sessions/build-protocol.md`, then the LAST 40 lines of `docs/sessions/track-b.md` and `track-f.md`.
4. Specs when needed: `docs/specs/idea.md`, `docs/architecture/*.md` (ADR-001, data-model, api-contracts,
   backend-tasks), `docs/design/*.md` (visual-language, interaction-map, screens, frontend-tasks).
5. Decisions already made, never re-decide: `docs/project-memory/decisions.md`.

## Single-folder mode (this replaces the three-session setup in RESUME.md)
- Work ONLY in this folder on branch `main`. The unmerged work is on local branches `track-b` and
  `track-f` in this same repository: use `git log main..track-f`, `git merge track-f`, and so on.
  Never try to open `../spotter-track-b` or `../spotter-track-f`.
- You are integrator and builder. Ignore the model names in CLAUDE.md (Opus, Fable).
- Role definitions live in `.claude/agents/*.md` (ui-ux-lead, backend-lead, backend-reviewer,
  code-reviewer, phase-validator). A subagent adopts its role by reading its file there.

## Hard rules
- Secrets are in `.env` (root) and `apps/web/.env.local`. Never print, log or commit their values.
- **Every push to `main` is a production deploy.** Push only when typecheck, lint, tests and build all pass.
- Never edit a migration file that is already applied. New database changes are new migration files,
  tested with the SQL tests before `supabase db push`.
- No live Twilio calls and no real Telegram sends without asking Shlok. SOS stays in dry-run.
- One task at a time per area. After each task: run its tests, get a review from a reviewer subagent,
  fix the findings, commit, append one line to the track log, update STATE.md and CHECKLIST.md.
- Stop and ask Shlok if a test fails twice, or a needed decision is not in decisions.md.
- Honesty rules in `docs/specs/idea.md` section 3 apply to every screen (simulated or assumed data is labelled).

## Design
- `docs/design/visual-language.md` ("Site Signage") governs every operator and fleet-manager screen:
  minimal, high contrast, safety colours for live state only, restrained motion.
- The skill at `.claude/skills/website-craft-director/` (start with its SKILL.md, then `skills/01` to
  `08`) is the PROCESS to follow for research, component contracts, build and visual verification.
  Where its taste conflicts with visual-language.md, visual-language.md wins. Its richer motion is
  allowed only inside the training simulations (Replay) and any marketing/landing page.

## Tools
- At the start, list every tool, connector and MCP server you have. Use all that help: browser or
  Playwright for visual checks at 375 / 768 / 1440 px, docs lookup for exact library versions, the
  Supabase CLI (`supabase`), `pnpm`, `uv`, the Vercel CLI, git.
- If a tool you need is missing, do not guess or work around it silently: tell Shlok the exact install
  or connect steps and continue with other work meanwhile.
- Verify library and API details against official docs for the installed version. Never from memory.
