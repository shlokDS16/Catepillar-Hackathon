# Build protocol: two parallel tracks + one integrator (gate G2 fix)

## Roles
| Session | Folder | Model | Owns | Never touches |
|---|---|---|---|---|
| **Integrator** (orchestrator) | main folder `Catepillar Hackathon/` on `main` | Opus | merges to `main`, CHECKLIST.md, STATE.md, docs/project-memory, deploy triggers, gates | feature code |
| **Track B** | `../spotter-track-b` on branch `track-b` | Fable 5.1 | `supabase/`, `scripts/`, `packages/shared`, deploy config | `apps/web`, CHECKLIST.md, STATE.md |
| **Track F** | `../spotter-track-f` on branch `track-f` | Fable 5.1 | `apps/web` | `supabase/`, `scripts/`, `packages/shared`, CHECKLIST.md, STATE.md |

- The tracks log progress in **their own file only**: `docs/sessions/track-b.md` / `track-f.md`. After
  each task they append a line: time, task ID, status, commit SHA, blockers.
- **Messages between tracks** go through `docs/sessions/handoff.md`, append-only, with the prefix
  `[B→F]` or `[F→B]`. The integrator relays anything urgent to the other session.
- **Merging:** the tracks commit to their own branch and push it. The integrator merges into `main`
  (a worktree cannot check out `main` while the main folder has it) in this order:
  contracts (`packages/shared`) first → Track B → Track F. After each merge the other track runs
  `git merge main`.
- The **integrator ticks CHECKLIST.md** and updates STATE.md from the track logs at every merge.

## H0 setup (integrator, in order)
1. Shlok: `vercel login` works (fallback: import the GitHub repo in the Vercel dashboard and deploy from `main`).
2. `git worktree add ../spotter-track-b -b track-b` and `git worktree add ../spotter-track-f -b track-f`.
3. Copy `.env` into each worktree root **and** to `apps/web/.env.local` in each (both are git-ignored).
4. Run `pnpm install` in each worktree.
5. uv is at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\uv.exe`.
   Sessions started before the install don't see it, so restart the Claude app to refresh PATH. Verify with `uv --version`.
6. Open two Claude Code sessions (Fable 5.1), one per worktree, and paste prompts B and F from RESUME.md.

## Execution order
Tasks run in **dependency order** as defined by the dependency graph in backend-tasks.md /
frontend-tasks.md, not in raw list order. Within a track: one task at a time (the approved subagent
lane is the only exception). Review after every task (backend-reviewer / code-reviewer). Commit per task.

## Budget guards
Twilio: DRY_RUN on by default; live calls only when Shlok says so ($5.90 ≈ 100 min). Groq chain per D9.
Sarvam: audio generated once by the batch script, then committed as static files.
