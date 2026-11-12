# Lane rules for implementer agents (L1 backend, L2 web screens, L3 experience), 2026-11-12

Read this file, then only the sections your brief cites. The plan is docs/sessions/team-plan-2026-11-12.md.

## Where you work
- You run in your own git worktree. Create your branch from the current HEAD:
  `git checkout -b lane/<l1|l2|l3>-<task-id>`. Commit there; push only that branch
  (`git push -u origin lane/...`). Never commit to or push `main`: the lead (L0) merges, and every push
  to main deploys production.
- Setup once: `pnpm install --frozen-lockfile`. If a build or script needs env, copy
  `C:/Users/Shlok/Downloads/Catepillar Hackathon/.env` to your worktree root and
  `C:/Users/Shlok/Downloads/Catepillar Hackathon/apps/web/.env.local` to your worktree's `apps/web/`
  (both git-ignored). Never print, log or commit a secret value.
- Ownership: L2/L3 own `apps/web` only. L1 owns `supabase/`, `scripts/`, and additive changes to
  `packages/shared` (contracts v1.0.0 are frozen: additive only, never break a shape). Nobody touches
  CHECKLIST.md or STATE.md (the lead does).
- New dependencies: only the ones your brief names. Anything else: stop and say so in your reply.

## How you find code (token budget is tight)
- `graph-memory where <symbol>`, `graph-memory module <dir>`, `graph-memory impact <file|symbol>` first;
  then Read only the lines you need. Do not read whole spec files: open the cited sections.
- Standards: AGENTS.md; docs/design/visual-language.md ("Site Signage": it wins over any skill's taste,
  except inside Replay and the landing, see §5.1); docs/design/screens.md and interaction-map.md for
  behaviour. No Caterpillar logos, trade dress or yellow-and-black brand surfaces.
- Data (web): fixtures from `@cat/shared/fixtures`, types from `@cat/shared`. Strings in en and hi
  (`apps/web/messages/*.json`); Tamil may fall back.

## L1 extra rules (database)
- Never edit an applied migration: add a new timestamped one. Write SQL tests in `supabase/tests/`
  and run them (`scripts/sqltest.ts`) BEFORE `supabase db push`. Push a migration only after tests pass.
- Nothing secret may transit pg_net (STATE.md, 002d). Twilio/Telegram stay DRY_RUN.
- Paste the Security Advisor result (via the Management API scripts) into your log line.

## Done means
1. Web: `pnpm --filter web typecheck`, `lint`, `test`, `build` all green. L1: `pnpm exec tsc` for
   shared and scripts, `pnpm exec vitest run`, sqltest. Quote real counts from the final run.
2. Unit tests for any state machine, reducer, pure helper or SQL function you add.
3. Web, if a browser tool is available: screenshots at 375 and 1440 px in `docs/design/qa/<task-id>-*.png`;
   no horizontal scroll at 360 px.
4. Append ONE line to your lane log (L1: `docs/sessions/track-b.md`, L2: `docs/sessions/track-f.md`,
   L3: `docs/sessions/track-x.md`): `time | task | DONE | SHA | checks with counts | deviations`.
5. Commit, push your lane branch, then reply to the lead in 5 lines or fewer: branch, SHA, checks,
   deviations, anything blocked. Details go in the log line, not the reply.
- You do not review your own work: the lead runs an Opus reviewer on your branch and may send the
  findings back to you to fix on the same branch.
