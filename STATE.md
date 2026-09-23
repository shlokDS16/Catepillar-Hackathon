# STATE (source of truth; only the integrator/orchestrator edits this file)

- **Updated:** 2026-09-23, session 2 (Opus 5.5, integrator)
- **Product:** Spotter, an operator companion for Cat machines (spec v3 + D10: docs/specs/idea.md)
- **Phase:** P4, BUILD. Gate G2 = PASS-WITH-FIXES (docs/gates/G2.md, the re-run's H0 fixes applied
  2026-09-23). Decisions D1-D12 are final (D4 approved in session 2).
- **Sessions:** A = integrator (Opus, worktree `.claude/worktrees/caterpillar-spotter-resume-c02a8b`,
  merges via `git -C <main folder>`, D12), B = Track B (Fable 5.1, ../spotter-track-b),
  F = Track F (Fable 5.1, ../spotter-track-f). Prompts in RESUME.md; rules in docs/sessions/build-protocol.md.
- **In flight:** Track B session started (redirected from an app-made worktree to ../spotter-track-b);
  no commits yet. Track F session NOT started yet (Shlok to open it with prompt F from RESUME.md).
  Targets unchanged: Track B from B0; Track F from F01 toward **Showable 1** (fixtures, ≈ H3-4).
- **Next action (integrator):** watch the track logs → merge contracts → merge Track F → deploy
  Showable 1 preview and send Shlok the URL. Reason: Shlok needs a showable demo early (other teams
  show hard-coded dashboards).
- **Mobile (after review 1, D4):** load Shlok's skills ios-app-development + iosui (iOS/TestFlight) and
  Andriod_app + Andriod_APPUI (Android APK), adapted to Spotter. Credentials: .env.example "Mobile" section.
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
