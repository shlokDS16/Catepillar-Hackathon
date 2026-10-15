# STATE (source of truth; only the integrator/orchestrator edits this file)

> **RESUMED 2026-10-11 (Shlok: "continue building").** Single-folder mode per AGENTS.md (work on
> branch tracks in this repo; old ../spotter-track-* worktrees are read-only history). Supabase
> restored 2026-10-11 with all 7 migrations intact; new SUPABASE_ACCESS_TOKEN in .env (project
> linked, CLI 2.102.0 — Smart App Control was blocking it, Shlok turned it off).
> **Track F merged 2026-10-11 (main 131d301):** F06-F08 + all review fixes; independent re-verify
> APPROVED 2026-10-12. **Track B merged 2026-10-12 (main 7e393ec):** B4 002/002b + 002c review
> fixes + extended 004 tests (sqltest 5/5, vitest 125/125; in-session review PASS, independent
> re-verify due at the push gate with Track F's). **F12 MapView merged 2026-10-12 (main 1e6126d):**
> map screens, Guardian rings, plan-first fallback — **Showable 1 is code-complete on main**; it
> needs the phase-validator check and a deploy. Next: B5 (ledger) and Replay lanes. Subagent quota
> has been flaky all day; lanes fall back to in-session work with the independent review deferred
> to the push gate, disclosed each time.
> **2026-10-12 gate run (all three independent reviews landed):** F12 code review CHANGES REQUIRED
> (8, 2 High) and Showable 1 validation FAIL (4 blockers) — all applied in de2952d. backend-reviewer
> FAILED 002c on a **security BLOCKER**: the dispatch kick parked the Vault service key in
> `net.http_request_queue`, readable by every signed-in role; the queue's PUBLIC grant belongs to
> `supabase_admin` and a `postgres` revoke is silently ignored, so **migration 002d removes the
> secret from the request instead** (verified live). Standing constraint: nothing secret may transit
> pg_net on this project; B15's dispatch function must authenticate the work, not the caller.
> Also added: `.claude/agents/token-optimizer.md` (measured context-efficiency playbook) and rtk
> wiring in CLAUDE.md.

- **Updated:** 2026-09-23, session 2 (Opus 5.5, integrator)
- **Product:** Spotter, an operator companion for Cat machines (spec v3 + D10: docs/specs/idea.md)
- **Phase:** P4, BUILD. Gate G2 = PASS-WITH-FIXES (docs/gates/G2.md, the re-run's H0 fixes applied
  2026-09-23). Decisions D1-D12 are final (D4 approved in session 2).
- **Sessions:** A = integrator (Opus, worktree `.claude/worktrees/caterpillar-spotter-resume-c02a8b`,
  merges via `git -C <main folder>`, D12), B = Track B (Fable 5.1, ../spotter-track-b),
  F = Track F (Fable 5.1, ../spotter-track-f). Prompts in RESUME.md; rules in docs/sessions/build-protocol.md.
- **Live URL:** https://spotter-five-brown.vercel.app (Vercel project shlok-goenkas-projects/spotter, root apps/web,
  git-connected: EVERY push to main is a production deploy, so push main only when the build is green).
- **In flight:** Track B: B0 merged (455b317); B1, B2 merged (contracts frozen; migration 001 applied); B4 (migration 002: events, emit_event, fan-out, alerts, dispatches, my_snapshot) in progress. Track F: F01-F05 merged to main; next F06 hero, F07 fixtures/DataPort (switch to @cat/shared/fixtures), F08 Home, F12 map toward
  **Showable 1** (fixtures, ≈ H3-4). Track F commits on `claude/spotter-track-f-a12198` and
  fast-forwards `track-f` (the app's worktree guard blocks edits in ../spotter-track-f); accepted.
- **Next action (integrator):** watch the track logs → merge contracts → merge Track F → deploy
  Showable 1 preview and send Shlok the URL. Reason: Shlok needs a showable demo early (other teams
  show hard-coded dashboards).
- **Mobile (after review 1, D4):** load Shlok's skills ios-app-development + iosui (iOS/TestFlight) and
  Andriod_app + Andriod_APPUI (Android APK), adapted to Spotter. Credentials: .env.example "Mobile" section.
- **Review 1 done (2026-09-23).** SOS_LIVE and KIT_PUBLIC removed from Vercel production; /api/sos-demo verified dry_run, /dev/kit 404. Twilio/Telegram vars stay (unused in dry-run). Next milestone: Showable 2.
- **Shlok actions during build:** B24c SOP review (~20 min, when Track B asks); OK before any live Twilio call.
- **Verified env (2026-09-23):** Supabase (Mumbai, active), Groq A+B, Gemini, Pinecone, Voyage,
  LlamaCloud, Twilio (trial, $5.90, both demo phones verified), Telegram (@Spotter125Bot, chat
  reachable), Sarvam ×2 present. Pinecone index `spotter-kb` is not created yet (task B0).
- **Key insight:** this is a hiring filter, so every line must be defensible. Complement Cat, never
  copy it. Replay (Solve-style simulation of the operator's own event) is the headline.

## Key files
- Spec: docs/specs/idea.md · decisions D1-D10: docs/project-memory/decisions.md
- Brief: docs/brief/01-05 · UI framework: docs/design/ui-framework.md
- Backend design: docs/architecture/ (ADR-001, data-model, event-pipeline, api-contracts, backend-tasks)
- Frontend design: docs/design/ (visual-language, interaction-map, screens, frontend-tasks)
- Build protocol: docs/sessions/build-protocol.md · track logs: docs/sessions/track-b.md, track-f.md, handoff.md
- Gates: docs/gates/ · research: docs/research/01-16 · video brief (P1): docs/media/video-brief.md
- Agents: .claude/agents/ (ui-ux-lead, backend-lead, backend-reviewer, code-reviewer, founder-validator,
  phase-validator, judge-simulator, program-architect)
- Code: apps/web (Next.js 16), apps/mobile (Expo SDK 57, after review 1), packages/shared (@cat/shared)
