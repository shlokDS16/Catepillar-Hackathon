# Master checklist

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
Each phase ends with a **Gate**: validator agent verdict (PASS/FAIL + evidence) and Shlok's approval.

## P0 — Orchestration setup (this session)
- [x] P0.1 Project OS scaffold (CLAUDE.md, claude/, docs/)
- [x] P0.2 STATE.md, CHECKLIST.md, RESUME.md
- [x] P0.3 Hackathon intel research → docs/research/01-hackathon-intel.md
- [x] P0.4 Tool/skill/plugin inventory + phase map → docs/research/02-tool-inventory.md
- [x] P0.5 Session-persistence + folder-framework research → docs/research/03-persistence-and-structure.md
- [x] P0.5b Validator gate on research → docs/research/04-validator-gate-P0.md: PASS-WITH-FIXES (fixes applied)
- [x] P0.6 Master plan presented to Shlok
- [x] **Gate P0**: validator PASS-WITH-FIXES · Shlok approved master plan (2026-09-23)

## PW — Pre-work (before problem statement)
- [x] PW.1 Project agents defined (.claude/agents: ui-ux-lead, backend-lead, backend-reviewer, code-reviewer, founder-validator, phase-validator, judge-simulator)
- [x] PW.2 Domain primer: 05 Cat operator ecosystem, 06 AI training SOTA, 07 offline/mobile feasibility
- [x] PW.3 Founder-validator pass on 05-07 → docs/research/08-founder-review.md (PROMISING; corrections applied to 05/06; thesis → docs/specs/thesis-draft.md)
- [x] PW.4 Starter repo: pnpm workspace, apps/web (Next.js 16 + Tailwind 4) builds green, apps/mobile (Expo SDK 57) expo-doctor 21/21 + Android bundle OK, packages/shared (zod). Deferred to build: shadcn, tokens, Serwist offline (verify Next 16 compat on day 0)
- [x] PW.5 Pitch skeleton for first review (docs/pitch/review-1-outline.md)
- [ ] PW.6 Accounts: gh auth login, vercel login, eas login (Shlok)
- [x] PW.7 Gate fixes: runbook, STATE refresh, D4, ui-framework placeholder, master-plan status
- [x] **Gate PW**: 1st pass FAIL (2 blockers) → fixes applied → re-check PASS-WITH-FIXES (docs/gates/PW.md)

## P1 — Problem understanding (starts when problem statement arrives — follow docs/specs/ps-arrival-runbook.md)
- [x] P1.1 Ingest brief (markitdown → disk → slices); extract judging criteria, deliverables, deadlines
- [x] P1.2 Multi-pass research fan-out (docs/research/10-14; 12 final compile pending) (domain, users, Caterpillar products, competitors, data sources)
- [~] P1.3 Spec v1 docs/specs/idea.md (Spotter) under review: founder, judges, program-architect → docs/gates/G1-*.md
- [ ] P1.4 Idea longlist → scored shortlist (judge criteria × feasibility × wow × Caterpillar fit)
- [ ] P1.5 Shlok adds modifications / improvements
- [ ] **Gate P1**: idea frozen, written to docs/specs/idea.md

## P2 — Review pitch (presentation round already done; this is the review-1 deck + demo script, runbook T+20–22)
- [ ] P2.1 Storyline + slide outline against the supplied template
- [ ] P2.2 Visuals (architecture diagram, mockups, charts)
- [ ] P2.3 Build deck (Gamma / pptx / Canva — per Shlok's instructions)
- [ ] P2.4 Red-team review as a Caterpillar judge; humanizer pass on copy
- [ ] **Gate P2**: validator PASS · Shlok approves · submitted

## P3 — Architecture and repo setup
- [ ] P3.1 Architecture options (3 framings) + red team → ADR-001
- [ ] P3.2 Folder structure (researched) scaffolded; git + GitHub remote
- [ ] P3.3 Skills tailored per phase (copies under .claude/skills/, originals untouched)
- [ ] P3.4 Task breakdown (task-master or writing-plans) with subtasks
- [ ] **Gate P3**: validator PASS · Shlok approves

## P4 — Build (session model switched to Fable 5.1)
- [ ] P4.x Tasks from P3.4, one at a time; coder-reviewer after each
- [ ] graphify update after each milestone
- [ ] **Gate P4**: feature-complete against spec, demo path works end to end

## P5 — Quality
- [ ] Tests, security (defenso guard_code / scan_repo), performance, accessibility, mobile QA
- [ ] **Gate P5**: validator PASS

## P6 — Submission
- [ ] Deploy (web) / build (APK or Expo), README, demo video, final pitch deck
- [ ] **Gate P6**: dry-run of the full demo · Shlok approves · submitted
