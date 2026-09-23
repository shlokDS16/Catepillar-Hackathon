# Research: Session Persistence & Monorepo Structure for a Multi-Session Claude Code Hackathon (Windows)

Date: 2026-09-23
Scope: (A) preserving state across Claude Code sessions without relying on `/compact`; (B) folder structure for a Next.js + Expo + FastAPI hackathon monorepo with shared types and a docs/ area.

---

## A) Preserving state across Claude Code sessions

### What experienced users actually do (synthesis across sources)

The consistent pattern across 2026 sources is: **treat the chat session as disposable working memory, and put every durable fact into files Claude re-reads at the start of the next session.** Nobody relies on `/compact` alone — compaction is lossy summarization, and by the time you need it you've already lost fidelity. The `/compact` alternative is a **deliberate, structured handoff written by Claude before the session ends**, plus a **resume prompt that forces Claude to read the handoff before doing anything else.**

Key practices, consolidated:

1. **CLAUDE.md stays small and rule-only.** Multiple 2026 sources converge on keeping CLAUDE.md under ~250 lines because above that it gets skim-read (by the model, not just humans) and eats context budget on every single session start. It should hold *falsifiable rules* ("all async functions must have a timeout"), not narrative history or progress notes — history belongs elsewhere. ([alexdunlop.com](https://www.alexdunlop.com/writing/claude-md-best-practices), [agentlint.app](https://www.agentlint.app/blog/claude-md-best-practices-2026/))
2. **Use `@imports` in CLAUDE.md** to pull in scoped files (`@docs/architecture.md`, `@docs/decisions/ADR-*.md`) rather than inlining everything — this is exactly what your own global CLAUDE.md already does with `@RTK.md`, and the same pattern should be used at the project level.
3. **Session state lives outside the transcript, in three tiers of file:**
   - A **living plan/spec** (what we're building, why, acceptance criteria) — rarely changes.
   - A **progress ledger** (what's done, what's in-flight, what's next) — changes every session, append-only where possible.
   - **ADRs** (Architecture Decision Records) — one short file per non-obvious decision, so Claude never re-litigates a choice already made. This avoids the single biggest cause of cross-session hallucination: Claude re-deriving an answer differently the second time because the first decision was never written down.
4. **Session-end routine**: before stopping, have Claude write a `HANDOFF.md` (or update the ledger) summarizing: current state/phase, what was done this session, decisions made, files touched, open questions/blockers, and the explicit next step. This is the single most-cited practice. ([mcpmarket.com](https://mcpmarket.com/tools/skills/agent-session-handoff), [jdhodges.com](https://www.jdhodges.com/blog/ai-session-handoffs-keep-context-across-conversations/))
5. **Resume prompt forces a read, not a guess.** The opening message of the next session should explicitly instruct Claude to read the ledger/handoff files *before* taking any action — never rely on it "remembering" or inferring. This is what eliminates hallucination: Claude is grounded in text it just read, not in a compacted/lossy memory of the prior conversation.
6. **claude-mem / MCP memory servers are a supplement, not a replacement**, and opinions on them are split. `claude-mem` and similar MCP memory tools (Mem0, mcp-memory-keeper) give semantic recall across sessions without manual file curation, but every source that recommends them also warns that automatic memory can silently accumulate stale or wrong facts (an LLM's own memory writes are themselves subject to hallucination) — so several experienced users treat file-based ledgers as the source of truth and memory tools as a convenience index on top, not authoritative. As of Claude Code 2.1.59+ (Feb 2026), Claude Code ships **Auto Memory** by default — Claude writes its own `MEMORY.md` as you work — which reduces the need for a separate `claude-mem` install for single-project continuity, but is scoped per-project and still benefits from being reviewed/edited by hand rather than trusted blindly. ([lobehub.com](https://lobehub.com/mcp/randall-gross-claude-memory-mcp), [mem0.ai](https://mem0.ai/blog/claude-code-memory))
7. **graphify** (your installed skill) is best used as a **read-mostly index over the codebase**, not over conversation history — rebuild it (`/graphify .`) after structural changes (new packages, renamed dirs), then use `graphify query` for near-zero-token "where does X live" questions instead of grep sweeps at the start of a new session. It complements the ledger; it doesn't replace it, because it indexes code structure, not decisions or WIP state.
8. **task-master-ai** is worth wiring in once the project has 10+ discrete tasks (per your own CLAUDE.md guidance) — its task list *is* a progress ledger with status tracking, and `next_task`/`get_tasks` give a new session an instant, unambiguous "what's next" without re-reading prose. For a 1-2 day hackathon with a handful of tasks, a plain markdown ledger is faster to set up and edit than standing up task-master; switch to task-master if the task count or team size grows mid-hackathon.
9. **Context-budget monitoring is proactive, not reactive.** Sources converge on triggering a deliberate handoff-and-restart at **~60-70% context utilization**, checked via `/context` (built-in, shows a colored breakdown of what's consuming the window) rather than waiting for auto-compaction to kick in. `ccusage` (CLI, usage by date/session/project) and `claude-monitor`/`cmonitor` (real-time burn-rate + time-to-limit) are the standard external tools for this — both are already in your tool stack per CLAUDE.md. Practical rule several devs use: **one session = one goal + one verification path + one diff**; when the goal changes, start a new session rather than continuing a long one, even if context isn't full yet — this bounds hallucination risk independent of token count. ([sitepoint.com](https://www.sitepoint.com/claude-code-context-management/), [dev.to/kaz123](https://dev.to/kaz123/how-i-solved-claude-codes-context-loss-problem-with-a-lightweight-session-manager-265d))
10. **Multi-agent/parallel session caveat**: if you ever run more than one Claude Code session against the same repo (e.g., one on web, one on mobile), sources warn you need an external "who owns what" marker (a claimed-tasks file or git worktree per session) — otherwise two sessions silently stomp each other's uncommitted changes. For a 1-2 dev hackathon this is a secondary concern but worth a one-line rule in the ledger ("session X owns apps/web, session Y owns services/ai").

### Contradicts conventional wisdom / worth flagging

- **`/compact` is not "the" persistence mechanism — it's explicitly what experienced users route around.** The common beginner assumption ("just let Claude Code auto-compact and it'll remember") is contradicted everywhere: compaction is lossy summarization by design, and the fix is external files + a forced-read resume prompt, not better compaction.
- **Bigger CLAUDE.md is not more grounding — it's the opposite.** The intuitive move (dump everything you know into CLAUDE.md so Claude "remembers") is the anti-pattern; sources are unanimous that a long CLAUDE.md gets skim-read and wastes the per-session context budget that could instead go to the actual task. Scoped `@imports` + a short root file beats one giant file.
- **Automatic memory (claude-mem/Auto Memory) is not strictly safer than manual files** — because an LLM writing its own memory can hallucinate facts into permanent storage just as easily as it hallucinates in a response. Several sources explicitly recommend treating auto-written memory as a cache to review, not ground truth, which cuts against the "just turn on memory and forget about it" pitch these tools are marketed with.
- **A full context window is not the trigger for restarting a session — a change of goal is.** This is a smaller but real contradiction of the default mental model (restart only when forced to by token limits).

### Correction (validator gate P0, fix 10, 2026-09-23): scaffold precedence

The file set and tree below (`docs/PROJECT_PLAN.md`, `docs/PROGRESS_LEDGER.md`, `docs/decisions/ADR-*.md`, `docs/HANDOFF.md`, `docs/pitch/`) was proposed before the project's actual scaffold existed. Per docs/research/04-validator-gate-P0.md §C and §D, that scaffold now exists and is **authoritative**; 03's file set is **rejected** to avoid three names for the same thing. Read the tables below through this mapping, not as literal filenames to create:

| 03's proposed name (below) | Authoritative scaffold file/location |
|---|---|
| `CLAUDE.md` (root, imports below) | `CLAUDE.md` (already exists, do not restructure) |
| `docs/PROJECT_PLAN.md` | `docs/specs/idea.md` (once the idea is frozen, per STATE.md "Key files") |
| `docs/PROGRESS_LEDGER.md` | `docs/project-memory/timeline.md` (append-only log) + `CHECKLIST.md` (phase/gate status) |
| `docs/decisions/ADR-000N-*.md` | `docs/architecture/ADR-*.md`, indexed from `docs/project-memory/decisions.md` |
| `docs/HANDOFF.md` | `STATE.md` (current phase/next-action, overwritten each session) + `RESUME.md` (the resume prompt/load order) |
| `MEMORY.md` (Auto Memory) | not yet adopted in this project; `docs/project-memory/lessons-learned.md` and `claude-mem` fill an equivalent role — do not create a separate `MEMORY.md` without checking with Shlok first |
| `docs/pitch/` | no scaffold equivalent yet — this one *can* be created as proposed when P2 (PPT round) starts, since nothing already claims that name |

This log is also recorded in `docs/project-memory/decisions.md` per the validator's fix 10 instruction.

The original (now-superseded) recommendation and tree follow, unedited, for reference:

### Recommended concrete file set

```
CLAUDE.md                        # root, imports below; <250 lines, rules only (falsifiable, not prose)
docs/
  PROJECT_PLAN.md                # what we're building, why, judging criteria, deadline — changes rarely
  PROGRESS_LEDGER.md             # append-only log: date, session goal, done/in-progress/next, owner (if multi-session)
  decisions/
    ADR-0001-monorepo-tool.md    # one ADR per non-obvious decision (short: context/decision/consequences)
    ADR-0002-auth-strategy.md
  HANDOFF.md                     # overwritten each session end: current phase, this-session summary, blockers, explicit next step
  research/                      # this file lives here
.claude/
  settings.json                  # hooks, permissions
MEMORY.md                        # Claude Code Auto Memory (2.1.59+) — let it write, skim it occasionally, don't hand-edit unless wrong
```

Purpose recap:
- **CLAUDE.md**: standing rules Claude must follow every session (stack choices, coding conventions, "never do X").
- **PROJECT_PLAN.md**: the stable target — rarely edited, read once per session for orientation.
- **PROGRESS_LEDGER.md**: the WIP truth — read every session, appended every session.
- **ADRs**: prevents re-litigating settled decisions (a top cause of cross-session drift/hallucination).
- **HANDOFF.md**: the tactical "resume here" note — short, overwritten, always current.
- **MEMORY.md**: Claude's own free-form recall; supplementary, not authoritative.

### Resume-prompt template

```
Before doing anything else, read in order:
1. CLAUDE.md
2. docs/HANDOFF.md
3. docs/PROGRESS_LEDGER.md (just the last 2-3 entries)
4. Any ADR referenced in HANDOFF.md's "Decisions" section

Do not assume anything about prior work that isn't stated in these files —
if something is ambiguous or missing, ask rather than guess.

Once read, summarize back to me in 3-5 bullets: current phase, what's
done, what you're about to do next. Wait for my go-ahead if the next
step is ambiguous or high-risk (schema change, deleting code, API contract
change); otherwise proceed.

Today's goal: <one sentence>
```

---

## B) Monorepo folder structure: Next.js + Expo + FastAPI + docs

### Tooling comparison

| | Turborepo (+ pnpm) | Nx | Plain pnpm workspaces (no orchestrator) |
|---|---|---|---|
| Setup speed | Fast, minimal config | Slower — more concepts (generators/executors/project graph) upfront | Fastest to start, but no caching/orchestration |
| Best fit | 2-3 JS/TS apps + a few shared packages, single build system mindset | Polyglot (JS + Python + Go...), needs code-gen/enforcement, larger teams | Tiny repos, 2-3 packages, no CI bottleneck |
| Caching/remote cache | Yes, first-class, easy Vercel remote cache | Yes, more powerful but more config | No |
| Python (FastAPI) support | Workable via `experimentalPythonWorkspaces` (Turbo ≥2.10.13) or simply left outside Turbo's task graph and run with its own `uv`/`pip` scripts | Native via `@nx/python`-style community plugins; more mature polyglot story | N/A — Python isn't a pnpm concept anyway |
| Learning curve for AI agents driving it | Low — conventions are simple, easy for an LLM to infer and generate correct `turbo.json` | Higher — Nx's plugin/generator model is more idiosyncratic, more likely for an agent to invent wrong config | Lowest, but you lose caching/parallel task running which matters once web+mobile+API builds get repetitive during a hackathon |

**2026 source consensus**: *"For 2-3 packages with no CI bottleneck, use pnpm workspaces; for heavy CI with many TS packages, choose Turborepo; for polyglot and multiple frameworks, select Nx."* ([dev.to/yobox](https://dev.to/yobox/how-to-pick-a-monorepo-tool-in-2026-kko)) But also: *"Turborepo is the right starting point for most JS/TS projects in 2026... simpler and faster to set up... graduate to Nx when you need code generation and architecture enforcement."* ([thesoftwarescout.com](https://thesoftwarescout.com/best-monorepo-tools-2026-turborepo-vs-nx-vs-lerna-complete-guide/))

### Correction (validator gate P0, fix 9, 2026-09-23): monorepo downgraded from default to conditional

The recommendation below (Turborepo + pnpm workspaces as the default) was written before the problem statement existed and is overbuilt as a *default*. Per docs/research/04-validator-gate-P0.md §C: judges score problem fit, the working demo, data/ML credibility and interview answers — nobody opens `turbo.json`, and every extra layer (Turborepo config, generated OpenAPI clients, `packages/ui`, `packages/config`) costs agent tokens and adds Windows symlink / Metro-resolver risk before it's known whether mobile is even in scope.

**Revised default (ADR-001, to be recorded in P3):**
- **Default = a single Next.js app** (API routes for the backend), no monorepo tooling at all.
- **+ an optional Python FastAPI ML service in `services/ml`** (not `services/ai` as originally written below), run separately with its own `uv` env, only if the problem statement needs model serving.
- **+ an Expo app only if the brief explicitly requires mobile.**
- **Turborepo is added only if both web and mobile are required and they need to share code** (e.g. a `packages/types` package) — not by default. If that trigger is met, the tree and reasoning below (pnpm + Turborepo, `apps/web` + `apps/mobile` + `packages/*`) still apply as written.
- **Caveat if Turborepo + Expo is later adopted:** Expo in a pnpm monorepo needs `node-linker=hoisted` in `.npmrc` or an equivalent Metro resolver config — the tree below does not mention this; add it to ADR-001 if/when the mobile trigger fires.

Tool versions re-verified 2026-09-23 on this machine: **pnpm 10.33.0** (installed), **uv not installed** (`winget install astral-sh.uv` or `pip install uv` if the `services/ml` path is taken), **turbo not installed as a global binary** but resolves via `npx turbo` → **2.11.3** (only relevant if the Turborepo trigger above is met).

The original (now-conditional) reasoning and tree follow, unedited, for reference:

### Recommendation for this hackathon: **Turborepo + pnpm workspaces**

Reasoning specific to your constraints (1-2 devs, AI-agent-driven, speed-to-demo, Windows):
- Nx's polyglot advantage matters less here because **FastAPI is deliberately kept outside the JS task graph** — it's just a Python service with its own `uv`/`venv`, started separately (e.g., via a root `dev` script or `docker-compose`, or the `run` skill / `.claude/launch.json` pattern you already use for previewing). You don't need Nx's Python plugin maturity if you're not asking Turborepo to orchestrate Python builds at all — only to orchestrate the two JS/TS apps and their shared packages, which is exactly Turborepo's strong suit.
- An AI agent (Claude Code) generating `turbo.json` pipelines and pnpm-workspace.yaml is far less likely to produce broken config than generating Nx generators/executors — this directly serves "speed-to-demo, AI-agent-driven."
- pnpm is confirmed as the preferred package manager for monorepos in 2026 regardless of orchestrator choice (faster installs, no phantom deps), and Turborepo reads pnpm's workspace graph natively.
- Turborepo now has experimental native Python workspace support if you later want FastAPI folded into the task graph (shared `turbo run lint`/`turbo run test` across the whole repo) — an easy incremental upgrade, not a rewrite.

**Flag**: the "Nx for polyglot" advice you'll find in generic monorepo comparisons is true for large multi-language platform teams, but for a 1-2 dev hackathon it's the wrong optimization — it trades setup speed (your scarcest resource) for architecture enforcement (not your bottleneck in a 24-48h build). This is worth flagging because default monorepo-tool advice usually pushes toward Nx once Python enters the picture, but that generic advice doesn't account for the hackathon time constraint.

### Shared types strategy (Next.js web ↔ Expo mobile ↔ FastAPI)

- Between **web and mobile** (both TS/React): a `packages/types` (or `packages/shared`) workspace package exporting raw `.ts` source (not compiled JS) — both apps transpile it themselves, which is the documented best practice for shared packages in a Turborepo/pnpm setup. ([outstand.so](https://www.outstand.so/blog/typescript-monorepo-setup))
- Between **FastAPI and the TS apps**: FastAPI already generates an OpenAPI spec for free. Use a generator (e.g., `openapi-typescript` or `hey-api`) to turn that spec into a generated TS client/types package (`packages/api-client`), committed or generated on `turbo run generate` — this is the documented pattern for full-stack type safety across a Python/TS boundary and avoids hand-duplicating request/response shapes. ([abhayramesh.com](https://abhayramesh.com/blog/type-safe-fullstack), [vintasoftware.com](https://www.vintasoftware.com/blog/nextjs-fastapi-monorepo))

### Exact tree

```
hackathon-project/
├── apps/
│   ├── web/                      # Next.js app
│   │   ├── app/
│   │   ├── public/
│   │   ├── package.json
│   │   └── next.config.ts
│   └── mobile/                   # Expo React Native app
│       ├── app/                  # expo-router
│       ├── assets/
│       ├── package.json
│       └── app.json
├── services/
│   └── ai/                       # FastAPI Python service (outside pnpm workspace graph)
│       ├── app/
│       │   ├── main.py
│       │   ├── routers/
│       │   └── models/
│       ├── pyproject.toml        # uv-managed
│       ├── uv.lock
│       └── openapi.json          # generated on `uv run export-openapi` or FastAPI startup script
├── packages/
│   ├── types/                    # shared hand-written TS types/interfaces (web + mobile)
│   │   ├── src/index.ts
│   │   └── package.json
│   ├── api-client/                # generated from services/ai/openapi.json (hey-api / openapi-typescript)
│   │   ├── src/
│   │   └── package.json
│   ├── ui/                        # optional: shared React components (web-only unless using react-native-web)
│   │   ├── src/
│   │   └── package.json
│   └── config/                    # shared eslint/tsconfig/tailwind base configs
│       ├── eslint-preset.js
│       └── tsconfig.base.json
├── docs/
│   ├── PROJECT_PLAN.md
│   ├── PROGRESS_LEDGER.md
│   ├── HANDOFF.md
│   ├── decisions/                 # ADRs
│   │   └── ADR-0001-monorepo-tool.md
│   ├── research/                  # this file + any other research notes
│   │   └── 03-persistence-and-structure.md
│   └── pitch/                     # PPT, demo script, pitch deck assets
│       ├── slides/
│       ├── screenshots/
│       └── demo-script.md
├── .claude/
│   ├── settings.json
│   └── launch.json                # dev server configs for Claude Code's preview tool
├── CLAUDE.md
├── package.json                   # root, workspaces + turbo scripts
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

Notes on the tree:
- `services/` (not `apps/`) for FastAPI signals it's not part of the pnpm/Turborepo app graph — it's invoked separately (own `uv` env), which avoids fighting Turborepo's JS-centric assumptions on Windows.
- `packages/api-client` is regenerated, not hand-maintained — treat it like a build artifact with a `turbo run generate` task that calls the OpenAPI generator against `services/ai/openapi.json`.
- `docs/pitch/` keeps hackathon deliverables (slides, demo script, screenshots) out of the app source tree entirely, so it never pollutes `turbo` file-hashing/caching or gets swept into a build.
- On Windows specifically: pnpm + Turborepo both have first-class Windows support as of 2026; the one practical gotcha noted across sources is to keep paths short/avoid deeply nested `node_modules` symlink issues — pnpm's content-addressable store mitigates this better than npm/yarn would.

---

## Sources

**A) Session persistence**
- [Claude Code Best Practices in 2026 — DEV Community](https://dev.to/kanta13jp1/claude-code-best-practices-in-2026-10-rules-from-6-months-of-solo-dev-at-scale-45ah)
- [CLAUDE.md Best Practices: What the Evidence Supports (2026) — Alex Dunlop](https://www.alexdunlop.com/writing/claude-md-best-practices)
- [CLAUDE.md Best Practices, 2026 — AgentLint Blog](https://www.agentlint.app/blog/claude-md-best-practices-2026/)
- [Claude Code Compaction and Long-Session Operations Guide](https://hidekazu-konishi.com/entry/claude_code_compaction_and_long_session_guide.html)
- [Claude Memory Setup Guide — LobeHub](https://lobehub.com/mcp/randall-gross-claude-memory-mcp)
- [Add Persistent Memory to Claude Code with Mem0](https://mem0.ai/blog/claude-code-memory)
- [mcp-memory-keeper — GitHub](https://github.com/mkreyman/mcp-memory-keeper)
- [Handoff Claude Code Skill — mcpmarket.com](https://mcpmarket.com/tools/skills/agent-session-handoff)
- [Claude Handoff Prompt: How to Keep Context Across Sessions (2026) — jdhodges.com](https://www.jdhodges.com/blog/ai-session-handoffs-keep-context-across-conversations/)
- [AI Handoff Prompt — 8-Section Continuation Template](https://www.dontsleeponai.com/handoff-prompt)
- [Claude Code Context Window: Track Token Usage with /context](https://wmedia.es/en/tips/claude-code-context-command-token-usage)
- [Claude Code Usage Monitor: ccusage, ccflare, and Hooks](https://claudefa.st/blog/tools/monitors/claude-code-usage-monitor)
- [Claude Code Context Management Guide — SitePoint](https://www.sitepoint.com/claude-code-context-management/)
- [How I solved Claude Code's context loss problem with a lightweight session manager](https://dev.to/kaz123/how-i-solved-claude-codes-context-loss-problem-with-a-lightweight-session-manager-265d)
- [Why Your Claude Code Sessions Keep Losing Context — DEV Community](https://dev.to/whoffagents/why-your-claude-code-sessions-keep-losing-context-and-how-to-fix-it-nia)

**B) Monorepo structure**
- [How to Pick a Monorepo Tool in 2026 — DEV Community](https://dev.to/yobox/how-to-pick-a-monorepo-tool-in-2026-kko)
- [Best Monorepo Tools 2026: Turborepo vs Nx vs Lerna (Complete Guide)](https://thesoftwarescout.com/best-monorepo-tools-2026-turborepo-vs-nx-vs-lerna-complete-guide/)
- [Turborepo vs Nx: Choosing a Monorepo Tool for Your Startup — Kanopy](https://kanopylabs.com/blog/turborepo-vs-nx-monorepo)
- [TypeScript monorepo strategy: Turborepo vs Nx — DevLume](https://www.devlume.com/insights/typescript-monorepo-turborepo-vs-nx)
- [next-fast-turbo — GitHub (Next.js + FastAPI Turborepo template)](https://github.com/cording12/next-fast-turbo)
- [expo-monorepo-example — GitHub](https://github.com/byCedric/expo-monorepo-example)
- [turbo-expo-nextjs-clerk-convex-monorepo — GitHub](https://github.com/get-convex/turbo-expo-nextjs-clerk-convex-monorepo)
- [TypeScript Monorepo Setup: Sharing Types Between Workers and Next.js Apps](https://www.outstand.so/blog/typescript-monorepo-setup)
- [Achieving Full-Stack Type Safety with FastAPI, Next.js, and OpenAPI Spec](https://abhayramesh.com/blog/type-safe-fullstack)
- [Generating API clients in monorepos with FastAPI & Next.js — Vinta Software](https://www.vintasoftware.com/blog/nextjs-fastapi-monorepo)
- [Teach the monorepo Python: turbo uv workspaces — GitHub issue](https://github.com/SBub/issebya-homes-ai-system/issues/69)
- [Python Monorepo with UV — Medium](https://medium.com/@life-is-short-so-enjoy-it/python-monorepo-with-uv-f4ced6f1f425)
