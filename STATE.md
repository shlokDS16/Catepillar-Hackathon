# STATE (source of truth; only the integrator/orchestrator edits this file)

- **Updated:** 2026-09-23, session 1 (Opus 5.5, orchestrator)
- **Product:** Spotter, an operator companion for Cat machines (spec v3 + D10: docs/specs/idea.md)
- **Phase:** P3, gate G2 (build plan). First pass FAILED on launch readiness (docs/gates/G2.md);
  fixes in progress.
- **In flight:**
  - backend-lead: contract/task fixes (anomaly explanation + ₹ cost, Sarvam audio batch task,
    one analytics chart, replay score drift, the assumed-fields registry, UI-17 to UI-22 owners, the
    RAG corpus task, the dependency graph, tamper-evident wording).
  - Orchestrator (done): build protocol (docs/sessions/build-protocol.md), RESUME prompts B/F,
    CHECKLIST P4 track sections, the spec demo steps 4-5.
- **Next action:** once backend-lead finishes → ui-ux-lead aligns frontend-tasks.md (re-adds the
  analytics chart, anomaly explanation UI, audio manifest) + backend-reviewer re-checks rev 3 worker
  procedure → phase-validator re-runs G2 → Shlok approves G2 → H0 setup per build-protocol.md →
  "Switch now" (two Fable 5.1 sessions, prompts B and F in RESUME.md). The orchestrator stays open as
  integrator. Reason: rule 1 + G2 FAIL.
- **Decisions for Shlok at G2:** the subagent lane amendment; the cut lists of both tracks; the proximity
  radar folded into the map rings.
- **Blocking H0 (Shlok):** `vercel login` (the token is invalid). Fallback: import the GitHub repo in
  the Vercel dashboard.
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
