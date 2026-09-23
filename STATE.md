# STATE (source of truth; only the integrator/orchestrator edits this file)

> **PAUSED 2026-09-23 (Shlok).** The team did not proceed past review 1; Spotter continues later as a
> side project. On resume: read the final lines of docs/sessions/track-b.md and track-f.md (each track
> was asked to leave a WIP commit + "where I stopped" line), then merge in protocol order.
> Resume points: Track B mid-B4 (migration 002 already applied to Supabase, reviews pending; realtime
> partitions only through 26 Sep, re-run scripts/b0/realtime-wake.ts first). Track F mid-F06/F07
> (fixture adapter, provenance, audio). Showable 1 still needs F06-F08 + F12.
> Live site stays up (dry-run SOS). Vercel production still holds Twilio/Telegram secrets (unused in
> dry-run); remove them if the project is abandoned.

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
