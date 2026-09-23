# Requirements traceability (every input → one row; nothing may be dropped silently)

Sources: PS = docs/brief/01, F = teammate (03), S = Shlok (04), UI = docs/design/ui-framework.md.
Status: `IN` in scope · `ADAPT` in scope with a change (see note) · `LATER` after review 1 · `OUT` rejected (reason given).
The final status is set in docs/specs/idea.md after Shlok approves.

| # | Requirement | Source | Research | Draft status |
|---|---|---|---|---|
| R1 | Daily task dashboard: the operator's scheduled tasks | PS1, F15 | 14 | IN |
| R2 | Task timeline + reminder notifications | F15 | 12, 14 | IN |
| R3 | Seatbelt compliance | PS2 | 10 | IN |
| R4 | Proximity hazard detection (machine↔person, machine↔machine) | PS2 | 10 | IN |
| R5 | Incident logging, cryptographically hash-chained, tamper-evident | PS2, F4 | 10 | IN |
| R6 | Other working-condition safety: PPE worn (assumed sensors), fatigue, heat/cold, altitude/low pressure, dust, vibration, slope | PS2, F3, F6 | 10 | IN |
| R7 | Working-conditions catalogue across Cat sectors (-20 °C, heat, low pressure, …) | F6 | 10, 11 | IN |
| R8 | Operator GPS trail map (Strava-like) correlated with faulty or anomalous machines nearby, plus a "what to do" guide | F5, F8 | 10 | IN |
| R9 | Twilio AI voice call (multilingual) when an anomalous machine is near the operator | F5, F8, S6 | 12 | IN |
| R10 | Telegram alerts to the manager | F8, S16 | 12 | IN |
| R11 | SOS "saviour" button: call + Telegram to the manager, with location | F13 | 10, 12 | IN |
| R12 | Training hub: e-learning videos | PS3 | 13 | IN |
| R13 | Instructor booking | PS3 | 13 | IN |
| R14 | Simulation modules: McKinsey-Solve-style scenario games, operator-centric, demo-level, mobile-capable | PS3, F7, F14 | 13 | IN |
| R15 | Unusual behaviour: excessive idling, unsafe operation patterns | PS4 | 11 | IN |
| R16 | Anomaly table with machine location | F8 | 11 | IN |
| R17 | Task time estimation from history + environment + human factors | PS5, F9 | 11 | IN |
| R18 | ETA analytics: averages by condition, estimate-vs-actual, weather/temperature effects | F9 | 11 | IN |
| R19 | Fabricated enterprise-grade data: a machine table + an operator table, related, with extra fields | PS data, F1, S1 | 11 | IN |
| R20 | Offline / no-internet mode: last-synced data + on-device analysis | F10 | 07, 12 | IN |
| R21 | Ease of use for low-literacy AND expert operators; simple navigation | F2, F11, F14 | 14 | IN |
| R22 | Multilingual UI + voice (TTS/STT) in Indian languages; language chosen at first launch | F12, UI6 | 12, 14 | IN |
| R23 | RAG + a globally accessible AI assistant chatbot | S10 | 12 | IN |
| R24 | Website first, then a mobile app (TestFlight + Android) | S, D2 | 07 | IN (mobile after review 1) |
| R25 | Supabase as the database | S4 | 12 | IN |
| R26 | .env list with how to obtain each key | S5 | 12 | IN |
| R27 | E-learning media via prompts (Google Flow or better), not CLI generation | S13 | 13 | IN |
| R28 | A strong product name | S15 | — | IN |
| R29 | UI: minimal, industrial, anti-AI-look, action contracts, interaction map, restrained motion | UI | 14 | ADAPT (guidance, not law) |
| R30 | Sellable to Caterpillar: complements Cat AI Assistant / VisionLink / Detect | S, 08 | 05, 08 | IN |
| R31 | Plan reviewed by a big-program planning expert | S | — | IN |

## Status after spec v2 (2026-09-23)
- P0 (review-1 demo): R1, R3, R4, R5, R6 (heat + cold end-to-end, vibration), R8, R9, R10, R11, R12 (2 lessons), R14 (Replay), R15, R16, R17, R18, R19, R20 (connectivity chip + cached snapshot), R21, R22 (EN + HI + Tamil switch), R25, R26 (.env.example), R27, R28 (Spotter), R29, R30, R31.
- P1: R2 reminders, R6 fatigue/other conditions, R13 instructor booking, R14 Spot the Hazard, R20 full offline queue, R22 remaining 3 languages, R23 Ask Spotter (Shlok may promote to P0).
- P2 (mobile phase): R24 Expo app, TestFlight, Android build.
- Nothing dropped silently; deferrals and their reasons are in docs/specs/idea.md §4-§8.
