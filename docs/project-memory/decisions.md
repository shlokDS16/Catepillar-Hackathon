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

## 2026-09-23 — D7: Providers finalised (Shlok)
- LLM: Groq primary + Groq backup key; no Gemini (Shlok: add another Groq backup later if needed). TTS: Sarvam (2 keys, ₹100 each), alert audio pre-generated once.
- Twilio budget guard: ~$5.90 trial balance ≈ 100 India-minutes; all rehearsals use a dry-run flag; live calls only in scheduled tests + demo.

## 2026-09-23 — D8: No organiser dataset exists — fields only (Shlok)
- Organisers gave FIELD LISTS only (telemetry: 9 fields; task-time: Task ID, Task type, Weather, Operator skill, Machine age, Estimated time, Actual time) and asked teams to go beyond: build an enterprise-level dataset or pick an open one that serves the requirements.
- Decision: our own enterprise dataset. Organiser fields are an exact, named subset (exported as organiser-format CSVs); extended with ISO 15143-3 / AEMP 2.0 telematics fields, J1939/Cat-style fault codes, PostGIS sites/zones/GPS.
- Realism anchors: REAL historical weather from Open-Meteo archive for the 3 real site coordinates (Nagpur, Jharkhand, Himachal) over the 90 days; productivity baselines from Cat Performance Handbook factors; human-factor effects from research 11 §5.3; hidden generator effects + held-out anomaly labels.
- No open construction-telemetry dataset fits as-is (research 11 §2); Scania APS/Component X only as a structural reference, not ingested.
- "Estimated time" semantics: the planner's naive estimate (what our ETA model must beat).

## 2026-09-23 — D9: Groq keys are from two different accounts — compliance issue
- Groq AUP (effective 2025-10-15): prohibits circumventing rate limits "including by registering multiple accounts or orchestrating usage between multiple organizations".
- Therefore the app must NOT auto-fail-over from Shlok's account to Aryan's account on 429. Pending Shlok's choice: (a) app uses one account only; second account used only by its owner for local dev; (b) + Groq Developer (paid) tier on the app's account for demo headroom; (c) + a non-Groq fallback (Gemini free).

## 2026-09-23 — D9 (resolved): Groq both accounts + Gemini (Shlok's decision)
- Shlok chose to use both Groq accounts and provided a Gemini free key (verified). Chain: Groq A → Gemini → Groq B on 429/5xx, env-configurable, provider logged per request.
- Risk acknowledged: Groq AUP prohibits orchestrating multiple accounts to circumvent rate limits; Gemini placed before account B to minimise cross-account use.

## 2026-09-23 — D10: Training = feedback-based simulation first (Shlok: "take example of McKinsey Solve")
- Replay has 4 phases: Brief → Investigate (Solve-style evidence cards, relevance + order scored) → Decide (timed sequence) → Debrief (scores, process trace vs ideal, rule, animated re-enactment of his own event).
- Micro-lessons = interactive cards + quiz with instant feedback. Google Flow videos demoted to P1 optional (fallback: public-domain OSHA/NIOSH clip). PS "e-learning videos" answered by the auto-generated re-enactment + optional clips.

## 2026-09-23 — D11: G2 decisions approved (Shlok)
- Subagent lane amendment approved (Track B: scripts/ generator + corpus + ask function run by subagents in parallel with the main lane).
- Both tracks' cut lists approved as written in backend-tasks.md / frontend-tasks.md.
- Proximity radar folded into the map rings (departure from spec M2 cockpit mini-radar) approved.
- H0 setup authorised; vercel login done (account shlokds16).
- D11 addendum: UI decisions 2-4 in frontend-tasks.md (untimed Replay Brief; ink-only training urgency; collapsed provenance chips in Simple mode) accepted by default (orchestrator), Shlok may override.
