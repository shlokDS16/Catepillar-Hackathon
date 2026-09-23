# Track F task list (to review 1)

- Status: design plan **v2** (ui-ux-lead, 2026-09-23). v2 is re-baselined on api-contracts **revision 3**, D10 training, the P0 web deploy (Track B) and the human-verified ledger witness.
- Owner: ui-ux-lead. Worktree: Track F, `apps/web` only.
- **Budget: about 13 feature hours = 12.5 h of P0 tasks + 0.5 h buffer.** Replay (the headline) gets 2.75 h and is cut last (§4.2).

## Decisions for Shlok
1. **Proximity radar → map rings (recommended).** Spec M2 asks for a mini radar on the cockpit. I recommend not building it. The Map's 15 m / 50 m Guardian rings plus the Safety screen's "Person 22 m · awareness" line (`operator_state.nearest`) carry the same information, and the hero card stays free of a second visual. Saves 0.75 h. Approve, or restore it as P1.
2. **The Replay Brief is untimed.** The spec says "Brief (10 s)". I treat 10 s as the target length of the content, not a clock. The operator presses [Start] when the brief has been read aloud, because a low-literacy operator must hear it through before being timed. Investigate and Decide are timed as specified.
3. **Training urgency is shown in ink, not safety colour.** Timers, right/wrong feedback and scores never use yellow, orange, red or green, so practice never looks like a live alarm.

## 0. Working rules
1. **Fixtures first.** Screens use `DataPort` and `FixtureAdapter` (from `@cat/shared` fixtures, incl. `ReplayScenario`, `ReplayDebriefResult`, `LessonContent`) and switch to Supabase at the IPs below. Components never import `supabase-js`.
2. Track F never edits `packages/shared`. Remaining questions (§5) go to `docs/sessions/track-f.md` at H0. Run `git merge main` after each IP.
3. **Deploy is P0 and owned by Track B** (B0b at H0; a redeploy from `main` at every IP). Track F's duties:
   - (a) `apps/web/public/haptics-test.html` (Vibrate + Play sound buttons) is Track F's **first commit**, merged to `main` before B0b, so the phone test has something to press;
   - (b) `next build` stays green at every merge;
   - (c) `/dev/kit` is excluded from production;
   - (d) the orchestrator merges Track F into `main` before each IP redeploy, otherwise the phone shows stale UI (⚠ §5 #22).
4. **Done means:**
   - typecheck, lint and vitest (pure logic) are green;
   - the strings exist in `en` + `hi`;
   - screenshots at 375 and 1440 px are saved to `docs/design/qa/`;
   - there are no hex or px literals outside `tokens.css`;
   - backend types come only from `@cat/shared`.

## 1. Tasks (ordered; each ≤ 1 h)

| # | h | Needs | Task | Acceptance criteria |
|---|---|---|---|---|
| **F01** | 0.5 | H0 deps | `haptics-test.html` (first), then `tokens.css` + Tailwind `@theme`, the four fonts via `next/font/google`, `Plate`/`Button` (10 states)/`Chip`, `/dev/kit` | Every §3 state visible; `tnum` does not shift width; axe finds no contrast issues; focus ring on every control |
| **F02** | 0.25 | F01 | next-intl with a cookie locale; `en/hi/ta` catalogues; `<html lang>`; per-locale fonts; Indic letter-spacing 0; `LanguageSheet` (A01) | Language switch < 1 s with the same URL; a missing `ta` key falls back to `en` with a warning |
| **F03** | 0.25 | F01 | `(op)` and `(fm)` shells, status strip, nav/rail, SOS and Ask slots, z-layers | No horizontal scroll at 360 px; nav ≥ 80 px; `next build` green |
| **F04** | 0.5 | F03 | Alert tiers (`CautionBanner`, `AlertTakeover`, `InfoRow`), `useAlertFeedback` (vibration, clips, repeats, unlock, "Sound blocked"), the `upgraded_from` stamp; selectors `topAlert`, `safetyState` | vitest: precedence, suppressed hidden, NO SIGNAL after 10 s; Critical covers the strip with SOS on top |
| **F05** | 0.25 | F03 | `SosButton` + `SosSheet` (`location_source`, `server_now` countdown, dispatch line, `tel:` fallback, 10 s cancel) | vitest: release at 1.4 s sends nothing; one `request_id` per hold; no second raise while active |
| **F06** | 0.25 | F01 | `HeroCard` (card / full) and the motion-lock view driven by `operator_state.motion_locked` + `operator.motion_lock_changed`, with a 3 s display hold | In lock only SOS responds; the layout is identical across states |
| **F07** | 0.5 | **IP0** (≈ H1.25) | `DataPort`, `FixtureAdapter` + a scripted timeline of beats 1-5, `applyEvent` reducer, store, request_id helper, `server_now` offset | vitest per event family; unknown type → generic row; chip reads "FIXTURE" in fixture mode |
| **F08** | 0.25 | F06, F07 | Home (S1): hero, conditions (forecast + `source_label`), Loop card, tasks, Simple/Detailed | Detail fields hidden in Simple mode; empty state |
| **F09** | 0.25 | F02, F07 | First launch (S0): A01, A02 through a **Next route handler** `api/demo-login` (holds the director secret server-side) → `verifyOtp`, A03 `pair_machine` (skipped when paired), A04 | ≤ 5 taps; audio plays afterwards with no extra tap on Android Chrome; no secret in the client bundle (grep the build output) |
| **F10** | 0.5 | F08 | Task (S2): A06 (also Resume; `p_eta_factors`), A07, A08 confirm; the PPE plate for vest-restored, override-granted and override-expired | All three PPE fixture paths pass; a retry reuses the request_id |
| **F11** | 0.5 | F04, F07 | Safety (S3): alerts, checks (seatbelt, PPE, nearest, WBGT), the A13 sheet (nullable note; ledger # via `incident.logged`) | Severity maps to 1/3/5; near miss is non-punitive; the draft survives a failure |
| **F12** | 0.75 | F07 | `MapView` (S4): MapLibre + positron + the paper fallback; trail, rings, machines by health, anomaly points, zones, wind; the Guardian card with `ProtocolCard`; `/op/map` + `/fm/map` | Fallback renders with tiles blocked; GeoJSON sources update in place; the fixture Guardian beat opens the card |
| **R1** | 0.5 | F07 | **Replay shell:** `replay_get` via the port, the phase state machine (interaction-map §4.5), phase rail, the REPLAY frame, `useReplayTimer` (monotonic, pauses on hidden or a live alert, explicit Resume), the leave confirm (T10), **Brief** (T2) | vitest: the state machine (every transition, pause/resume, leave); the timer freezes on `visibilitychange`; a live Warning pauses it |
| **F16** | 0.25 | F07 (IP2 check) | `/director` (§4.9 incl. rehearsal, purge) | Every command is logged; the dry-run label is visible |
| **F13** | 1.0 | **IP1** (≈ H5.5) | `SupabaseAdapter`: sign-in, `my_snapshot` + cache, private `op:/site:/sup:` channels, rejoin + replay + refetch, connectivity chip, clock | Ravi and Anita receive only their topics; offline → NO SIGNAL ≤ 10 s; on reconnect the state catches up |
| **R2** | 1.0 | R1 | **Investigate** (T3, T4): card grid, `open_order`, `max_open`, and the 7 `EvidenceCard` renderers, including the `SitePlan` SVG (local-metre projection of zones, trail, track and ⚑; reused by R4) and an SVG `TrendChart` | The fixture scenario renders every card type; the order stamps are right; reopening does not re-record; Decide now is disabled until 1 card is opened; timeout moves to Decide |
| **R3** | 0.5 | R1 | **Decide** (T5, T6): `single` and `order` steps, per-step countdown, `ms`, timeout omits the step, auto-submit `replay_submit` (T7) with retry | vitest: `order` numbering and undo-last; a timed-out step is absent from `p_choices`; submit is idempotent |
| **R4** | 0.75 | R2, R3 | **Debrief** (T8, T9): the re-enactment player on `SitePlan` (Play/Pause, scrubber with ⚑ and ⏱ markers, Restart, 10×, keyboard), scores, the process trace vs ideal with `why`, decision review, the rule plate + Listen, next actions | Autoplays once and never loops; reduced motion → no autoplay; the scrubber pauses playback; a fixture debrief renders every block |
| **F17** | 0.5 | F07 | Lesson (S5c): `LessonContent` cards with audio (T11), a 3-question quiz with instant feedback (T12), `lesson_complete`; Training list (S5a) | Card audio plays and replays; the reveal marks chosen and correct; the score is posted once |
| **F14** | 0.5 | F07 | Inbox (S7): ordering, dispatch line, A20, the A21 override sheet | Reason validation 10-500 with a counter; success shows `valid_until` |
| **F15** | 0.5 | F07 | Ledger (S9): A22 Verify; the A23 witness panel (paste → `WITNESS_LINE` parse → editable range → `ledger_recompute` → side-by-side root and head with first-difference highlight); entries table | Fixtures for match, mismatch (a rehash tamper) and chain break all render; a parse failure falls back to typed range fields; the published side never reads the DB |
| **F20** | 0.5 | **IP5** (≈ H10) | Evidence card (S8) from the `EvidenceKey` rows; live ETA factors | Every block shows n or "Not computed yet"; the impact chart is assigned vs control |
| **F18** | 0.75 | **IP3** (≈ H11) | Live wiring: `alert_ack`, `sos_*`, task RPCs, `ppe_override`, `incident_log`, ledger RPCs, `replay_get`/`replay_submit`, `lesson_complete`, assignments from the snapshot | In dry run, beats 1, 2 and 4 live: a breach shows on the hero, Safety, Inbox and Ledger within 2 s; `training.replay_ready` → Loop card → a full replay → debrief |
| **F19** | 0.5 | **IP6** (≈ H12) | Ask (S6): `AskResponse` fixtures, then live; photo compress + upload; `refusal_reason` copy; the photo category chip; A18 | All statuses and reasons render; "Review and log" opens a prefilled A13 |
| **F21** | 0.5 | F19 | Hindi native-read fixes, the reduction pass, QA at 375 / 768 / 1440 px, axe | No dead or unlabelled controls; no disabled control without a reason; Hindi signed off |
| | **12.5** | | | **+ 0.5 buffer = 13** |

## 2. Schedule, critical path and the first 3 hours

**First 3 hours** (the program-architect's order):
- **0:00-1:00 · F01 → F02 → F03.** The haptics test page first (for B0b), then tokens, fonts, i18n and shells. The basemap is already chosen.
- **1:00-2:00 · F04 → F05 → F06.** Alert tiers, SOS, the hero card and the motion lock. No contracts needed.
- **2:00-3:00 · F07 → F08 → F09.** Merge `main` (IP0 at ≈ H1.25), the fixture adapter, Home, first launch.

The rest (Track B hours):

| Hours | Work |
|---|---|
| H3-H4.75 | F10, F11, F12 |
| H4.75-H5.5 | R1, F16 |
| **G3 (≈ H6 = T+9)** | Operator screens, map and replay brief on fixtures, plus seeded logins |
| H5.5-H6.5 | F13 (IP1) |
| H6.5-H8.75 | **R2, R3, R4.** The whole Replay is built on fixtures before IP3. IP2 (≈ H8) only needs the director and live-clock check folded into the buffer |
| H8.75-H10.25 | F17, F14, F15 |
| H10.25-H10.75 | F20 (IP5) |
| H11-H11.75 | F18 (IP3) |
| H12-H12.5 | F19 (IP6) |
| H12.5-H13 | F21 |
| H13-H15 | Buffer and fixes from the IP4 joint test (flows 2, 3, 5). Dry run #1 at H15, #2 at H17-18. P1 only if nothing is broken |

**Critical path:** F01 → F03 → F04/F06 → F07 (IP0) → F08 → F10 → F13 (IP1) → F18 (IP3) → F19 (IP6) → F21 → dry run.
**Headline path:** F07 → R1 → R2 → R3 → R4 → F18 (`replay_get`/`replay_submit` live at IP3). It finishes on fixtures by H8.75, 2.25 h before its IP.

## 3. Deploy
**P0, owned by Track B** (B0b at H0, redeploy from `main` at every IP). The Android demo phone needs HTTPS for the Vibration API and audio. Track F's duties are in §0 rule 3.

## 4. Cut list

### 4.1 Already cut to P1 (this is the baseline)
| # | Item | P0 keeps |
|---|---|---|
| 1 | Tamil catalogue (G2 cut #4) | Fonts, the `ta` locale, the switcher. **First P1 item:** the glance layer (≈ 60 keys) |
| 2 | Proximity mini-radar | Map rings + the nearest line (Decision 1) |
| 3 | What-if ETA slider | Factor rows |
| 4 | Analytics beyond the evidence card | The evidence card (two-bar impact chart) |
| 5 | "My data" view | Consent (90 days), the non-punitive near miss |
| 6 | Anomaly table; Inbox filters, row timeline, FM critical banner | Inbox sorted by tier; anomaly points on the map |
| 7 | Settings screen | Language chip, Simple/Detailed, Switch user |
| 8 | Voice input and spoken Ask answers | Text + photo; pre-generated audio |
| 9 | Offline action queue | Cached snapshot, NO SIGNAL, SOS `tel:` |
| 10 | Replay for other event types | `safety.seatbelt_breach` |
| 11 | Flow video clips (D10: optional) | Card lessons; `video_path` is ignored in P0 |
| 12 | Safety "My incidents" list; Map nearby list; quiz retry; Fleet Map extras; night theme | — |
| 13 | Language RPC (rejected by Track B, UI-16) | Cookie locale |

Removed from the cut list since v1: **the deploy** (now Track B P0) and **machine pairing** (`pair_machine` exists and is in F09).

### 4.2 If behind: cut in this order (Replay is last, and no Replay phase is ever cut)
| Order | Cut | Saves |
|---|---|---|
| 1 | Simple/Detailed toggle → fixed by role | 0.15 h |
| 2 | Ledger entries table (keep Verify + Compare) | 0.15 h |
| 3 | Ask photo → text-only Ask | 0.25 h |
| 4 | `/op/map` → live machine markers only (FM map keeps trail and zones) | 0.25 h |
| 5 | Evidence card bars → numbers only | 0.15 h |
| 6 | Lesson quiz `why` audio → text only | 0.1 h |
| 7 | Director jump presets → typed offset | 0.1 h |
| 8 (last) | Replay polish only: `fault_code` / `weather` / `shift_hours` cards as plain text rows; scrubber without ⚑ / ⏱ markers | 0.25 h |

## 5. Remaining contract questions (post to `docs/sessions/track-f.md` at H0)
UI-1 to UI-15 are closed by api-contracts rev 3 §10; UI-16 is closed except the language RPC (accepted as P1). New from D10 and the deploy:

| # | Question | UI until answered |
|---|---|---|
| UI-17 | Lesson card, replay situation and prompt audio: `LessonContent` and `ReplayScenario` carry no audio path | Convention `public/audio/{lessons|replay}/{code}/{id}.{lang}.mp3`, generated by the TTS owner (ADR-002); a missing clip hides [Listen] |
| UI-18 | A timed-out Decide step: `choice_ids` needs at least 1, so the UI **omits** the step from `p_choices`. Confirm scoring treats it as wrong and not in time | Omit |
| UI-19 | `training.replay_completed` carries `outcome_score/process_score`, but `ReplayDebriefResult` has safety/procedure/efficiency | The UI shows `ReplayDebriefResult`; the Training "done" row needs a read of the last attempt's three scores (select `replay_attempts`, own rows?) |
| UI-20 | Is `brief.time_budget_s` the Investigate budget? Is `max_open` a hard limit? | Both assumed yes |
| UI-21 | `demo-login` needs the director secret: the UI calls it from a Next route handler with a server-only env var (`DEMO_DRIVER_SECRET`, never `NEXT_PUBLIC_`); Track B adds that var to Vercel | As described |
| UI-22 | Merge path: Track B redeploys `main` at each IP, so Track F must be merged to `main` first (by the orchestrator) | Track F announces a merge-ready commit in its log before each IP |

## 6. Top risks
1. **Replay is 2.75 h on a tight 13 h.** It is protected by building it fully on fixtures by H8.75, by the §4.2 order and by the 0.5 h buffer. A slip in the first 3 hours hits it, so hold the order.
2. **Seven evidence renderers + the re-enactment.** Both rely on one hand-written `SitePlan` SVG and one `TrendChart`, with no map tiles or chart library inside Replay. If `SitePlan` is late, the Investigate map card and the Debrief both slip.
3. **Audio content (UI-17).** Alert, replay and lesson clips in Hindi depend on the TTS decision and on a generator run before ≈ H11. Without them, [Listen] hides and the voice-first promise weakens in the demo.
4. **Device and deploy.** Vibration and audio only work on the HTTPS deploy in Android Chrome. The phone sees Track F work only after it is merged to `main` (UI-22).
5. **Hindi quality.** A native read of safety text and replay prompts is required before dry run #1.
