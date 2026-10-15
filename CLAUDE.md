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

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

> **Spotter note (measured 2026-10-12, rtk 0.42.4).** rtk pays on large, noisy output: `next build`
> 1196 B -> 125 B (90%) via `rtk err`, vitest 1443 B -> 357 B (76%) via `rtk test`, `ls` 373 B ->
> 37 B. On output already under ~2 KB it is break-even or worse (`git status --short` 39 B -> 71 B).
> Treat the golden rule below as the default, not a law: skip rtk for small git plumbing. The full
> playbook and this project's known token traps live in `.claude/agents/token-optimizer.md`.

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->