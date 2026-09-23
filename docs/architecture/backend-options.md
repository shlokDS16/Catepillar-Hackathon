# Backend options: where Spotter's compute runs

Status: design input for ADR-001 (Proposed). Author: backend-lead, 2026-09-23.
Inputs: `docs/specs/idea.md` (spec v3), `docs/brief/05-g1-decisions.md`, `docs/research/10-15`,
`.env.example`. **There is no `docs/research/16`** (the brief referred to 10-16; 15 is the last file).
Markers: **[V]** verified today against official docs or context7 (source named), **[R]** taken from our
research notes (10-15) and not re-checked, **[A]** assumption, **[U]** could not verify.

## 0. What is fixed and what is being decided

Fixed (not re-opened here): Supabase in Mumbai as the system of record (Postgres + PostGIS, Auth,
Realtime, Edge Functions, pg_cron); Pinecone + Voyage for RAG; Groq for LLM, vision and STT; Twilio
trial for calls; a Telegram bot; Open-Meteo; one `events` table as the source of truth; two build
tracks in separate worktrees (Track B owns `supabase/`, `scripts/`, `packages/shared`; Track F owns
`apps/web`); a web-first build of about 19 hours to review 1.

Being decided: where each of these eight workloads runs.

| # | Workload | What it must guarantee |
|---|---|---|
| W1 | Scenario engine (sim clock 1×/10×/60×, frame release, director commands) | Deterministic replay per seed; keeps running with no browser open |
| W2 | Detectors (rules + EWMA, Guardian proximity) | Built separately from the generator; labels held out; explainable output |
| W3 | ETA model (baseline × multipliers, conformal P90) | Same maths online, in the what-if slider, offline, and in the evidence script |
| W4 | RAG pipeline (hybrid retrieval, rerank, grounded answer, photo) | Role filter, citation gate, refusal, fallback chain inside Groq's 8K TPM |
| W5 | Alert dispatcher (Telegram, Twilio) | Alert budget, motion lock, idempotent provider calls, public HTTPS webhooks |
| W6 | Escalation timers (SOS 60 s, unacknowledged Warning) | Exactly-once escalation, survives a closed tab or a cold function |
| W7 | Ledger hashing + daily Merkle root | Server-side link under a lock, canonical bytes, external witness |
| W8 | Data generator | Seeded, hidden effects, injected labelled anomalies, organiser-format CSVs |

## 1. Platform facts that shape every option

| Fact | Source |
|---|---|
| pg_cron on Supabase accepts sub-minute schedules (`'1 seconds'` … `'59 seconds'`) on Postgres ≥ 15.1.1.61; Supabase advises ≤ 8 concurrent jobs, each ≤ 10 min | [V] supabase.com/docs/guides/cron/quickstart |
| pg_net makes async HTTP POSTs from SQL/triggers, sent only after the transaction commits; ~200 req/s; responses kept 6 h | [V] supabase.com/docs/guides/database/extensions/pg_net |
| New API keys (`sb_publishable_…`, `sb_secret_…`) are not JWTs. Edge Functions called with them need `verify_jwt = false` and must check the `apikey` header in code. pg_net must send the secret key in `apikey` (read from Vault), not `Authorization: Bearer`. Edge Functions read keys from `SUPABASE_SECRET_KEYS` (JSON by name). Legacy keys work until end of 2026 | [V] supabase.com/docs/guides/getting-started/api-keys, …/migrating-to-new-api-keys, …/functions/auth-headers |
| Edge Functions: 256 MB, 2 s CPU per request (async I/O excluded), 150 s wall clock on Free, 400 s paid; 150 s request idle timeout; `GET` returning `text/html` is rewritten to `text/plain` without a custom domain | [V] supabase.com/docs/guides/functions/limits |
| Realtime Broadcast can be sent from SQL with `realtime.send(payload, event, topic, private)`; private topics are authorised by RLS on `realtime.messages` using `realtime.topic()`; database broadcasts are private by default and kept 3 days; supabase-js ≥ 2.74 can replay up to 25 missed messages on join | [V] supabase.com/docs/guides/realtime/broadcast, …/realtime/authorization |
| Realtime Free quota: 2 M messages/month, 200 peak connections | [V] supabase.com/docs/guides/realtime/pricing |
| Free plan goes read-only above **500 MB database size** | [V] supabase.com/docs/guides/platform/database-size |
| Vercel Hobby: functions default and max 300 s; **cron once per day, ±59 min**; functions run in `iad1` (Washington) unless the project region is changed; Hobby = one region | [V] vercel.com/docs/functions/configuring-functions/duration, /cron-jobs/usage-and-pricing, /functions/configuring-functions/region |
| Next.js route handlers support `maxDuration` and `after()` (work after the response, bounded by maxDuration) | [V] context7 /vercel/next.js |
| Groq free tier: `openai/gpt-oss-120b` and `-20b` at 30 RPM / 8,000 TPM / 1,000 RPD each; limits are per organisation, so extra keys add no throughput; only `qwen/qwen3.8-27b` (Preview) takes images; no Hindi TTS | [R] research 15 §1-2 |
| Twilio `POST /2010-04-01/Accounts/{sid}/Calls.json` accepts inline `Twiml` (max 4,000 chars; ignored if `Url` is also given), `Timeout` default 60 s, `StatusCallback` + `StatusCallbackEvent` (initiated, ringing, answered, completed) | [V] twilio.com/docs/voice/api/call-resource |
| Telegram `setWebhook` `secret_token` (1-256 chars) is echoed in `X-Telegram-Bot-Api-Secret-Token`; Telegram retries non-2xx responses | [V] core.telegram.org/bots/api |
| Pinecone hybrid search in one index needs `dotproduct`; `pinecone-sparse-english-v0` is **English-only**; Starter: 5 indexes in AWS `us-east-1`, 1 M read units, 2 M write units, 5 M embedding tokens per model per month, **500 rerank requests/month** for `bge-reranker-v2-m3` | [V] context7 /websites/pinecone_io |
| Voyage `voyage-multimodal-3.5`: text + image (+ video) in one space, 32K context, dims 256/512/1024/2048; `rerank-2.5` and `rerank-2.5-lite` (multilingual, 32K), 200 M free rerank tokens | [V] context7 /websites/voyageai |
| Local `supabase test db` (pgTAP) needs the local Docker stack (`supabase start`) | [V] supabase.com/docs/reference/cli/supabase-test-db |
| On this laptop: Docker 29.3.1; **Supabase CLI 2.102.0 on PATH**; **uv 0.12.18 installed under WinGet but not on PATH** (B0 adds it); psql not installed; Python 3.14.3; git on `main`. (Revision 1 said the CLI and uv were missing: corrected per G2-20.) | [V] local check + G2 review |
| `verify_jwt` is not an authentication control on its own: per the G2 review's reading of `functions/auth-headers`, it lets a publishable key through, so every function authenticates the caller in code (revision 2, G2-6) | G2 review |

## 2. The three options

### Option A: "Speed to a working demo", Next.js-centric

Everything the server does lives in `apps/web` route handlers on Vercel, written in TypeScript with the
AI SDK. Supabase is database, Auth and Realtime only.

| Workload | Runs in |
|---|---|
| W1 Scenario engine | `/api/scenario/tick` route; the open `/director` tab calls it every second |
| W2 Detectors | TypeScript in the tick route (shared from `packages/shared`) |
| W3 ETA | TypeScript in `packages/shared`, called client-side and in route handlers |
| W4 RAG | `/api/ask` route with the AI SDK (`@ai-sdk/groq`), streaming |
| W5 Dispatcher | `/api/dispatch`, `/api/telegram`, `/api/twilio/*` routes |
| W6 Timers | pg_cron (every 1 s) → pg_net → `/api/escalate` on Vercel |
| W7 Ledger | SQL function (advisory lock) called via RPC |
| W8 Generator | Python, offline |

Trade-offs. One language, the best DX (AI SDK, streaming, hot reload), and the least glue code.
But it breaks the track split: nearly all backend code lands in `apps/web`, which Track F owns, so the
two tracks collide in one folder. It needs a working Vercel deployment before the first Telegram or
Twilio test (webhooks need public HTTPS), and `vercel login` is currently broken (STATE.md). The clock
lives in a browser tab: close or sleep the director tab and the scenario stops. Vercel's default region
is `iad1`; every DB round trip to Mumbai crosses the Pacific unless the project is moved to Mumbai
(`bom1` [U]: region ID not checked), and Hobby allows one region.

Risks. Tab-driven clock drift and stalls; a double tick if two tabs are open; cold starts on webhooks;
merge conflicts between tracks; Vercel login blocks the first live call.

24 h feasibility: **feasible, but it spends the parallelism** (Track F waits on or fights over
`apps/web`). About 17 h of backend work that cannot start until Track F's app skeleton exists.

### Option B: "Long-term extensibility", Python intelligence service

A FastAPI service (Render, Fly or Vercel Python) owns the "intelligence"; Supabase Edge Functions own
integrations; Next.js is UI only.

| Workload | Runs in |
|---|---|
| W1 Scenario engine | asyncio loop in the Python service |
| W2 Detectors | Python (numpy/pandas; Isolation Forest ready for P1) |
| W3 ETA | Python (LightGBM quantile or the multiplier model), served over HTTP; a JS port for offline |
| W4 RAG | Python (LlamaIndex or hand-rolled), HTTP to the web |
| W5 Dispatcher | Edge Functions (Telegram, Twilio webhooks), invoked by the Python service |
| W6 Timers | pg_cron → pg_net → Edge Function |
| W7 Ledger | SQL function |
| W8 Generator | Python, same repo as the service |

Trade-offs. The ML ecosystem is right there (P1 Isolation Forest and gradient boosting become cheap);
it mirrors how an enterprise would split a data-science service from the product. But it adds a third
deploy target and a second contract language (pydantic beside zod, which will drift). The ETA model
must exist twice (Python server, JS offline fallback). Render's free tier sleeps after 15 min with a
30-60 s cold start [R] research 11 §5.5, which is fatal on stage; paid always-on hosting needs a card
and an account we do not have. Generator and detector in one codebase weakens the "built separately"
honesty claim.

Risks. A new hosting account on the critical path; cold start mid-demo; zod/pydantic drift; three
places to read logs at 3 a.m.

24 h feasibility: **marginal.** It adds roughly 3-4 h of plumbing (service skeleton, deploy, auth
between services, two contract languages) that buys nothing the review-1 demo shows.

### Option C: "Operational simplicity", the database owns time and truth

Postgres holds every piece of state and every rule that must be exactly-once or ordered. Edge
Functions are thin adapters to the outside world. Next.js is UI only and talks to Supabase through
supabase-js (RLS), RPCs and Realtime.

| Workload | Runs in |
|---|---|
| W1 Scenario engine | Postgres: `scenario_runs` + pre-generated `scenario_frames`; pg_cron `scenario-tick` every 1 s releases due frames (own transaction); director commands via the `director` Edge Function (FM JWT + secret) → SQL |
| W2 Detectors | Postgres: rules and EWMA in plpgsql, run as frames are applied; Guardian with PostGIS `ST_DWithin` |
| W3 ETA | TypeScript pure library in `packages/shared` (client, what-if, seed script); coefficients fitted by `scripts/eta-fit.ts` |
| W4 RAG | `ask` Edge Function with fetch-based adapters (Groq, fallback, Voyage, Pinecone); ingestion is an offline script |
| W5 Dispatcher | Decision in SQL (`raise_alert`: dedupe, suppress, rate cap, motion lock); execution in the `dispatch` Edge Function via pg_net; webhooks `telegram-webhook`, `twilio-voice` |
| W6 Timers | separate pg_cron `sos-escalator` job → `escalations_due()` with a compare-and-set, independent of ticks and the ledger lock |
| W7 Ledger | SQL: byte-exact canonical serialisation, `ledger_queue` drained by the `worker` job under `pg_advisory_xact_lock`, `ledger_verify` (internal consistency), Merkle checkpoints published to the fleet manager's Telegram and compared by a human (revision 3, N1) |
| W8 Generator | Python (uv), offline; writes CSVs + scenario frames; loaded by `scripts/seed.ts` |

Trade-offs. One backend deploy target (Supabase CLI), and every file lives in Track B's folders, so
the tracks never touch. The clock and the escalation timer keep running with every browser closed.
Idempotency and ordering come from constraints and locks, not from code discipline. Webhooks get public
HTTPS URLs without Vercel. The generator (Python) and the detector (SQL) cannot share code, which makes
the "built separately" claim structural rather than promised. Costs: plpgsql is clumsier than
TypeScript for the EWMA and harder to unit-test (no local pgTAP unless Docker is used; we test SQL with
assertion scripts run against the project inside a rolled-back transaction); strong Supabase lock-in;
a 1-second pg_cron job writes one `cron.job_run_details` row per second (needs a cleanup job); Deno
compatibility of npm SDKs is avoided by using plain `fetch` adapters.

Risks (revision 2 splits the single heartbeat into four independent jobs: `scenario-tick`,
`sos-escalator`, `ledger-writer`, `dispatch-requeue`; see event-pipeline §0). A slow tick could overlap
itself (guarded by `pg_try_advisory_xact_lock`); DB size near
the 500 MB Free limit if the full 90-day history is loaded (so we load 30 days, see data-model §7);
TwiML served from an Edge Function must come back as XML, not rewritten [U] (the rewrite rule applies
to `GET text/html`; Twilio webhooks are `POST` with `application/xml`, so it should be safe; test in
task B14).

24 h feasibility: **feasible after the G2 re-baseline**: ≈ 13.5 h on the main lane plus ≈ 7 h in a
parallel subagent lane (`scripts/`, `supabase/functions/ask/`), with the cut list in backend-tasks §5.

## 3. Side-by-side

| Criterion (weight) | A: Next.js-centric | B: Python service | C: DB owns time |
|---|---|---|---|
| Demo reliability on stage (×3) | 2: tab-driven clock, cold webhooks | 2: cold start, 3 targets | **3**: DB clock, no tab dependency |
| Fits the track split (×3) | 1: backend in `apps/web` | 2 | **3**: all in Track B folders |
| Build speed in 19 h (×2) | **3** | 1 | 2 |
| Exactly-once / ordering (×2) | 2 | 2 | **3** |
| Extensibility after review 1 (×1) | 2 | **3** | 2 |
| Testability (×1) | **3** (vitest) | **3** (pytest) | 2 (SQL assertion scripts) |
| Weighted total (max 36) | 24 | 24 | **32** |

## 4. Where all three agree, and the binding constraint

All three options put these in the same place:
1. **The ledger append runs in Postgres** (the previous-hash link must be read and written in one
   transaction under an advisory lock; no application tier can do that more safely).
2. **Escalation timers are pg_cron + a compare-and-set** (serverless `setTimeout` dies with the
   response, and Vercel Hobby cron is once a day [V]).
3. **The data generator is offline Python.**
4. **RAG throughput is capped by Groq's org-wide 8,000 TPM**, whatever runs the pipeline [R].

**Binding constraint: on free tiers, the only scheduler with sub-minute precision that we own is
pg_cron inside the database, and the only place that can serialise the ledger and the alert state
machine is the same database.** Time and ordering therefore live in Postgres in every option; the
options differ only in where stateless compute (tick logic, detectors, provider calls, RAG) runs.
Option C accepts that and moves the stateless compute next to the state.

## 5. Recommendation

**Option C**, with two deliberate borrowings:
- From A: the ETA model and all contracts are TypeScript in `packages/shared`, so the web runs the same
  estimate client-side (what-if slider, offline) and the fitting script uses the same code.
- From B: the generator is Python (uv) and stays outside the runtime entirely.

Non-Groq LLM fallback (revised by decision D9): the app uses **one** Groq account; the Groq AUP
forbids orchestrating usage across organisations to get around limits, so there is **no automatic
failover to the second person's Groq account**. The LLM layer is provider-agnostic (`ChatProvider`
adapters) and the fallback is chosen by environment: `LLM_FALLBACK=none` (deterministic refusal) or
`gemini` (Google Gemini free tier, `@ai-sdk/google` reads `GOOGLE_GENERATIVE_AI_API_KEY` [V], text only:
its free tier uses content to improve products [V], so photos never go to it). A paid Groq Developer
tier on the same account only raises limits and needs no code change. Shlok picks the option.

Decision record: `ADR-001-backend-architecture.md`.
