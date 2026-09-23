# Master plan (v1, 2026-09-23) — awaiting Shlok's approval

## Winning thesis (from validated research, docs/research/04)
1. It's a hiring filter. Every slide and every line of code must be something Shlok can defend
   in an interview. We build less, understand all of it, and prove it with metrics.
2. Speak Caterpillar: map the solution to a Cat product line (VisionLink/Helios telematics,
   Cat Detect, condition monitoring, Cat Central, remanufacturing), a named user (site manager,
   dealer technician, fleet owner) and a quantified outcome (downtime hours, cost, safety incidents).
3. Round 1 is a harsh skim (<5 % advanced in 2025). Lead with a quantified problem, one clean
   architecture diagram, a real UI mock and **proof**: a working model or prototype screenshot.

## Agent roster
| Role | Agent type | Model | When |
|---|---|---|---|
| Orchestrator (me) | main session | Opus 5.5 → Fable 5.1 in P4 | always |
| Research scouts (×3-4, parallel) | deep-research-agent | sonnet | P1, P2 |
| Founder-validator ("billionaire services founder") | general-purpose, persona prompt | opus | after every research batch and idea shortlist |
| Phase validator (gate) | general-purpose / self-review | opus | end of every phase |
| Judge simulator (Caterpillar Digital panel) | business-panel-experts | opus | P1.4, P2.4, P6 |
| Architects (3 framings) + red team | system-architect | opus | P3.1 |
| Implementer | main session | Fable 5.1 | P4, one task at a time |
| Coder-reviewer | feature-dev:code-reviewer / superpowers:requesting-code-review | opus | after every P4 task |
| Security / quality / perf | security-engineer, quality-engineer, performance-engineer | sonnet | P5 |

## Phase → skills / tools
| Phase | Must use | Optional |
|---|---|---|
| P1 Understand + ideate | markitdown CLI (brief), web-search / sc:research, agent-browser `read`, superpowers:brainstorming, product-management:product-brainstorming, NotebookLM (grounded Q&A over sources) | patent-idea-generator (novelty angle), data:explore-data (if a dataset is supplied) |
| P2 PPT | Gamma MCP (fast, themed) or anthropic-skills:pptx (exact template), figma:figma-generate-diagram / Mermaid for architecture, ui-ux-pro-max for mockups, dataviz for charts, humanizer on all copy | Canva (connected), Higgsfield / OpenArt for hero visuals |
| P3 Architecture + setup | engineering:system-design, enterprise-architecture, sc:design, superpowers:writing-plans, task-master (≥10 tasks), github skill + gh CLI | context7 (version-accurate docs) |
| P4 Build | superpowers:subagent-driven-development, test-driven-development, frontend-design + ui-design-master + vercel:shadcn (web), vercel:nextjs / ai-sdk / ai-gateway, Andriod_app + react-native-best-practices (mobile, only if required), master-backend-builder / supabase (backend), huggingface-skills (models), graphify | vercel:workflow, firebase |
| P5 Quality | code-review, superpowers:verification-before-completion, defenso guard_code / scan_repo, security-review, agent-browser dogfood QA, design:accessibility-review, vercel:performance-optimizer | sc:test |
| P6 Submit | vercel:deploy, README via technical-writer, demo video (Remotion via ui-design-master, or Higgsfield), final deck via P2 stack, judge-simulator dry run | — |
| Cross-cutting | rtk, graphify, claude-mem, token-optimization-techniques, End-of-Session Routine, RESUME.md | claude-monitor / ccusage |

## Skill tailoring (P3.3, after the problem statement is known)
Copies go in project `.claude/skills/`; originals stay untouched. Planned edits:
- **project-kickoff** → "cat-hackathon-kickoff": phases replaced by P1-P6 and our gates, Caterpillar judging lens baked in.
- **token-optimization-techniques** → add project rules (markitdown CLI not MCP, `python -m graphify`, subagent caps).
- **frontend-design / ui-ux-pro-max** → Caterpillar-adjacent design tokens (industrial yellow/black, high-contrast, glove-friendly touch targets, sunlight-readable dashboards) without copying Cat trademarks.
- **dataviz** → telematics palette and chart conventions (fleet health, downtime, alerts).
- **run** → this repo's launch commands once they exist.
- **Validator prompts** → saved in `claude/prompts/validator-*.md` so every gate uses the same rubric.

## Gaps Shlok must close (commands in docs/research/02-tool-inventory.md)
- `gh` CLI missing: `winget install GitHub.cli` then `gh auth login`
- `uv` missing (only needed for a Python ML service): `winget install astral-sh.uv`
- GitHub connector auth failing: re-authorise in claude.ai connector settings
- Hugging Face connector (if we use hosted models): authorise in claude.ai connector settings
- task-master / defenso env keys are placeholders: needed only if we use them (details in 02)
- Expo account (only if mobile): `npx expo login`

## Session policy
- Switch sessions at each phase boundary or ~60 % context, whichever first. I'll say "switch now"
  and print the RESUME.md prompt after running the End-of-Session Routine.
- Before P4: Shlok changes the session model to Fable 5.1 in the app's model picker.

## Pre-work we can do before the statement drops (needs approval)
1. Pitch skeleton + reusable slide master (Caterpillar-appropriate theme) so P2 is content-only.
2. Starter repo: Next.js + shadcn + deploy pipeline on Vercel, empty but green, so P4 day 1 is features.
3. Domain primer on Cat telematics / predictive maintenance / Cat Detect in docs/research/05, so ideation is fast and correct.
