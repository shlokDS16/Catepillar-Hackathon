# Tool Inventory Audit — Caterpillar Placement Hackathon
_Generated 2026-09-23. Sources: live filesystem reads + CLI probes on this Windows machine, not memory._

## a) Tool table

### CLIs
| Tool | Found | Version | Auth needed |
|---|---|---|---|
| rtk | Yes | 0.42.4 | No |
| agent-browser | Yes | 0.32.1 | No |
| task-master (CLI) | Yes | 0.43.1 | Needs LLM provider key (GROQ_API_KEY/GOOGLE_API_KEY) for real work |
| graphify (CLI shim) | No (`graphify` not on PATH) | — | Use `graphifyy` Python package instead |
| graphifyy (pip pkg) | Yes | 0.9.14 | No |
| node | Yes | v24.14.0 | No |
| npm | Yes | 11.9.0 | No |
| git | Yes | 2.53.0.windows.1 | No |
| gh (GitHub CLI) | **No** | — | Install: `winget install GitHub.cli` |
| vercel | Yes | 54.13.0 | Auth needed (MCP flagged not logged in) — `vercel login` |
| supabase | Yes | 2.102.0 | Project-scoped login via `supabase login` if not done |
| docker | Yes | 29.3.1 | No |
| npx expo | Yes (auto-installs) | 57.0.26 (expo@57.0.24 pkg) | No |
| pnpm | Yes (added, fix 7) | 10.33.0 (re-verified 2026-09-23) | No |
| uv | **No** (added, fix 7) | — | Not installed; needed for the FastAPI `services/ml` plan in 03. Install: `winget install astral-sh.uv` or `pip install uv` |
| turbo | Not installed as a global binary (added, fix 7) | Resolves via `npx turbo` → 2.11.3 (re-verified 2026-09-23) | No — only needed if the monorepo path (03 fix 9) is actually taken |

**Fix 4 — graphify invocation correction:** the `graphify (CLI shim)` row above ("Use `graphifyy` Python package instead ... invoke via its own entrypoint") is vague and wrong in emphasis. The verified correct invocation is **`python -m graphify <cmd>`** (Python 3.14; `query`, `update`, `path`, `explain`, `hook install` all exist) — this matches RESUME.md and should be used everywhere in this project, not a bare `graphify` or `graphifyy` command.

### MCP servers (redacted; from `.mcp.json` + `.claude.json`)
| Server | Config location | Auth needed |
|---|---|---|
| markitdown | `.mcp.json` (python script) | No |
| task-master-ai | `.mcp.json` | Needs `GROQ_API_KEY`/`GOOGLE_API_KEY` env (redacted, uses `${VAR}` placeholders) |
| defenso | `.mcp.json` | Needs `DEFENSO_TOKEN` (redacted placeholder) |
| notebooklm | `.claude.json` (npx) | Browser-based one-time login (`setup_auth`) |
| canva | `.claude.json` (remote) | **Yes** — needs auth |
| figma | `.claude.json` (remote) + plugin | Connected this session |
| n8n | `.claude.json` (remote) | **Connection failed** (endpoint not found) |
| supabase | `.claude.json` (remote) | Connected |
| Gamma, Higgsfield, OpenArt, Claude Docs, context7, Vercel, Firebase, huggingface, GitHub | Session-connected per system context | Vercel/huggingface/GitHub/Canva need auth |

### Corrections (validator gate P0, 2026-09-23) — table rows above kept for history, do not re-derive from them

**Fix 3 — markitdown is CLI-only, not an MCP.** The `markitdown` row in the table above is wrong: it sits in `~/.claude/.mcp.json`, which Claude Code does not load, and `claude mcp list` does not show it. Per the global CLAUDE.md and re-verification, use it as a CLI only: `markitdown.exe <file> > out.md`, then Grep headings and Read slices — never call it as an MCP tool.

**Fix 8 — auth-status corrections to the MCP table above:**
- claude.ai **Canva is connected**; only the local `canva` server entry in `.claude.json` needs auth — do not treat Canva as blocked project-wide.
- claude.ai **Vercel is connected**; only the plugin copy needs auth.
- The **GitHub plugin fails with "Authorization header is badly formatted"**, not merely "needs auth" — this needs a re-auth/reconfigure, not just a first-time login.
- **Expo MCP needs auth** and was omitted from the table above — add it as a gap (see gap table below).
- **Useful connected tools omitted from the table above: draw.io, Excalidraw and Mermaid Chart** (all connected this session). These are the fastest route to the architecture and flow diagrams needed for the PPT round (P2) — prefer them over standing up Figma/Canva for a quick diagram.

### Plugins installed (`installed_plugins.json`)
figma, frontend-design, github, skill-creator, context7, code-review, superpowers (6.3.0), feature-dev, security-guidance, vercel, supabase, telegram (connection failed this session), playground, hookify, huggingface-skills, firebase, mcp-server-dev, microsoft-docs.

### Relevant local skills (from `~/.claude/skills/`, frontmatter descriptions)
project-kickoff, token-optimization-techniques (+ rtk.md, graphify.md, superclaude-uc.md, claude-md-rules.md, usage-monitors.md, markitdown-mcp.md), graphify, parallel-tasks, frontend-design, security-review, advanced-scraping, code-quality, performance, webfetch-security, enterprise-architecture, Andriod_app, Andriod_APPUI, ios-app-development, iosui, react-native-best-practices, react-native-brownfield-migration, upgrading-react-native, ui-design-master, ui-ux-pro-max, dataviz, artifact-design, artifact-diagramming, artifact-capabilities, neobrutalist-motion, humanizer, headroom, claude-mem, subagent-library, task-observer, hidden-unicode, web-search, defenso, github, github-actions, code-review, security-master.

### SuperClaude `/sc:*` commands (31 total, in `~/.claude/commands/sc/`)
agent, analyze, brainstorm, build, business-panel, cleanup, design, document, estimate, explain, git, help, implement, improve, index, index-repo, load, pm, README, recommend, reflect, research, save, sc, select-tool, spawn, spec-panel, task, test, troubleshoot, workflow.

## b) Phase map

**P0 — Intel & Ideation**
- Must: `web-search` skill / `sc:research` / `sc:brainstorm` (problem-statement + CAT domain research), `project-kickoff` skill (kickoff report), NotebookLM MCP (organize past CAT hackathon problem statements/PDFs), graphifyy (index any provided problem-statement PDFs fast).
- Optional: context7 (once tech stack picked, pull current docs), huggingface (if domain needs pretrained models — needs auth).

**P1 — PPT round**
- Must: Gamma MCP (`generate`/`generate_from_template`) for the actual deck — fastest path to a polished PPT.
- Optional: Canva MCP (needs auth) as alternate deck tool; `anthropic-skills:pptx` skill if Gamma unavailable; Figma MCP for custom diagram slides.

**P2 — Architecture & folder setup**
- Must: `sc:design`, `system-architect`/`backend-architect` agents, `enterprise-architecture` skill, `sc:index-repo`/graphify to scaffold and later navigate the repo cheaply.
- Optional: `supabase` MCP/CLI if backend DB decided early.

**P3 — Build**
- Frontend web: `frontend-design` skill, `ui-design-master`, `ui-ux-pro-max`, `vercel` MCP+CLI+skills (nextjs, shadcn, deploy), `figma` MCP for design-to-code.
- Mobile: `Andriod_app`, `Andriod_APPUI`, `ios-app-development`, `iosui`, `react-native-best-practices`, `npx expo` CLI (confirmed working).
- Backend: `master-backend-builder` skill, `backend-architect` agent, `supabase` MCP (Postgres/auth/storage), `firebase` plugin (alt backend/push), `vercel-functions`/`create-a-backend`.
- AI/GenAI: `claude-api` skill (model IDs/pricing — do not guess), Higgsfield/OpenArt (demo media gen), context7 (SDK docs).
- Data/telematics dashboards: `dataviz` skill, `data:build-dashboard`, `data:create-viz`.

**P4 — QA/Security/Perf**
- Must: `defenso` MCP (`guard_code` after any auth/DB/env code — per CLAUDE.md standing rule), `security-review`/`security-master` skills, `code-review` skill/plugin, `performance` skill, `quality-engineer` agent.
- Optional: `vercel:performance-optimizer` agent if deployed to Vercel.

**P5 — Demo video & final pitch**
- Must: Higgsfield (`generate_video`, `shorts_studio_*`) or agent-browser (screen-recorded walkthrough) for demo video; Gamma for final pitch deck.
- Optional: `neobrutalist-motion`/`ui-design-master` motion pack for a polished pitch-page artifact.

**Fix 5 — phase-number correction:** the P0–P5 labels used in this phase map (above) do not match CHECKLIST.md's phase numbering and would mis-map tools to phases in a fresh session. Kept above for the tool groupings, but read phase numbers through this mapping instead:

| This file's label | Maps to CHECKLIST.md phase |
|---|---|
| P0 — Intel & Ideation | P0 — Orchestration setup (research) / P1 — Problem understanding (once the brief arrives) |
| P1 — PPT round | P2 — PPT round |
| P2 — Architecture & folder setup | P3 — Architecture and repo setup |
| P3 — Build | P4 — Build |
| P4 — QA/Security/Perf | P5 — Quality |
| P5 — Demo video & final pitch | P6 — Submission |

CHECKLIST.md's P0–P6 numbering is authoritative; treat this file's P0–P5 labels as tool-grouping headings only, not phase numbers to plan against.

**Cross-cutting**
- Session memory: `claude-mem`, `superpowers:consolidate-memory`/`import-memory`, project-kickoff's "living memory" scaffold.
- Validation: `superpowers:verification-before-completion`, `superpowers:systematic-debugging`, `run` skill (launch+screenshot the actual app before declaring done).
- Token optimization: `rtk` (prefix CLI calls), `graphifyy` (`/graphify` queries instead of repeated grep/read), `--uc` flag on `/sc:*` commands, `token-optimization-techniques` skill files for the full playbook.

**Fix 6 — skill namespace correction:** "`superpowers:consolidate-memory`/`import-memory`" above is the wrong namespace. The correct skill names are **`anthropic-skills:consolidate-memory`** and **`anthropic-skills:import-memory`**.

## c) Gaps (missing / needs auth)

| Gap | Fix |
|---|---|
| GitHub CLI (`gh`) not installed | `winget install --id GitHub.cli` (then `gh auth login`) |
| `graphify` CLI shim not on PATH | Use `graphifyy` (pip pkg, confirmed installed) — invoke via its own entrypoint or `/graphify` skill, not a bare `graphify` command. **Correction (fix 4):** the verified invocation is `python -m graphify <cmd>` — use that, not a vague "its own entrypoint". |
| Expo MCP not authenticated (added, fix 8) | Authorize via claude.ai connector settings — was omitted from the original gaps list |
| Vercel MCP/CLI not authenticated | `vercel login` (CLI) and authorize the Vercel connector via claude.ai connector settings |
| Canva MCP not authenticated | Authorize via claude.ai connector settings |
| huggingface MCP not authenticated | Authorize via claude.ai connector settings (only needed if using HF models) |
| GitHub MCP (claude.ai connector) not authenticated | Authorize via claude.ai connector settings (separate from `gh` CLI) |
| n8n MCP connection failed (`ENDPOINT_NOT_FOUND`) | Check `https://shlokgoenka1604.app.n8n.cloud` is reachable/URL correct in MCP config; likely not needed for this hackathon |
| telegram plugin MCP connection failed | Non-blocking, skip unless a Telegram bot demo is planned |
| task-master-ai / defenso need env keys | Confirm `GROQ_API_KEY`/`GOOGLE_API_KEY` and `DEFENSO_TOKEN` are set in the actual environment (values are placeholders in the config file, not verified live) |

## d) Skills worth project-specific modification

- **project-kickoff**: run once now with the CAT hackathon brief so its generated Kickoff Report and folder scaffold match this specific timeline (P0–P5) instead of a generic project.
- **token-optimization-techniques / claude-md-rules.md**: add a hackathon-specific rule to always use `rtk` + graphify before large repo reads, since context budget is tighter under hackathon time pressure.
- **dataviz**: if the problem statement turns out telematics/IoT-dashboard shaped, pre-load its palette/chart-type reference now so P3 dashboard work doesn't re-derive it.
- **claude-mem / consolidate-memory**: configure to checkpoint after each phase (P0→P5) so a context reset mid-hackathon doesn't lose architecture decisions.
- **run** skill: once the repo exists, give it the actual dev-server launch command (npm/expo) so "show me it working" doesn't require re-discovery each time.
