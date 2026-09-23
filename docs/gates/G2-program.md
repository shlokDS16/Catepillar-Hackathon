# Gate G2: program-architect review of the backend plan

- **Date:** 2026-09-23 · **Reviewer:** program-architect (opus)
- **Inputs:** ADR-001, backend-options, backend-tasks, data-model, event-pipeline, api-contracts, measured against spec v3, the runbook and G1-program.
- **Verdict: READY-WITH-CHANGES.** I approve ADR-001 (Option C, "the database owns time and truth"). It fits the two-track split, and it takes Vercel off the critical path for webhooks. The delivery plan is not ready until issues 1-4 are fixed. That is about 1 h of document work, and it must be done before the build starts at T+3.

## 1. Issues (severity)
1. **BLOCKER: Replay and the Loop have no builder (silent drop of the leap).** The tables `replay_scenarios` and `lesson_assignments` exist, and so do the RPCs `replay_submit` and `lesson_assign`. No task writes `scenario_json` (map snapshot, trail, wind, 3-4 decision steps, scoring key), and no task auto-assigns a lesson on an event. The step "DB: Loop" in event-pipeline §1 has no owner. Add task **B10b (1 h)**: a trigger on each lesson's `topic_event_types` that writes an assignment and a replay row. Add a `ReplayScenario` zod schema to B1. Decide which event demo beat 4 replays.
2. **BLOCKER: repeat-event rate (and idle %) is missing from the evidence card.** `evidence_metrics` has no key for it. B7 generates no synthetic cohort (assignment → recurrence), and no task computes it. Add it to B7 and B17 (+0.5 h).
3. **BLOCKER: Track F has no task list.** The integration points are written only from Track B's side. My estimate of Track F's P0 is ≈23 h. Track B is 20.5 task-hours. G1 left about 13 feature hours per builder. The scope grew after G1 (full RAG, scenario engine, alert budget, Merkle root, privacy). Adopt the cut list in §3.
4. **HIGH: runbook conflict.** Track B's "≈14 h wall-clock" relies on subagents running in parallel inside the track. The runbook says one task at a time within a track. Either amend the rule (subagents may work only in `scripts/` while the main lane works in `supabase/`), or Track B runs 20.5 h serially and misses the deadline.
5. **HIGH: collisions on one laptop.** Files at the repo root belong to neither track: `CHECKLIST.md` (every B task appends to it), `pnpm-lock.yaml`, `package.json`, `.env`. **Freeze order:** (a) at H0 on `main`, install every known dependency for both tracks in one commit; (b) each track keeps its own log in `docs/sessions/track-{b,f}.md`, and only the orchestrator edits CHECKLIST and STATE; (c) Track B merges to `main` at each integration point, and Track F runs `git merge main` right after; (d) Track F never edits `packages/shared` and puts contract requests in its own log; (e) `.env` is copied into both worktrees, and `apps/web` needs its own `.env.local`; (f) Track B runs destructive database operations (reseed, `new_run`) only at integration points, because both tracks share one Supabase project.
6. **HIGH: the web deploy has no owner.** No task covers it, and `vercel login` is still broken (PW.6). Decide by H10: fix it, or demo from localhost.
7. **MED: STRIDE (§7b) is in no architecture document.** Session expiry is not configured. The event pipeline deliberately does not rate-limit SOS, while the spec says "rate limit". Update the spec, and give the STRIDE slide an owner.
8. **MED: gaps inside existing tasks.** `v_task_analytics` is not in B16. PDF and table parsing is not in B18 (a LlamaParse key is already set). There is no RPC for "pair a machine". The near-miss mode is policy only, not enforced. It is unclear whether the proximity rules cover machine↔machine.
9. **MED: G3 at T+9 cannot test live flows.** IP2 comes at T+12. Change G3 to "screens on fixtures + seeded logins".
10. **LOW: backend-tasks §4 is out of date.** `.env` already holds the Supabase, Twilio, Telegram, Groq×4, Pinecone and Voyage keys. The Supabase CLI 2.102.0 is installed, so use it, not `npx`. uv 0.12.18 is installed but not on the PATH of the current session, so check `uv --version` in each new worktree session.

## 2. Provisioning
**Blocks hour 0:** create both worktrees and copy `.env` into them; in B0, switch off Realtime "Allow public access" and check the Postgres version.
**Blocks by H2-3:** the organiser's sample dataset (B6); the RAG corpus in `docs/brief/data/kb/` (B18); `GOOGLE_GENERATIVE_AI_API_KEY` (not in `.env`).
**Blocks by H6:** the TTS provider and key (ADR-002), so the Hindi clips exist by H11.

## 3. Cut list (in order)
1. B20 eval shown as "in progress".
2. Daily cron (keep the checkpoint).
3. Fleet EWMA (keep the per-machine EWMA).
4. Tamil → P1.
5. Radar static, machine↔machine → P1.
6. Analytics down to one chart.
7. Replay for one event type.
8. Ask tools down to next task + alerts.

## 4. Critical path
Worktrees + B0 with a provider smoke test → B1 freeze (H1:45) → B2-B4 + B8 (IP1, H6) → B9-B11 (IP2, H9) → B10b, B12, B15 (IP3, H11) → B13-B14 (IP4, H13) → dry run at H18 = T+21. That leaves 1 h of slack.

## 5. First 3 hours
**Track B:**
- 0:00-0:45: B0.
- 0:45-1:00: provider smoke test (Telegram sendMessage, one Twilio call to a verified phone, pings to Groq, Pinecone and Voyage).
- 1:00-2:00: B1 plus the `ReplayScenario` and repeat-event keys; tag v1.0.0 and merge (IP0).
- 2:00-3:00: B2 on the main lane; a subagent runs B6 in `scripts/`.

**Track F:**
- 0:00-1:00: Site Signage tokens (Tailwind 4); the operator and supervisor shells with persistent SOS, safety and connectivity chips; next-intl with en/hi/ta; pick a keyless basemap.
- 1:00-2:00: components that need no contracts: the four alert tiers with vibration, SOS hold-to-arm, the hero card skeleton, the motion-lock glance mode.
- 2:00-3:00: merge `main`, build the fixtures↔Supabase data adapter, then Home with the hero card and tasks, and first launch (language → role → pair → consent).
