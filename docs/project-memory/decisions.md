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

## 2026-09-23 — D4 approved (Shlok)
- D4 (web only until review 1) is final. Mobile (Expo, TestFlight, APK) starts after review 1, reusing @cat/shared.

## 2026-09-23 — D12: Integrator runs from its own worktree (Shlok)
- Session A works in `.claude/worktrees/caterpillar-spotter-resume-c02a8b` instead of the main folder. It merges into `main` with `git -C "<main folder>" merge ...`, because `main` stays checked out in the main folder. Docs changes are committed on the worktree branch, then fast-forwarded into main.
- Tracks stay in `../spotter-track-b` (track-b) and `../spotter-track-f` (track-f); only those folders have `.env`, `.env.local` and installs.

## 2026-09-23 — D13: Gemini model id gemini-3.6-flash (Track B B0, measured)
- `gemini-2.5-flash` returns 404 "no longer available to new users" on our key; the API's suggested replacement `gemini-3.6-flash` is listed for the key. B1 freezes `GEMINI_MODEL = "gemini-3.6-flash"`, env-overridable. Chain order unchanged (D9: Groq A → Gemini → Groq B).
- Also from B0: the role-level statement_timeout backstop (N4) is unavailable (`postgres` is not superuser); bounded work per step plus the 2-min role timeout carries the guarantee. COMMIT probe PASS, so the worker-procedure design stands.

## 2026-10-12 — D14: nothing secret transits pg_net (measured, forced)
- `net.http_request_queue` and `net._http_response` carry a PUBLIC grant made by `supabase_admin`, and schema `net` grants USAGE to `anon` and `authenticated`. The `postgres` role cannot revoke any of it: a revoke by a non-grantor is silently ignored (measured — the ACL is byte-identical after a revoke that reports success). Migration 002c's attempt was therefore a no-op hidden by `exception when others`.
- Consequence, found by the B5-era backend review: the dispatch kick was parking the Vault `supabase_secret_key` in that queue, where any signed-in user could read it.
- **Decision:** the queue is public, so nothing sensitive may enter it. Migration 002d sends `{dispatch_id}` with `Content-Type` only. Every future pg_net call carries no credential, and the receiving Edge Function authenticates the WORK — it loads the row with its own key, acts only while `status = 'queued'`, and stays idempotent (B15).

## 2026-10-12 — D15 (PROPOSED, awaiting Shlok): ledger export vs near-miss pseudonymity
- The Merkle root can only be reproduced from every row's exact canonical bytes, so `ledger_export` currently returns `operator_id` for near-miss (`non_punitive`) rows — the very rows data-model §2.10 hides from the fleet manager. Any FM who clicks Verify defeats the pseudonymity the near-miss mode promises operators.
- **Proposed:** `ledger_export` returns `entry_hash`, `prev_hash` and `seq` for EVERY row (enough to recompute the chain and the Merkle root, so "human-verifiable" survives intact) but the canonical field values only for rows the caller may see. A fleet manager can then still prove the ledger is unbroken and matches the published witness line; she simply cannot read the contents of a row she was never entitled to read. The cost is that she cannot prove a hidden row's content matches its hash — which is the correct trade, since that proof is exactly the disclosure we refuse.
- Alternative if Shlok prefers: leave export as is and treat the access gate as the control, recording that an FM verification necessarily discloses near-miss identities.

## 2026-10-12 — D16: incident severity scale 1-5 (B5, documented after the fact)
- B5 derives `incidents.severity` from the event tier: critical 5, warning 4, caution 2, info/none 1, with 3 reserved for the `incident.reported` fallback. No spec defined this scale; it is deterministic and hashed into the canonical entry, so it is recorded here rather than changed. `caution → 2` is currently unreachable (no `ledger = true` event type defaults to caution) and is kept for future types.

## 2026-11-12 - D-near-miss: the near-miss list is trainer-only and unattributed
- 003e-003g, after three reviews. `ledger_export` seals near-miss rows for the FM; `private.event_visible` keeps near-miss events off the FM, site and trainer routes (RLS, `my_snapshot`, broadcast); the trainer has no direct `incidents` read. `near_miss_list()` is trainer-only and returns (day, severity, incident_type) for sealed rows only: the stable pseudonym is withdrawn because one punitive row (visible to the FM with identity) ties it to a name, and seq/incident_id line up with the ledger export. NearMissListOut changes: breaking change to an RPC with no consumer, CONTRACTS_VERSION 1.0.0 to 2.0.0. Residual: the browser cannot recompute a sealed row's content hash (server `ledger_verify` does).

## 2026-11-12 — D14: Portal redesign direction (Shlok, AskUserQuestion)
- Inside portal (/op, /fm) moves to direction **B "Ink Frame"** (docs/design/portal-redesign-study.md §3): the landing's ink becomes the portal frame (status band + dock); the work surface stays dark-on-paper for sunlight; the Debrief plays on an ink "theatre". Plus from C: plain-word labels, [Listen] on every Debrief section, FM Inbox triage layout on mobile.
- Operator nav: 4 destinations (Map moves inside Safety) + SOS in a fixed dock slot (no floating SOS).
- Replay Decide: no right/wrong feedback per step; feedback only in the Debrief (training-guidelines §5, Solve-style measurement).
- Overturns/amends the six items in the study §5 (ink frame surface; mono for provenance captions and section labels; −0.03em tracking on Latin display; nav 5→4 + SOS dock; split Inbox on desktop; Debrief wording "Ideal"→"Safest", "Efficiency"→"Speed" for operators, contract field names unchanged). Supersedes D6's "Site Signage everywhere outside landing/Replay" for the portal frame; safety colours stay reserved for live danger.
- Build order (study §5): 1 chrome, 2 Debrief payoff, 3 learning loop (assignment list, lesson route), 4 FM, 5 QA.

## 2026-11-12 — D15: No calls (Shlok)
- No Twilio call, SMS, Telegram or SOS trigger by anyone (a friend's number is among the demo phones). DEMO_SUPERVISOR_PHONE removed from Vercel production.

## 2026-11-12 — D16: Near-miss privacy hardening (lead, after 3 Opus reviews)
- Migrations 003d-003g: sealed ledger rows export only {v, seq, prev_hash, non_punitive, sealed}+entry_hash; private.event_visible() governs events_read, my_snapshot and broadcasts; near_miss_list is trainer-only and returns (day, severity, type) for sealed rows; contracts 2.0.0. Accepted residual: a holder of both trainer and FM roles can align days with sealed ledger rows (no person revealed).
