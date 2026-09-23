# Track F task list (to review 1)

- Status: design plan v1 (ui-ux-lead, 2026-09-23). It answers G2-program issue 3 ("Track F has no task list").
- Owner: ui-ux-lead. Worktree: Track F, folder `apps/web` only.
- Budget: about **13 feature hours**. This list is **11.5 h of P0 plus 1.5 h of buffer**, after the cut list in §4. G2 estimated Track F's uncut P0 at about 23 h.
- Design inputs: visual-language.md, interaction-map.md, screens.md. Contracts: api-contracts.md v1.0.0 (under revision; the mismatches are in §5).

## 0. Working rules (from G2-program §1.5, plus our own)

1. **Fixtures first.** Every screen is built against `FixtureAdapter` and only switches to Supabase at the integration point named in backend-tasks §3. Components never import `supabase-js`; they use `DataPort`.
2. Track F never edits `packages/shared`. Contract requests go to `docs/sessions/track-f.md` (the §5 list is posted there at H0). Run `git merge main` right after each Track B integration point.
3. Dependencies are installed once, on `main` at H0 (G2 §1.5a): `next-intl`, `maplibre-gl`, `@supabase/supabase-js` (≥ 2.74 for Broadcast replay), `lucide-react`, `vitest`. npm latest today: next-intl 4.14.6, maplibre-gl 6.11.0.
4. **Every task is done when:**
   - `pnpm --filter web typecheck lint` passes and the vitest suite for its pure logic passes;
   - its strings exist in `en` **and** `hi`;
   - it has been checked at 375 px and 1440 px (screenshot saved to `docs/design/qa/`);
   - no hex value or pixel spacing appears outside `tokens.css` (grep);
   - no hand-written backend type exists (types come from `@cat/shared`).
5. A dev-only route, `/dev/kit`, renders every primitive in every state (§3 of the interaction map) and has buttons that fire fixture events. It is the QA surface and the G3 demo aid. It is excluded from nav and from production builds.

### Minimal structure (`apps/web/src/`)
```
styles/tokens.css            all tokens (visual-language), mapped by Tailwind 4 @theme
i18n/                        next-intl request config (cookie locale), messages/{en,hi,ta}.json at app root
data/port.ts                 DataPort interface: snapshot, subscribe, rpc.*, select.*, ask, director
data/fixture-adapter.ts      fixtures from @cat/shared + a scripted timeline of the demo beats
data/supabase-adapter.ts     the same interface on supabase-js (added at IP1)
state/reducer.ts             applyEvent(state, AnyEvent) → state (pure; unknown types → generic row)
state/selectors.ts           topAlert, safetyState, workState, motionLocked (pure, tested)
components/                  Plate, Button, Chip, HeroCard, AlertTakeover, CautionBanner, SosButton, SosSheet,
                             ConfirmSheet, MapView, ChoiceStep, …
app/(op)/…, app/(fm)/…, app/start, app/director, app/dev/kit
```

## 1. Tasks (ordered; each ≤ 1 h)

| # | h | Needs | Task | Acceptance criteria |
|---|---|---|---|---|
| **F01** | 0.5 | H0 deps | Tokens + fonts + primitives: `tokens.css` exactly as visual-language §1-3, 5; `@theme` mapping; `next/font/google` for Barlow, Barlow Condensed, Noto Sans Devanagari, Noto Sans Tamil; `Plate`, `Button` (all 10 states), `Chip`; `/dev/kit` | Every state from interaction-map §3 visible in /dev/kit. Tabular figures do not shift width when 58 % → 64 %. Axe has no contrast violations on /dev/kit. Focus ring visible on every control |
| **F02** | 0.25 | F01 | i18n: next-intl with a cookie locale (no routing), `en/hi/ta` catalogues, `<html lang>`, per-locale font variables, Indic letter-spacing 0, `LanguageSheet` (A01) | Switching language re-renders every string and `lang` in < 1 s with the same URL. A missing `ta` key falls back to `en` with a dev-console warning |
| **F03** | 0.25 | F01 | Shells: `(op)` and `(fm)` layouts; status strip, title row, bottom nav (< 1024) / left rail (≥ 1024), SOS and Ask slots, z-layers (interaction-map §2); placeholder chips | No horizontal scroll at 360 px. Nav targets ≥ 80 px. Tab order: strip → content → nav → SOS |
| **F04** | 0.5 | F03 | Alert tiers: `CautionBanner`, `AlertTakeover` (warning / critical), `InfoRow`; `useAlertFeedback` (vibration patterns, clip player with a first-gesture unlock, repeat timers, stop on acknowledge, "Sound blocked" fallback); selectors `topAlert`, `safetyState` | vitest: tier precedence, suppressed never shown, NO SIGNAL after 10 s offline. /dev/kit fires each tier. Critical covers the strip while SOS stays on top. Reduced motion removes the stamp |
| **F05** | 0.25 | F03 | `SosButton` (1.5 s hold, keyboard hold, ticks) + `SosSheet` (sending, sent, acknowledged, calling, cancelled, failed/offline with `tel:`, retry every 5 s, 10 s cancel window) on a stubbed port | vitest: release at 1.4 s sends nothing; one `request_id` per hold, reused on retry; a press while active opens the sheet and never sends again |
| **F06** | 0.25 | F01 | `HeroCard` (§0 of screens.md) with `size="card" | "full"`; the motion-lock view = full-size hero + stripe frame + SOS only; selectors `workState`, `motionLocked` with 3 s exit hysteresis | vitest: the work-state table; lock on at once, off only after 3 s stopped. In lock, taps do nothing except SOS. The layout does not change between states (screenshot diff by eye) |
| **F07** | 0.5 | **IP0** (≈ H2) | Merge `main`. `DataPort`, `FixtureAdapter` (snapshot + scripted timeline of beats 1-5, triggered from /dev/kit), `applyEvent` reducer, store (`useSyncExternalStore`), request_id helper | vitest: one test per event family, plus unknown type → generic row. Types only from `@cat/shared` (grep). The fixture mode labels the connectivity chip "FIXTURE", so it can never pass as live |
| **F08** | 0.25 | F06, F07 | Home (S1): hero, conditions row, Loop card, tasks, Simple/Detailed (A05) | Detail fields hidden in Simple mode; the empty state renders; the hero links to Task |
| **F09** | 0.25 | F02, F07 | First launch (S0): language → role → machine → consent (A01-A04); audio unlock | Done in ≤ 5 taps. After it, a Warning clip plays with no extra tap on Android Chrome |
| **F10** | 0.75 | F08 | Task (S2): A06 Start/Resume, A07 Pause, A08 Complete (confirm sheet), the PPE block plate for both paths (§7 of the interaction map), why-factor bars | On fixtures: blocked → vest restored → Start → WORKING; blocked → override granted → Start. A retry reuses the request_id. The Complete sheet names the task and progress |
| **F11** | 0.75 | F04, F07 | Safety (S3): active alerts, checks, my incidents; the Log incident sheet (A13) | Severity maps to 1/3/5; near miss sends `p_non_punitive:true`; an empty note sends the type label; the draft survives a failed send |
| **F12** | 1.0 | F07 | `MapView` (S4): MapLibre + OpenFreeMap positron + paper fallback; trail, rings, machines by health, zones, wind; Guardian card (A12 Listen, A24); nearby list; routes `/op/map` and `/fm/map` | With tiles blocked, the site-plan fallback renders. Frames update GeoJSON sources without re-creating the map. The fixture Guardian beat lights EXC-014 and opens the card |
| **F13** | 1.0 | **IP1** (≈ H6) | `SupabaseAdapter`: persona sign-in, `my_snapshot` + `localStorage` cache, private channels `op:/site:/sup:` after `realtime.setAuth()`, rejoin → Broadcast replay + refetch, connectivity chip state machine, server-time offset | Two browsers (Ravi, Anita) receive their own topics only. Network off → NO SIGNAL in ≤ 10 s with "as of"; network on → LIVE and state caught up |
| **F14** | 0.75 | F07 (IP3 for live) | Inbox (S7) + the FM critical banner + A20 Acknowledge + A21 Grant override sheet | Sort order tier → time; dispatch line from `dispatch.*`; reason validation 10-500 with a counter; success shows "#215 · until 14:17" |
| **F15** | 0.5 | F07 | Ledger (S9): entries, A22 Verify, checkpoints, A23 Compare with Telegram | Fixtures for ok / broken at #187 / root mismatch all render; hashes are monospace and grouped by 4 |
| **F16** | 0.5 | **IP2** (≈ H9) | Live clock and `machines` frames on the hero and the map; `/director` (§4.9) | At 60× the ETA and markers update with no dropped UI input; every director command is logged; the dry-run label is visible |
| **F17** | 1.0 | F07 (+ B10b schema) | Training (S5) + Replay state machine (intro → playback → steps → auto-submit → score) + lesson player reusing `ChoiceStep` for the quiz (A14-A16) | A full run on the fixture scenario (seatbelt on slope). Timeout records "no answer". A live Warning pauses the replay. Reduced motion shows start/end frames |
| **F18** | 0.75 | **IP3** (≈ H11) | Live wiring: `alert_ack`, `sos_raise`/`sos_cancel`, task RPCs, `ppe_override`, `incident_log`, `ledger_verify`, `ledger_root_check`, `replay_submit`, `lesson_complete` | In dry run, beats 1, 2, 4 and 5 run live: one breach shows on hero, Safety, Inbox and Ledger within 2 s; in lock there is no Acknowledge and the alert resolves when the belt is fastened |
| **F19** | 0.5 | F07 | Ask Spotter sheet (S6, A17-A18) on `AskResponse` fixtures; photo compress (≤ 1,600 px) + upload path | `answered` / `refused` / `degraded` render; "Review and log" opens a prefilled A13 |
| **F20** | 0.5 | **IP5** (≈ H15) | Evidence card (S8) from `evidence_metrics`; live ETA factors on Task | Every block shows n or "Not computed yet"; the chart is titled "How we would measure impact" |
| **F21** | 0.5 | **IP6** (≈ H17) | Ask live; Hindi native-read fixes; the reduction pass (ui-framework §15); final QA at 375 / 768 / 1440; axe | No P0 screen has an unlabelled icon, a disabled button without a reason, or a dead button. Hindi is signed off by a native reader |
| | **11.5** | | | Buffer 1.5 h → 13 h |

## 2. Schedule, critical path and the first 3 hours

**First 3 hours** (the program-architect's order, sized honestly):
- **0:00-1:00 · F01 → F02 → F03.** Tokens, fonts and primitives; i18n with a cookie locale; both shells with the persistent chrome. The basemap choice is already made (OpenFreeMap positron + site-plan fallback), so no time goes to it.
- **1:00-2:00 · F04 → F05 → F06.** Alert tiers with vibration and audio, SOS hold-to-arm, the hero card, and the motion lock (the lock *is* the full-size hero). None of these need contracts. /dev/kit drives them.
- **2:00-3:00 · F07 → F08 → F09.** Merge `main` at IP0, the fixture adapter and reducer, Home with the hero and tasks, and first launch.

The rest in wall-clock terms (Track B hours):
- H3-H5.5: F10, F11, F12.
- **G3 (H6 = T+9):** operator screens on fixtures + seeded logins.
- H6-7: F13 (IP1).
- H7-8.25: F14, F15.
- H8.25-9.25: F17 Replay, on fixtures, protected before IP3.
- H9-9.75: F16 (IP2).
- H9.75-10.25: F19.
- H11-11.75: F18 (IP3).
- **H11.75-H15: P0 is done, so run P1 items in the §4 order** while waiting.
- H15: F20 (IP5). H17: F21 (IP6). H18: dry run.

**Critical path:** F01 → F03 → F04/F06 → F07 (IP0) → F08 → F10 → F13 (IP1) → F16 (IP2) → F18 (IP3) → F21 (IP6) → dry run.
**Off-path but demo-critical:** F17 Replay (the leap) depends on Track B's `ReplayScenario` schema (B10b). It is built at H8 on our proposed fixture shape (§5 #3), so a late schema costs a mapping, not the feature.

## 3. Deploy
Demo from `localhost` (two browser windows plus the Android phone on the same Wi-Fi via the laptop's LAN address). Vercel is P1 unless `vercel login` is fixed by H10 (G2-program issue 6, which still has no owner: the orchestrator decides).

## 4. Cut list (P0 → P1, in the order P1 picks them up)

| # | Cut from P0 | What P0 keeps | Saves |
|---|---|---|---|
| 1 | Tamil catalogue (G2 cut #4) | Font, `ta` locale, the switcher. **P1 item 1:** the glance layer (≈ 60 keys: chrome, nav, hero, alerts, SOS), which makes the Tamil switch demoable in about 20 min | 0.75 h |
| 2 | What-if ETA slider | Static "why" factor bars | 0.5 h |
| 3 | Proximity mini-radar (spec M2; G2 cut #5 said static) | Guardian rings on the map + the proximity line in Safety. **Deviation for Shlok to approve** | 0.75 h |
| 4 | Analytics beyond the evidence card (G2 cut #6) | The evidence card with one chart | 0.75 h |
| 5 | "My data" view (M10 privacy) | Consent at first launch, the non-punitive near-miss rule | 0.5 h |
| 6 | Separate anomaly table (M4) | The Inbox "Anomalies" filter + machine popovers on the map | 0.5 h |
| 7 | Settings screen | Language chip, Simple/Detailed on Home, Switch user in the language sheet | 0.5 h |
| 8 | Voice input (Ask, incidents) and spoken answers | Text + photo; pre-generated alert audio | 1.0 h |
| 9 | Offline action queue (M9 P1 already) | Cached snapshot, NO SIGNAL states, SOS `tel:` fallback | 1.0 h |
| 10 | Replay for other event types (G2 cut #7) | One: seatbelt on a slope (demo beat 4) | 0.5 h |
| 11 | Fleet Map extras (all trails, crew fault correlation) | The shared map at site scope | 0.5 h |
| 12 | Machine pairing and a server-side language setting | Display-only machine confirm; cookie locale (no RPCs exist) | 0.5 h |
| 13 | Console night theme, task preview rows, instructor booking, Skill Passport, Spot the Hazard | none (already P1 in the spec, except the night theme) | — |
| 14 | Vercel deploy | localhost | — |

## 5. Contract mismatches and requests (post to `docs/sessions/track-f.md` at H0)

The fixture adapter implements the **requested** shape, so the UI is not blocked. Each item says what the UI does until Track B answers.

| # | Gap (source) | Request | UI until then |
|---|---|---|---|
| 1 | `tasks.progress_pct` has no writer (G2-backend #14) | A frame kind or tick step that updates it | Hide the % figure and bar (never computed from time) |
| 2 | ETA factors: array in `EtaEstimate`, record in `MySnapshotOut` (G2-backend #9) | `eta_factors: EtaFactor[]` everywhere (it needs `assumed`) | Accept both shapes; the record form gets no "assumed" tag |
| 3 | No `ReplayScenario` schema, no read for `lesson_assignments`/`replay_scenarios`, and `ReplaySubmitOut` has no per-step review (G2-program #1) | `ReplayScenario {id, event_id, event_type, occurred_sim_ts, machine_code, summary: I18nText, map {center, zoom, zones[]}, trail[{t_ms,lat,lon}], machine_track[…], wind_from_deg, steps[{step, at_ms, prompt: I18nText, time_limit_s, choices[{id, label: I18nText, pictogram}]}]}` (scoring key stays server-side) + `ReplaySubmitOut.review[{step, chosen, best, why: I18nText}]` + assignments in `my_snapshot` | Fixture of this shape; the score screen shows only the two scores if `review` is absent |
| 4 | No server time for countdowns (escalate_at is wall clock) | `server_now: Ts` in `MySnapshotOut` and `ClockTick` | Countdown against the client clock, labelled "about 14 s" |
| 5 | The client's motion-lock predicate may disagree with `can_call_operator` (parking brake, `in_cab_machine_id`) | `operator_state.motion_locked: boolean` + an event when it changes | `machine.moving && !on_foot` |
| 6 | Seatbelt status and nearest proximity are not in the snapshot; `safety.proximity` is not in `AnyEvent` | `machine.seatbelt_fastened`, `operator_state.nearest {kind, distance_m, zone}` | Seatbelt from the last breach/resolved event; proximity row hidden |
| 7 | Weather has no forecast (spec: "peak 44 °C forecast by 14:00") | `weather.forecast_peak_c`, `forecast_peak_at` | Show the current WBGT only |
| 8 | `protocol_card_id` with no card schema | `ProtocolCard {id, title: I18nText, steps: I18nText[], pictogram, upwind_hint}` + a select | Fixture cards (hydraulic_fault, fire, proximity) |
| 9 | Persona sign-in without shipping demo passwords to the browser | A server-side sign-in route or magic links for Ravi and Anita | Fixture personas |
| 10 | Dispatch events are on `sup:` only | Copy `dispatch.*` for the operator's own SOS to `op:{id}` | SOS sheet shows "Supervisor alerted" without per-channel ticks |
| 11 | No supervisor phone for the offline `tel:` fallback | `site.emergency_tel` in the snapshot | `NEXT_PUBLIC_SITE_EMERGENCY_TEL` in `.env.local` |
| 12 | Is `task_start` valid from `paused`? Does an expired override re-notify the fleet manager? | Specify both | Resume calls `task_start`; expiry just shows BLOCKED |
| 13 | `evidence_metrics` keys are not final (repeat-event rate and idle % were added by G2) | Publish the key list in `@cat/shared` | Render whatever keys exist, "Not computed yet" otherwise |
| 14 | `sos_raise` needs lat/lon; the operator's location can be null | Allow null (the server uses the machine location) | Machine location, else the site centre, flagged in the note |
| 15 | `retention_days` for the consent copy; `p_description` min 1 | A policy constant; allow a null description | "{retention_days}" from config; the type label as the description |
| 16 | No language or pairing RPC | P1 | Cookie; display-only machine |

## 6. Top risks
1. **Schedule density.** Hours 0-3 pack nine tasks. There is 1.5 h of buffer and no more. If behind at H6, cut in §4 order: drop F19 photo upload (text-only Ask), then the lesson quiz (keep the video).
2. **The leap depends on an unwritten contract** (#3). Replay is built on our proposed fixture shape at H8 to protect demo beat 4.
3. **Device capabilities.** The Vibration API does nothing on iOS Safari and on laptops, and browsers block audio until a user gesture. Demo the operator on an Android phone in Chrome, unlock audio at first launch, and have the alert clips ready by ≈ H11 (TTS decision, ADR-002).
4. **Hindi quality.** An LLM draft is not enough for safety text. A native read is required before the dry run (F21).
5. **Glove sizing vs space.** 80 px targets plus a 108 px SOS on a 360 px screen leave little room; Tamil will stress it in P1. QA at 360 px for every screen.
