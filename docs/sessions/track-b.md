# Track B log (append-only: time | task | status | SHA | blockers)

## B0 (2026-09-23, Fable 5.1) · DONE except two items that need Shlok

| time | task | status | SHA | blockers |
|---|---|---|---|---|
| 2026-09-23 16:30 IST | B0 project link, config, secrets, Vault, probes, Pinecone, smoke test | done (2 open items below) | see commit | (a) the one live Twilio call needs Shlok's OK; (b) B0b Vercel link/deploy handed to the integrator (the classifier blocks `vercel link` in this session; the plan places `.vercel/` in the primary folder anyway) |

**Reviews:** code-reviewer CHANGES REQUIRED (11) and backend-reviewer FAIL (6) on the first diff; all findings applied in the same commit (cleanup in `finally`, `sqltest` refuses top-level `begin/commit/rollback`, no URL parsing of the connection string, shared Management API helper that throws on non-2xx, `requireEnv` everywhere, quoted-value-with-comment parsing, Groq steps as a table, `with-env` without a shell, the log corrections below). Re-run after the fixes: tsc exit 0, vitest 3/3 (`scripts/lib/env.test.ts`), sqltest 2/2, smoke `--only=pinecone` 1/1.

**Facts measured (Management API, DB probes, `scripts/smoke.ts`):**
- Project "Spotter AI" `ACTIVE_HEALTHY`, ap-south-1, image **17.6.1.166** (≥ 15.1.1.61 ✓). It is in a Vercel-managed org (`vercel_icfg_…`; `/v1/organizations` lists nothing for such orgs). The two paused projects (CITADEL, Packaged_food_website) are in org `xuhzwfeptwbncqnwvwxs` per the Supabase MCP `list_projects`, so they do not count toward this project's 500 MB (G2-15 [U] closed). DB size now 11 MB.
- **COMMIT probe (R2-1): PASS.** `call private.probe();` on a `'1 seconds'` job: row A persisted ×3, no row B, `cron.job_run_details.status = 'failed'` ×3 ("intentional failure after commit"), then unscheduled and dropped. The `worker` procedure design (steps + `commit;`) stands; no fallback to one-job-per-step. (The first run deleted the run-details rows; the script now keeps them, so a re-run leaves evidence for 1 h.)
- `cron.use_background_workers = off` (postmaster) → one libpq connection per run, as assumed (N5). `cron.log_statement = on` (postmaster; cannot be changed by us) → **accepted** (G2-21): log lines, not DB size.
- **N4 backstop:** `alter role … set statement_timeout` works, but `cron.schedule_in_database(…, username)` fails with "must be superuser to create a job for another role" (the `postgres` role is not superuser; it has CREATEROLE). So the role-level backstop is **not available**; bounded work per step (DM §6 rule 1) carries the guarantee and the `postgres` role's 2-min statement timeout is the only cancel. B9 still runs the sleep probe and logs the gap.
- Extensions enabled: pg_cron 1.6.4 (schema pg_catalog, usage granted to postgres), pg_net 0.20.4, supabase_vault 0.3.1; schema `private` created (revoked from public/anon/authenticated). PostGIS 3.3.7 available, enabled by B2's migration, which must also create these idempotently (`if not exists`). pgTAP available (not used: no local stack).
- **Realtime "Allow public access": off** (`private_only = true` via `PATCH /v1/projects/{ref}/config/realtime`, was null; re-read confirms true).
- **Pinecone** index `spotter-kb` created: serverless aws/us-east-1, dense, **1024 dims, metric dotproduct** (hybrid records carry sparse values; Voyage `voyage-multimodal-3.5` returns 1024 dims), state Ready.
- **Vault:** `supabase_secret_key`, `telegram_supervisor_chat_id`, `site_emergency_tel` (= supervisor demo phone) created (`scripts/b0/vault.ts`, idempotent; 000_smoke asserts them).
- **Edge Function secrets** (19) set through the Management API (`scripts/b0/function-secrets.ts`): Groq A/B/vision, Gemini, Pinecone (key + index), Voyage, Twilio (sid, token, from, both demo phones), Telegram (token, chat id, webhook secret), `DEMO_DRIVER_SECRET`, `PUBLIC_FUNCTIONS_URL`, `LLM_CHAIN=groq_a,gemini,groq_b`, **`DRY_RUN=true`**.
- `supabase/config.toml`: `project_id = "spotter"`, `[functions.*] verify_jwt = false` for ask, director, demo-login, dispatch, telegram-webhook, twilio-voice (G2-6). `supabase link` done via `scripts/lib/with-env.ts` (`supabase/.temp` is git-ignored; it recorded the session pooler URL, port 5432).
- **Smoke test 11/11 green** (`pnpm exec tsx scripts/smoke.ts`): Telegram sendMessage (message_id 5 in the supervisor chat); Twilio trial active, balance **5.90 USD**, both demo phones verified (**no call placed**); Groq A + B `openai/gpt-oss-120b` OK (7,858 / 7,882 TPM remaining), `gpt-oss-20b` OK; prompt guard benign 0.0004 vs hostile 0.9996; safeguard "COMPLIES"; Gemini text OK (see finding 3); Pinecone Ready; Voyage embed 1024 dims + rerank-2.5-lite OK.
- SQL test runner `scripts/sqltest.ts` (rollback-wrapped, session pooler, refuses top-level transaction control) + `supabase/tests/000_smoke.sql`, `001_rollback_proof.sql`: 2/2 pass. `scripts/lib/env.test.ts` (vitest) covers the parser and the guard.
- **uv PATH:** `uv --version` = 0.12.18 after `export PATH="$PATH:$LOCALAPPDATA/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe"` (bash) / `$env:Path += ";…"` (PowerShell); every new Track B session repeats this before B6/B7 (it is not persisted).

**Open items (Shlok):**
- **Live Twilio call (B0 acceptance "one Twilio call to a verified phone"): not placed.** Ready as `pnpm exec tsx scripts/smoke.ts --twilio-call` (one call to the operator demo phone, Hindi `<Say>`, ≈ $0.10 of the $5.90). Waiting for your OK per the budget rule.
- **B0b** (integrator, primary folder): `vercel link --yes --project spotter` (team `shlok-goenkas-projects`, account `shlokds16`, CLI 54.13.0 logged in ✓) → set Root Directory `apps/web` (framework Next.js; the monorepo needs the repo root as the upload root so `@cat/shared` resolves) → `vercel env add NEXT_PUBLIC_SUPABASE_URL production`, `vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production`, `vercel env add DEMO_DRIVER_SECRET production` (server-only, never `NEXT_PUBLIC_`) → `vercel deploy --prod` → open the URL on the Android phone and confirm vibration + audio unlock. If the preview asks for a Vercel login, use the production `*.vercel.app` URL or turn deployment protection off for the demo.

**Findings / deviations (integrator):**
1. **`.env` CONNECTION_STRING is the direct host** `db.<ref>.supabase.co:5432` (IPv6-only; `ENOTFOUND` on this network). `scripts/lib/db.ts` builds the session-pooler URL from `SUPABASE_DB_PASSWORD` + the ref (`postgres.<ref>@aws-0-ap-south-1.pooler.supabase.com:5432`) instead of parsing the string. Suggest fixing `.env` in both worktrees to the pooler URL (Dashboard → Connect → Session pooler).
2. **`SUPABASE_SECRET_KEY` is a legacy `service_role` JWT**, not an `sb_secret_…` key (the `.env.example` header says the new key model). It works for `dispatch`'s apikey compare and admin seeding; if Shlok wants the new model, create it under Project Settings → API Keys, re-run `scripts/b0/vault.ts` and copy it to both `.env`s.
3. **Gemini model id:** `gemini-2.5-flash` (event-pipeline §6, "verified by the coordinator") now returns **404 "no longer available to new users"** on this key. The key lists `gemini-3.6-flash` (the error's suggested replacement; also 3.5/3.7/3.8-flash and `gemini-2.5-flash-preview-tts`). B1 freezes `GEMINI_MODEL = "gemini-3.6-flash"` (env-overridable); the docs need a one-line update at the next docs pass.
4. `.env` has inline `# comments` after values and `KEY = value` spacing; `scripts/lib/env.ts` tolerates both (single-line values only).
5. **defenso `guard_code` is down** (server replies "GET method is not supported for route api/mcp/guard_code"; 3 attempts, also by the backend reviewer). Reviewed the env/secret code by hand and by two reviewers instead: no secret is printed; secrets travel only in headers/bodies to api.supabase.com, the pooler and the providers. Re-run when the MCP is fixed.
6. **Dependency request:** `typescript` and `@types/node` are not root devDependencies (`typescript` is only in `packages/shared`; `@types/node` currently resolves from a folder outside the repo), so `pnpm exec tsc` at the root fails and a fresh clone could not type-check `scripts/`. Working form today: `./packages/shared/node_modules/.bin/tsc -p scripts/tsconfig.json`. Please add both to the root devDependencies at the next dependency commit on `main` (rule §0.3: no new dependency except through the integrator).
7. Docker Desktop is not running → no local stack; integration suites (B9, B10b, B12) use the rehearsal-run fallback unless Shlok starts Docker.


## B1 (2026-09-23, Fable 5.1) · contracts v1.0.0 frozen → IP0

| time | task | status | SHA | blockers |
|---|---|---|---|---|
| 2026-09-23 17:40 IST | B1 contracts v1.0.0, gen-sql-seed, fixtures, freeze | done, **merge-ready**; tag `contracts-v1.0.0` on this commit | a8a214e | none |

**Delivered (`packages/shared`, api-contracts rev 3 §1 layout):** `contracts/{version,enums,events,registry,rpc,replay,lesson,functions,realtime,evidence,assumed,explain,audio,analytics,models}.ts`, `eta/model.ts` + `eta/model.v1.ts`, `fixtures/index.ts` (22 schema ↔ example pairs, exported as `@cat/shared/fixtures`), `contracts.test.ts` (+ the `AskAnswer` JSON-schema snapshot). `scripts/lib/contracts-sql.ts` + `scripts/gen-sql-seed.ts` write `supabase/migrations/20260923000000_contracts_enums.sql` (23 enums) and `supabase/seed/contracts_registry.sql` (47 event types, 9 alert policies, 7 explanation templates); `--into <migration>` embeds the seed between markers for B4. `scripts/gen-sql-seed.test.ts` fails when the committed SQL is stale.
**Tests:** vitest 42/42 (`pnpm exec vitest run packages/shared scripts`); `pnpm exec tsc` exit 0 for `packages/shared`, `scripts` and `apps/web` (Track F's imports still resolve; `sync.ts` stays exported).

**Decisions inside the freeze (all additive to the spec, none breaking):**
1. `MODELS.gemini_text = "gemini-3.6-flash"` (D13) with the other model ids in `contracts/models.ts`; `LLM_CHAIN_DEFAULT = ["groq_a","gemini","groq_b"]`.
2. `ALERT_POLICIES` rows carry `tier_max` (the in-place upgrade ceiling) and split the table's "escalate to" column into **`notify_now`** (fires on raise: SOS/ledger/flood → supervisor Telegram) and **`escalate_to`** (fires when `ack_timeout_s` lapses). `alert_policies` therefore gets one extra column `notify_now text[]` in B4 (data-model §2.1 lists the rest).
3. `explanation_templates (anomaly_type pk, en, hi)` is a generated table (data-model §2.5 says the templates are seeded from the contracts; the table name is mine).
4. `SQL_ENUMS` (23 types) in `enums.ts` is the single source for every `create type`: the data-model §0 list plus `ack_via`, `suppress_reason`, `ppe_item`, `proximity_zone`, `anomaly_type`, `alert_kind`, `photo_category`, `machine_health`, `lang`. `events.source` stays a **text** column checked against `EventSource` (its values contain dots), not a SQL enum. The generated migration also emits `alter type … add value if not exists` per value, so a value added after the freeze reaches an existing database.
5. ETA coefficients are a **TS module** (`eta/model.v1.ts`, `MODEL_V1_DATA`) instead of a `.json` import: Node 24 ESM needs an import attribute for JSON, which Turbopack and vitest handle differently; a TS literal loads identically everywhere. B16 writes that file. The factor keys are frozen: `weather:*`, `skill:*`, `age:{lt5,5to10,10to20,20plus}`, `heat:{normal,warm,high,extreme,cold}`, `wind:{calm,fresh,strong}`, `circadian:{normal,post_lunch_dip,night_trough}`; `assumed = true` **only on the circadian factor** (shift hour is synthetic); weather, skill and age are organiser fields and temperature/wind are real Open-Meteo data (§11: `real_open_data`, no "assumed" chip).
6. `GenericEvent` (envelope + unvalidated payload) for `recent_events`, and `AnyEvent` as the discriminated union of the 47 registered types (UI renders unknown types generically).
7. `ReplayEventType` is the enum `["safety.seatbelt_breach"]` (P0); Guardian is added later without a major bump.
8. Internal imports in `packages/shared` are **extensionless** (`./enums`), so consumers need no `allowImportingTsExtensions`; verified by type-checking the package under `apps/web/tsconfig.json` (exit 0). `apps/web` itself does not import `@cat/shared` yet, so the web build proves nothing until Track F does.
9. `scripts/` imports the contracts by relative path (`../packages/shared/src/index.ts`), not as a workspace dependency, so the lockfile is untouched (rule §0.3).

10. Seed ids must be standard-form uuids (`z.uuid()` rejects e.g. `…-0000-0000-…`; B8).
11. `z.toJSONSchema(AskAnswer)` emits `$schema`, `const`, `maxLength`, `minItems`/`maxItems`; Groq strict mode may reject some of these, so B19 strips unsupported keywords before sending and verifies live (the plan already scheduled that check).

**Reviews:** code-reviewer CHANGES REQUIRED (7) and backend-reviewer FAIL (5) on the first diff, all applied before the commit: extensionless imports (the `.ts` suffix would have forced `allowImportingTsExtensions` on web and mobile), `eventSchema` keeps each type's own payload type (no `as unknown as`), fixtures grew to one per event type (47) plus every RPC in/out, all seven evidence cards and the function/realtime/content schemas (**93** total), the fixture test now checks a lossless round-trip and breaks a **nested** field per fixture, ETA fixtures are produced by `estimateEta`, the quoting helper is tested directly, `AudioManifestEntry` (alias `AUDIO_MANIFEST_ENTRY` kept for the spec name), the log corrections above.

**For Track F (also in handoff.md):** import `@cat/shared` for schemas and types and `@cat/shared/fixtures` for `FIXTURES`, `mySnapshot`, `replayScenario`, `lessonContent`, `askResponse`, … Contracts are frozen: request changes in `docs/sessions/track-f.md`; anything after v1.0.0 is additive.

## B2 (2026-09-23, Fable 5.1) · migration 001 (+ 001b, 001c, 001d) applied to the shared project

| time | task | status | SHA | blockers |
|---|---|---|---|---|
| 2026-09-23 19:10 IST | B2 migration 001: extensions, enums (generated), reference, profiles, pairings, RLS helpers, scenario, telemetry/state, tasks, task_history, v_task_analytics, gen types | done, merge-ready | 0954306 | none |

**Applied with `supabase db push --linked` (in order):** `20260923000000_contracts_enums.sql` (23 enums, generated) → `20260923100000_001_core.sql` (26 public tables, 2 private, 1 view, RLS on every table) → `20260923100100_001b_fk_indexes.sql` (19 covering indexes the performance advisor asked for) → `20260923100200_001c_privileges.sql` (review fixes, below) → `20260923100300_001d_function_defaults.sql` (one more default-privilege revoke found by the new test). `supabase gen types` → `packages/shared/src/db/types.ts` (export `@cat/shared/db`, 26 tables + the view; Track F uses it for FM `select`s).

**Reviews:** code-reviewer CHANGES REQUIRED (9) and backend-reviewer FAIL (7) on 001; every finding is fixed in 001c/001d and covered by a test:
- **Default privileges** (both reviewers, the high one): 001's per-schema `revoke execute … from public` on `private` was a no-op (a per-schema default cannot remove the built-in PUBLIC grant), and Supabase's own per-schema grant made every new `public` function callable by `anon`/`authenticated`. Now: global `alter default privileges for role postgres revoke execute on functions from public`, per-schema revokes of tables, sequences and functions from `anon`/`authenticated` in `public`, explicit `revoke execute on all functions in schema private` with only the five helpers re-granted, sequences revoked. `tests/003_privileges.sql` creates a probe table and function inside the rolled-back transaction and asserts neither is reachable by clients; B4/B5/B15 objects therefore start closed and are granted explicitly.
- **Pseudonym leak** (backend-reviewer, privacy): FM could read `operators.pseudonym` next to `display_name`, defeating near-miss mode. Now `authenticated` has column-level `select` on `operators` **without `pseudonym`**; only the `near_miss_list` RPC (B15, security definer) returns pseudonyms. Consequence for Track F (handoff): select explicit columns on `operators`; `select=*` is refused by PostgREST.
- `scenario_frames`: the `select` grant to `authenticated` is revoked (RLS with no policy was already hiding rows; now the table is not reachable at all).
- Telemetry `(run_id, frame_seq)`: a plain **unique constraint** (usable by `on conflict` in B9) plus `check ((run_id is null) = (frame_seq is null))` so a null frame number cannot bypass it.
- `operator_pairings`: readable by every signed-in role (data-model §2.1), not OP-own as 001 had it. `profiles.operator_id` is unique. Helper functions carry a comment saying why they are security definer (the `profiles` policy must not recurse).
- Tests: `002_core_rls.sql` now seeds trail, pairing, shift, override and consent rows and asserts OP / FM / TR on each; anon is checked on **every** public table, view and sequence by catalog (`has_table_privilege`), not on two tables.

**Checks after the fixes:** sqltest **4/4**; Security Advisor: one INFO (`scenario_frames` RLS enabled, no policy: by design); performance advisor: unused-index INFOs only (fresh tables).

**Decisions inside B2 (within the data model's intent):**
1. RLS helpers in `private` (`app_role`, `my_operator_id`, `my_site_id`, `is_staff`, `is_fm`): `authenticated` gets `usage` on the schema and `execute` on exactly these five (policy expressions run as the caller). `private` is not a PostgREST-exposed schema.
2. Helpers are created after `profiles` (SQL-language bodies are validated at creation; the first push failed on this).
3. Clients get `select` only, nothing for `anon`, `service_role` keeps all; writes arrive in B15 as security-definer RPCs.
4. FM/TR "all" policies are org-wide as the data model says; events (B4) are site-scoped per §3.1.
5. `ppe_overrides.ledger_queue_id` is a plain bigint (no FK: the ledger never depends on purgeable rows); `tasks ↔ ppe_overrides` FK is added after both tables exist.
6. `task_history.model_p50_min` / `model_p90_min` are the columns B16 fills; `v_task_analytics` needs `n ≥ 5` per task_type × weather on the `test` split. The generated types show the view's columns as nullable (Postgres cannot infer non-null on aggregates); the UI parses rows with `TaskAnalyticsRow`.
7. `app_config.fuel_price_inr_per_l` (default 92 = `FUEL_PRICE`) so B10's cost formula reads one row; `machine_models.source_url` records the spec-sheet source (D8).
8. `explanation_templates` and `alert_policies.notify_now` exist here so B4's embedded seed can fill them.
9. GIST on `machine_state.location` / `operator_state.location` for the Guardian `ST_DWithin` (B11); telemetry has unique `(run_id, frame_seq)`, `(machine_id, ts)`, `(run_id, machine_id, ts)`, BRIN(ts), GIST(location), `operator_id`.

**For the integrator (docs):** data-model §2.1 is stale in three places (`protocol_cards.steps` shape, `alert_policies.tier_max`/`notify_now`, `operators.preferred_language` is the `lang` enum); worth one line at the next docs pass.
**For B8 (seed):** `profiles.user_id` references `auth.users`; the RLS test inserts test users into `auth.users` directly (the `postgres` role may), which is how `scripts/seed.ts` can create the three demo logins.
