# Decision Index

One line per significant decision, newest last. Full reasoning lives in the ADR.

| Date | Decision | ADR | Status |
|---|---|---|---|

## 2026-09-23 — D1: Orchestration model
- Files STATE.md / CHECKLIST.md / RESUME.md + docs/project-memory are the source of truth across sessions; no /compact.
- Phase gates: validator agent (opus) + Shlok approval before each next phase.
- Coding model: Fable 5.1 (`claude-fable-5-1`); everything else Opus 5.5.
- Default repo shape: single Next.js app (+ optional FastAPI ML service; Expo only if mobile required). Monorepo tooling only if web+mobile share code. Rejected: Turborepo/Nx by default (overhead judges never see).

## 2026-09-23 — D2: Deliverables and sequencing (Shlok)
- Build a website AND a mobile app. Website first, then replicate as an app.
- Mobile shown on real phones via iOS TestFlight + Android build; no store publishing.
- ~24 h to first review: target = website complete by then.
- UI follows Shlok's ChatGPT-derived UI framework (docs/design/ui-framework.md, pending), written by the `ui-ux-lead` agent.
- Backend orchestrated by `backend-lead`, validated by `backend-reviewer`; all code supervised by `code-reviewer`.
- Supersedes D1's repo default: web + mobile share code → pnpm workspace justified (final shape after doc 07).

## 2026-09-23 — D3: Draft product thesis (pending problem statement)
- Learning layer behind VisionLink + Cat AI Assistant; north-star KPI = tip recurrence. See docs/specs/thesis-draft.md.
- Rejected as differentiators (Cat already has them): offline voice assistant, operator scorecard, generic e-learning library.
- Open: founder-validator recommends cutting native app for first 24 h; awaiting Shlok (consistent with D2 web-first).

## 2026-09-23 — D4 (PROPOSED, awaiting Shlok): Web only until review 1
- First 24 h: one Next.js web app, demo-critical path first. Mobile (Expo, TestFlight, APK) starts after review 1, reusing @cat/shared.
- Why: founder-validator + 24 h budget; consistent with D2 "website first". Expo scaffold kept (already green) so mobile starts instantly.

## 2026-09-23 — D5: Supabase region Mumbai (ap-south-1); GitHub push via git credential manager, gh CLI not required (Shlok).

## 2026-09-23 — D6: G1 approved with changes (spec v3)
- UI: A "Site Signage". Chatbot: advanced multimodal role-based RAG on Pinecone, P0. LLM: Groq (multiple keys + fallback), replacing Anthropic + Sarvam. Twilio: existing trial (~$5). Team: two people, one laptop.
- Adopted teammate improvements: scenario engine + events table as the spine, hidden-effect generator, motion lock, PPE override, alert budget, canonical ledger + external Merkle root, STRIDE slide, privacy by design.
- Rejected: none. Open: TTS provider for Hindi (research 15), Pinecone vs Voyage embeddings (research 16), sample dataset file pending.
