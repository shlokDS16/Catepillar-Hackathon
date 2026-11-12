# JC review: lane/l2-judge-content @ df893bb vs main

Reviewer: code-reviewer (Opus), 2026-11-12. Read-only; run in the branch worktree `agent-af1d22c4a2628c5ce`.

Checks (real output): `tsc --noEmit` "No errors found"; `eslint` "No issues found"; `vitest run` 410/410 passed, success true.

## Findings

1. **High**: `apps/web/src/replay/protocol-cards.ts:11-15`, `evidence-card.tsx:87,104`. The local seatbelt card has 3 invented steps. The authored card (`supabase/migrations/20261112170000_006_loop_replay.sql:31-36`) has 4: stop, park level, fasten and tug, tell supervisor. The Debrief rule (`packages/shared/src/fixtures/index.ts:184`) is "quoted from the fixed card", and that quote matches neither of the local steps. The local card also overrides any port, so a live adapter would hide the DB row, which contradicts the file's own comment. Fix: copy the steps exactly from 006 and answer by id inside `FixtureAdapter.protocolCard` (keep `hydraulic_fault`, unknown id gives null so the card shows "failed"). Drop the precedence in evidence-card.
2. **High**: `analytics-screen.tsx:224-227` and `en.json:1189`. The card shows overheat precision 88 % and recall 79 % (n = 64), and the same plate says no overheat detector threshold exists. `overheat` is not an `anomaly_type` either. Fix: show "no detector shipped" in the overheat rows, as the drift row already does.
3. **Medium**: `en.json:1189`. The claim "warning at 50 %" is false at the alert level. `idle_excess` has `tier_max = caution` (`002_events.sql:68`, applied at `005_detectors.sql:310`). The thresholds are also site config (`005b:27-28`). Fix: "caution from 40 %. Severity rises at 50 %, but the alert stays at caution (site defaults)."
4. **Medium**: `en.json:1188,1192,1194,1195` (and hi). These lines describe populations that do not exist: "test events, simulated cohort", "operators per arm", "all conditions". The page says the values are typed, so these imply a run. "12 machines" also clashes with the 4 machines in the fixtures. Fix: "n = X as typed with the figure; no events behind it."
5. **Medium**: `home-screen.tsx:42`. `find` returns `weather:clear` (×1.00) before `heat:high`, so the "adds N % to ETA" line disappears when only heat applies. Fix: add `&& f.multiplier > 1` inside the predicate.
6. **Medium (i18n)**: `factor-rows.tsx:31`. The merged row prints the raw value "combined" in en and hi. Fix: add `task.why.value.weather_heat.combined`, or render "hot · extreme" from the two source values.
7. **Low**: `task-state.ts:123`. The merge catches any weather that is not ×1.00 (rain, dust, fog), not only hot or cold, which contradicts its doc comment. The merged tag credits all of it to Open-Meteo, but weather is an organiser field. Fix: restrict to `weather:hot|cold`.
8. **Low**: `evidence-site-plan.tsx:54-55`. Magic constants, and the comment says "drops 4u" while the code uses 3.2u. Nothing tests it. Fix: name the constants and align the comment.
9. **Low (tests)**: `protocol-cards.test.ts` only checks that the registry returns itself. No render test covers the new population lines (128 of 152), the threshold copy, or the hero sort and filter. Fix: assert those strings in `analytics/render.test.ts`, and add a test against the 006 card text.
10. **Low**: hi "आबादी" for statistical population reads as "human population". Use "नमूना". Two polish items remain undone and unlogged: the takeover leak at 1440 and the Lesson buttons below the fold.

Verified correct: the merged multiplier is the exact product the model applies (`packages/shared/src/eta/model.ts:63-66`). The 152 / 128 / 375 counts and the 4.1 vs 6.9 banner match `fixtures.ts` and `weightedMae`. Key parity between en and hi is complete. Replay timing and scoring are untouched (only label placement changed).

**CHANGES REQUIRED**

## Re-review @ 7073d57 (fix cfbb22f + merge of origin/main 6668dd1, F19)

Checks at 7073d57 (real output): `tsc` "No errors found"; `eslint` "No issues found"; `vitest run` 38 files, 431/431 passed.

- **#1 High: resolved.** `protocol-cards.ts` has the same title, the 4 steps (en and hi), the pictogram `belt`, `upwind_hint` false and version 1 as `006_loop_replay.sql:31-36`, word for word. `evidence-card.tsx` is port-only again, so a live DB row wins. A test reads the migration and asserts every step, and asserts that the Debrief rule quotes step 1.
- **Adapter change: safe.** `fixtureProtocolCard` returns seatbelt or `hydraulic_fault`, and null for anything else. The only fixture `protocol_card_id` values are `hydraulic_fault` and null (`fixture-adapter.ts:156,165,196`, `fixtures/events.ts:15,31`). `alert-layer` and `op-map-screen` already handle a null card.
- **#2 High: resolved.** The overheat precision and recall rows are gone; the row now says "no detector shipped", and a render test checks it.
- **#3 to #6 Medium: resolved.** The idle copy now says "alert stays at caution", the population lines say "typed, no run behind", the Home predicate requires `> 1`, and `weather_heat.combined` is translated in en and hi.
- **#7 and #10 Low: mostly resolved.** The merge is limited to `weather:hot|cold`, and hi now uses "नमूना".
- **Merge: nothing lost.** `git diff origin/main 7073d57` touches only JC files. The F19 imports (`AskRequest`, `AskResponse`, `pickAskFixture`) are intact in `fixture-adapter.ts:2-3`. `track-f.md` only adds the two JC lines, and the en and hi diffs against main remove only JC-replaced strings.

Still open (Low, non-blocking):
- The merged row's provenance tag credits all of it to Open-Meteo (`task-state.ts:90`), but weather is an organiser field.
- `protocol-cards.test.ts` uses `protocolCard as never` casts.
- The takeover leak at 1440 and the Lesson buttons below the fold are logged as not done.

**APPROVE**
