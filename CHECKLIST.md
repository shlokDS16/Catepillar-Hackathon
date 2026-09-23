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
- [x] P1.3 Spec v1 reviewed (founder PROMISING, judges 26/40, program READY-WITH-CHANGES) → spec v2 written
- [x] P1.3b .env.example written (verification by scout 12 pending)
- [x] P1.4 Final plan presented; Shlok decisions → spec v3
- [x] P1.6 Research 15 (Groq/voice), 16 (multimodal RAG)
- [ ] P1.5 Shlok adds modifications / improvements
- [x] **Gate P1 (G1)**: approved with changes 2026-09-23 (D6)

## P2 — Review pitch (presentation round already done; this is the review-1 deck + demo script, runbook T+20–22)
- [ ] P2.1 Storyline + slide outline against the supplied template
- [ ] P2.2 Visuals (architecture diagram, mockups, charts)
- [ ] P2.3 Build deck (Gamma / pptx / Canva — per Shlok's instructions)
- [ ] P2.4 Red-team review as a Caterpillar judge; humanizer pass on copy
- [ ] **Gate P2**: validator PASS · Shlok approves · submitted

## P3 — Architecture and repo setup
- [x] P3.1a Backend design v1 (Option C: DB owns time & truth) → docs/architecture/
- [x] P3.1b G2 reviews: backend-reviewer FAIL (21 findings), program-architect READY-WITH-CHANGES
- [x] P3.1c Backend design rev 3+ (all findings dispositioned) + frontend plan v2 (docs/design/*)
- [x] **Gate G2**: FAIL → fixes → FAIL (H0 gaps) → fixed → PASS-WITH-FIXES; Shlok approved D11
- [ ] P3.2 Folder structure (researched) scaffolded; git + GitHub remote
- [ ] P3.3 Skills tailored per phase (copies under .claude/skills/, originals untouched)
- [ ] P3.4 Task breakdown (task-master or writing-plans) with subtasks
- [ ] **Gate P3**: validator PASS · Shlok approves

## P4 — Build (Fable 5.1; two tracks + integrator, docs/sessions/build-protocol.md)
Only the integrator ticks this section, from docs/sessions/track-b.md and track-f.md at each merge.
- [x] H0 setup: vercel login OK (shlokds16), worktrees track-b/track-f, .env + apps/web/.env.local copies, pnpm install, web build green
- [~] H0 deploy smoke test on the Android phone (tasks B0b + F01's vibration/sound test page): deployed, awaiting Shlok's phone check at /haptics-test.html
### Track B (docs/architecture/backend-tasks.md)
- [ ] B0 → … (tick each task ID as merged; full list in backend-tasks.md)
- [x] B0 project link, function config, secrets, Vault, COMMIT probe PASS, Pinecone spotter-kb, smoke 11/11: merged 455b317
- [x] B0b Vercel: project shlok-goenkas-projects/spotter (Next.js, root apps/web), 3 prod env vars, git-connected; production https://spotter-five-brown.vercel.app (200)
- [x] B1 contracts v1.0.0 frozen (tag contracts-v1.0.0), SQL seed generator, 93 fixtures as @cat/shared/fixtures: merged f9f4a3f; shared vitest 113 + scripts green, tsc shared/scripts/web exit 0, web build green
### Track F (docs/design/frontend-tasks.md)
- [ ] F01 → … (tick each task ID as merged; full list in frontend-tasks.md)
- [x] F01 tokens, fonts, Plate/Button/Chip, pictograms, /dev/kit, haptics-test page: merged 4393f2c (favicon fix 73c6e58), web build green
- [x] F02 cookie locale en/hi/ta, LanguageSheet, dialog Sheet: merged a4324ba, web build green (routes now dynamic: locale cookie)
- [x] F03 op/fm shells, strip, nav + rail, SOS/Ask slots, z-layers: merged (see git log), build green; deviation: sheets non-modal so SOS stays tappable
- [x] F04 alert tiers, useAlertFeedback, selectors, takeover + banner: merged 7087ab9; vitest 15/15 (log said 20), typecheck + build green
- [x] F05 SOS hold-to-arm + SOS sheet on fixtures: merged d1bcd33, build green, deployed for the review; KIT_PUBLIC=1 set in Vercel production so /dev/kit serves (revert after the review)
### Showable milestones (build-protocol.md)
- [ ] Showable 1 (≈ H3-4): fixture-driven cockpit, alerts, SOS, map, EN/HI deployed
- [ ] Showable 2 (≈ H8-9): + Replay 4 phases, FM inbox + ledger UI
- [ ] Showable 3 (≈ H11-12): live data, real Telegram + Twilio (Shlok's OK)
### Integration checkpoints
- [x] Contracts frozen and merged to main (contracts-v1.0.0, f9f4a3f)
- [ ] Track F switched from the fixture adapter to live data
- [ ] G3 checkpoint (runbook): preview deploy + judge-simulator + phase-validator
- [ ] graphify update after each milestone
- [ ] **Gate P4**: feature-complete against spec, demo path works end to end

## P5 — Quality
- [ ] Tests, security (defenso guard_code / scan_repo), performance, accessibility, mobile QA
- [ ] **Gate P5**: validator PASS

## P6 — Submission
- [ ] Deploy (web) / build (APK or Expo), README, demo video, final pitch deck
- [ ] **Gate P6**: dry-run of the full demo · Shlok approves · submitted
