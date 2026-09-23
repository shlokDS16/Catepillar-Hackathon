# Track F task list (to review 1)

- Status: design plan **v3** (ui-ux-lead, 2026-09-23). This is the gate G2 fix round (docs/gates/G2.md). It codes against api-contracts with UI-1 to UI-22 answered (§10), provenance (§11), anomaly explanation (§12), audio manifest (§13) and analytics (§14).
- Owner: ui-ux-lead. Worktree `../spotter-track-f`, branch `track-f`, folder `apps/web`.
- **Budget: 12.75 h of P0 tasks + 0.25 h buffer = 13 h.** Replay (the headline) keeps 2.75 h and is cut last (§4.2).

## Decisions for Shlok
1. **Proximity radar → map rings (recommended).** Spec M2's cockpit mini-radar is not built. The Map's 15 m / 50 m Guardian rings and the Safety screen's `operator_state.nearest` line ("Person 22 m · awareness") carry the same information, and the hero stays single-purpose. Saves 0.75 h. Approve, or restore it as P1.
2. **The Replay Brief is untimed.** The spec's "10 s" is the target length of the content, not a clock, so a low-literacy operator hears it through before being timed. Investigate and Decide are timed.
3. **Training urgency is shown in ink.** Timers, right/wrong feedback and scores never use safety colours.
4. **Simple mode collapses provenance chips** into one "Some values are assumed ⓘ" line per screen. Detailed mode and FM screens show a chip per field.

## 0. Protocol and working rules (docs/sessions/build-protocol.md governs)
1. **Logging:**
   - After every task, append one line to **`docs/sessions/track-f.md`**: time, task ID, status, commit SHA, blockers.
   - Messages to Track B go to **`docs/sessions/handoff.md`** (append-only, prefix `[F→B]`).
   - Track F **never edits `CHECKLIST.md` or `STATE.md`**; the integrator does.
   - Track F also never edits `supabase/`, `scripts/`, `packages/shared`, or `apps/web/public/audio/` (the integrator commits B23's clips).
   - Writes outside `apps/web` are allowed only to `docs/sessions/track-f.md`, `docs/sessions/handoff.md` and `docs/design/qa/`.
2. **Merging:** commit per task on `track-f` and push. The **integrator** merges into `main` (order: contracts → Track B → Track F) and runs `vercel deploy --prod`. After each merge, run `git merge main`. Before each IP, log "merge-ready @ SHA" so the integrator picks it up.
3. **Execution order is the dependency graph in §1.1, not the table order.** One task at a time. A task is *ready* when all its dependencies are done and its IP is on `main`. **If the next task's IP is not on `main` yet, take the next ready task in table order and log the swap.** Run the code-reviewer after every task.
4. **Fixtures first.** Screens use `DataPort` → `FixtureAdapter` (`@cat/shared` fixtures) until their IP. Components never import `supabase-js`.
5. **Deploy** is P0, owned by Track B and the integrator. Track F's first commit is `apps/web/public/haptics-test.html` (Vibrate + Play buttons) for the B0b phone check. `next build` stays green; `/dev/kit` is excluded from production.
6. **Done means:**
   - typecheck, lint and vitest are green;
   - the strings exist in `en` + `hi`;
   - screenshots at 375 and 1440 px are in `docs/design/qa/` (768 px at F21);
   - no hex or px literals outside `tokens.css`;
   - backend types come only from `@cat/shared`;
   - every data value passes through `provenanceOf()`.

## 1. Tasks (each ≤ 1 h)

| # | h | Depends on | Task | Acceptance criteria |
|---|---|---|---|---|
| **F01** | 0.5 | H0 | `haptics-test.html` (first), `tokens.css` + `@theme`, 4 fonts, `Plate`/`Button`/`Chip`, `/dev/kit` | All §3 states in /dev/kit; `tnum` stable; axe finds no contrast issues |
| **F02** | 0.25 | F01 | next-intl cookie locale, `en/hi/ta`, `<html lang>`, per-locale fonts, `LanguageSheet` (A01) | Switch < 1 s with the same URL; `ta` falls back to `en` with a warning |
| **F03** | 0.25 | F01 | `(op)`/`(fm)` shells, strip, nav/rail, SOS and Ask slots, z-layers | No horizontal scroll at 360 px; `next build` green |
| **F04** | 0.5 | F03 | Alert tiers + `useAlertFeedback` (vibration, clip `alert.{kind}.{tier}`, repeats, unlock, "Sound blocked", `upgraded_from` stamp); selectors | vitest: precedence, suppressed hidden, NO SIGNAL at 10 s; plays from a stub manifest |
| **F05** | 0.25 | F03 | `SosButton` + `SosSheet` (`sos.{state}` clips, `location_source`, `server_now` countdown, `tel:`) | Release at 1.4 s sends nothing; one request_id per hold |
| **F06** | 0.25 | F01 | `HeroCard` + the motion-lock view (`motion_locked`, 3 s display hold) | Only SOS responds in lock |
| **F07** | 0.75 | IP0, F03 | `DataPort`, `FixtureAdapter` + beats 1-5, reducer, store, request_id, `server_now` offset; **`provenanceOf(table, field)`** over `FIELD_PROVENANCE` + `ProvenanceChip`; **`useAudio(phraseId)`** over `AUDIO_MANIFEST` (en/hi; Tamil → `en` for alerts only) | vitest: per event family; provenance mapping (assumed / simulated / source line / none); a missing or `missing`-status clip → [Listen] hidden |
| **F08** | 0.25 | F06, F07 | Home (S1) incl. forecast + `source_label` | Detail hidden in Simple mode |
| **F09** | 0.25 | F02, F07 | First launch: A01, A02 via the `api/demo-login` route handler (server-only `DEMO_DRIVER_SECRET`), A03 `pair_machine`, A04 | No secret in the client bundle (grep the build) |
| **F10** | 0.5 | F08 | Task (S2): A06-A08, PPE plate (restored / override / expired), factor rows with chips | All three PPE paths pass on fixtures |
| **F11** | 0.5 | F04, F07 | Safety (S3) + the A13 sheet | 1/3/5 severity; near miss non-punitive; the draft survives a failure |
| **F12** | 0.75 | F07 | `MapView` (S4) + the Guardian card (protocol steps with `guardian.{card_id}.step{n}` audio, the "not a certified collision-warning system" line) + **`AnomalyExplain`** (compact/full, §S4a: template sentence en/hi, litres, ₹ "at ₹92/L (assumed)", severity) + the FM side sheet | The fixture Guardian beat shows the card with the sentence; the idle-excess fixture shows the ₹ row; the tiles-blocked fallback renders |
| **R1** | 0.5 | F07 | Replay shell, state machine, phase rail, `useReplayTimer`, leave confirm, **Brief** (`replay.…brief` audio) | vitest: every transition; the timer pauses on hidden or a live alert |
| **F16** | 0.25 | F07 | `/director` | Commands logged; dry-run label visible |
| **F13** | 1.0 | IP1, F07 | `SupabaseAdapter`: sign-in, snapshot + cache, private channels, rejoin, connectivity, clock | Topic isolation; NO SIGNAL ≤ 10 s; catch-up on reconnect |
| **R2** | 1.0 | R1 | **Investigate:** grid, `open_order`, `max_open` (hard limit), 7 renderers incl. `SitePlan` SVG + `TrendChart` | Every card type renders; order stamps right; timeout moves to Decide |
| **R3** | 0.5 | R1 | **Decide:** `single`/`order`, countdown, timeout omits the step, auto-submit with retry | A timed-out step is absent from `p_choices` |
| **R4** | 0.75 | R2, R3 | **Debrief:** re-enactment player (Play/Pause, scrubber ⚑ ⏱, Restart, 10×), scores, trace vs ideal, review (incl. `chosen: []`), rule + `replay.…rule` audio | Autoplays once, never loops; reduced motion → no autoplay |
| **F17** | 0.5 | F07 | Lesson (cards with `lesson.{code}.{card_id}` audio, quiz with instant feedback + `lesson.{code}.quiz.{q_id}`), Training list (own `replay_attempts` scores) | The reveal marks chosen and correct; the score is posted once |
| **F14** | 0.5 | F07, F12 | Inbox (S7): ordering, dispatch line, A20, A21 sheet, **anomaly rows with the sentence, expanding to `AnomalyExplain`** | Reason validation 10-500; an anomaly row expands to the full detail |
| **F15** | 0.25 | F07 | Ledger (S9): A22 Verify + the A23 witness panel (paste → `WITNESS_LINE` → range → `ledger_recompute` → side-by-side root and head, first difference boxed); title/subtitle/footer "**tamper-evident, human-verifiable**" | Match / mismatch / chain-break fixtures render; the published side never reads the DB; the wording is exactly as in screens.md S9 |
| **F20** | 0.75 | F07 (IP5 live) | Analytics (S8): **the P0 chart**, `TaskAnalyticsRow` grouped bars (actual / organiser / our P50, told apart by pattern) + condition selector (A25) + bias line + MAE table; the evidence card; shared SVG `BarGroup` | Fixture rows render all 5 task types for `hot`; n < 10 is dimmed; the table equals the bars; evidence blocks show n or "Not computed yet" |
| **F18** | 0.75 | IP3, F13, F10, F11, F14, F15, R4, F17 | Live wiring of every RPC + `replay_get`/`replay_submit` + assignments | In dry run, beats 1, 2 and 4 live within 2 s; replay_ready → full replay → debrief |
| **F19** | 0.5 | IP6, F13, F11 | Ask (S6): fixtures → live, photo, `refusal_reason` copy, A18 | All statuses render; A18 opens a prefilled A13 |
| **F21** | 0.5 | all above | Hindi native-read fixes (UI copy; the explanation templates are reviewed by B23), the reduction pass, QA at 375 / 768 / 1440, axe | No dead or unlabelled control; Hindi signed off |
| | **12.75** | | | **+ 0.25 buffer = 13** |

### 1.1 Dependency graph (the execution order)
```
H0 ─► F01 ─┬─► F02 ─────────────────────────────┐
           ├─► F03 ─┬─► F04 ─┬──────────────────┼─► F11 ──────────────┐
           │        ├─► F05  │                  │                     │
           └─► F06 ─┼────────┼─► F08 ─► F10 ────┤                     │
IP0 ────────────────┴─► F07 ─┼─► F09 (+F02) ◄───┘                     │
                             ├─► F12 ─► F14 ──────────────────────────┤
                             ├─► R1 ─┬─► R2 ─┐                        │
                             │       └─► R3 ─┴─► R4 ──────────────────┤
                             ├─► F17 ─────────────────────────────────┤
                             ├─► F15 ─────────────────────────────────┤
                             ├─► F16 ; F20 (live at IP5)              │
IP1 ─► F13 (needs F07) ───────────────────────────────────────────────┤
IP3 ─────────────────────────────────────────────────────────────────►F18 (needs F10 F11 F13 F14 F15 R4 F17)
IP6 ─► F19 (needs F13, F11) ─► F21 (needs everything) ─► dry run #1 (H15)
```
Edge list (the authoritative form):
- F02, F03, F06 ← F01
- F04, F05 ← F03
- F07 ← IP0, F03
- F08 ← F06, F07
- F09 ← F02, F07
- F10 ← F08
- F11 ← F04, F07
- F12, R1, F16, F17, F15, F20 ← F07
- F13 ← IP1, F07
- R2, R3 ← R1
- R4 ← R2, R3
- F14 ← F07, F12
- F18 ← IP3, F10, F11, F13, F14, F15, R4, F17
- F19 ← IP6, F13, F11
- F21 ← all

## 2. Schedule (Track B hours; IP0 ≈ H1.25, IP1 H5.5, IP2 H8, IP5 H10, IP3 H11, IP6 H12, IP4 H14)

| Hours | Work |
|---|---|
| **0:00-1:00** | F01 (haptics page first) → F02 → F03 |
| **1:00-2:00** | F04 → F05 → F06 |
| **2:00-3:00** | F07 (after merging IP0) → F08 |
| 3:00-5:00 | F09 → F10 → F11 → F12 |
| 5:00-5:50 | R1 |
| **G3 ≈ H6** | Screens on fixtures + seeded logins |
| 5:30-6:30 | F13 (IP1) |
| 6:30-6:45 | F16 |
| 6:45-9:00 | **R2 → R3 → R4** (the whole Replay on fixtures, 2 h before IP3) |
| 9:00-10:15 | F17 → F14 → F15 |
| 10:15-11:00 | F20 (IP5) |
| 11:00-11:45 | F18 (IP3) |
| 12:00-12:30 | F19 (IP6) |
| 12:30-13:00 | F21 |
| H13-H15 | Buffer + IP4 joint test (flows 2, 3, 5) → dry run #1 at H15, #2 at H17-18 |

**Critical path:** F01 → F03 → F07 (IP0) → F13 (IP1) → F18 (IP3) → F19 (IP6) → F21 → dry run.
**Headline path:** F07 → R1 → R2/R3 → R4 → F18.

## 3. Deploy
P0, owned by Track B and the integrator (B0b at H0, `vercel deploy --prod` from `main` after each IP merge). The Android phone needs HTTPS for vibration and audio. Track F duties: §0 rules 2 and 5.

## 4. Cut list

### 4.1 Already cut to P1 (the baseline)
- Tamil catalogue. P0 keeps the fonts, the locale and the switcher; the first P1 item is the ≈ 60-key glance layer.
- Proximity radar (Decision 1).
- What-if slider.
- Analytics beyond **the one P0 chart** and the evidence card.
- "My data".
- Separate anomaly table (replaced by `AnomalyExplain` in the Inbox and on the map). Inbox filters, row timeline, FM critical banner.
- Settings screen.
- Voice input and spoken Ask answers.
- Offline action queue.
- Replay for other event types.
- Flow videos.
- Safety "My incidents"; the Map nearby list; quiz retry; Fleet Map extras; the night theme.
- **Ledger entries table** (new in v3: the Verify plate names the broken entry).
- Language RPC (rejected, UI-16).

Re-added in v3: **the ETA analytics chart**. In P0 since v2: deploy (Track B), machine pairing.

### 4.2 If behind: cut in this order
Never cut:
- the one analytics chart;
- the anomaly sentence, litres, ₹ and severity;
- provenance chips;
- the "tamper-evident, human-verifiable" wording;
- any Replay phase.

| Order | Cut | Saves |
|---|---|---|
| 1 | Simple/Detailed toggle → fixed by role | 0.15 h |
| 2 | Ask photo → text-only | 0.25 h |
| 3 | `/op/map` → live markers only (FM map keeps trail and zones) | 0.25 h |
| 4 | Analytics condition selector → `hot` only; MAE table dropped (bars keep values) | 0.15 h |
| 5 | Evidence bars → numbers | 0.15 h |
| 6 | `AnomalyExplain` full → compact everywhere (drop method and inputs) | 0.1 h |
| 7 | Lesson quiz `why` audio → text | 0.1 h |
| 8 | Director presets → typed offset | 0.1 h |
| 9 (last) | Replay polish: `fault_code`/`weather`/`shift_hours` as text rows; scrubber without markers | 0.25 h |

## 5. Contract status
All UI questions (UI-1 to UI-22) are answered in api-contracts §10. Decisions Track F made itself, with no contract change:
- Tamil UI audio: alerts fall back to `en`; other clips are hidden.
- Simple-mode provenance line (Decision 4).
- The chart shows one condition at a time.

New questions go to `docs/sessions/handoff.md` as `[F→B]`.

## 6. Top risks
1. **Only 0.25 h of buffer.** Any slip triggers §4.2 immediately. Hold the dependency order.
2. **Replay's 2.75 h** rests on one `SitePlan` SVG and one `TrendChart`. Replay is built on fixtures by H9, two hours before IP3.
3. **Audio (B23, ≈ H11):** until the manifest lands, the stub manifest keeps [Listen] hidden, so the voice-first demo depends on B23 arriving before dry run #1.
4. **Device and deploy:** vibration and audio need the HTTPS deploy on Android Chrome, and the phone only shows what the integrator has merged.
5. **Hindi:** UI copy and replay/lesson text need a native read before dry run #1. The explanation templates are reviewed under B23.
