# Gate G1: program-architect review of `docs/specs/idea.md` (Spotter v1)

- **Date:** 2026-09-23 · **Reviewer:** program-architect (opus)
- **Verdict: READY-WITH-CHANGES.** One change blocks the gate: P0 is about 43 h of work against a 19 h box. The idea, story and traceability are sound. The cut in §4 must be accepted before G2.

## 1. Issues (severity)
1. **BLOCKER: scope.** P0 is ≈43 h (§3). The runbook's 19 h (T+3 to T+22) already holds about 6 h for the checkpoint, QA and hardening, which leaves ≈13 feature hours per builder. Even with the cut in §4 (≈26 h), the plan fits only if **two people run two tracks**. That conflicts with the runbook rule "never build features in parallel". Amend the rule to one track per person, each on its own branch and files.
2. **HIGH: silent drop (R6).** *Vibration* (whole-body vibration) appears nowhere in the spec. Add it to the conditions catalogue or defer it with a reason.
3. **HIGH: R26 unmet.** §7 points to `docs/research/12` for the .env list, but that file does not exist.
4. **HIGH: no demo driver.** Nothing triggers the seatbelt event or the EXC-014 anomaly on cue. Add a hidden scenario panel (1 h). Without it, beats 3 and 4 depend on luck.
5. **HIGH: public URL dependency.** Twilio `<Gather>` and the Telegram Acknowledge button both need an HTTPS webhook, and the Vercel token is invalid (timeline). This is on the critical path.
6. **MED: Twilio trial behaviour.** A trial account plays a preamble and asks for a key press before the TwiML runs, and it can only call verified numbers. Rehearse it, or upgrade the account (Shlok decides, since it costs money).
7. **MED: ETA serving.** A Python gradient-boosting model in a TS/Supabase stack has no serving path. For P0, use a TS multiplier baseline with an empirical P90 band.
8. **MED: deferrals without a reason.** R2 reminders and R6 fatigue are at P1, but the spec gives no reason for either.
9. **LOW: enterprise credibility.** The spec does not cover RBAC roles, data ownership (dealer versus Cat), or worker-location consent under India's DPDP Act 2023. One roadmap slide covers all three.

## 2. Critical path
Supabase (Mumbai) and keys → schema, including the append-only role → seed data → alert and dispatch service → cockpit with the scenario driver → Guardian (map, Twilio call, Telegram) on a **deployed URL** → Loop card and Sim 2 → supervisor Verify → dry run. Twilio verification and the Vercel login are the external items most likely to slip.

## 3. P0 effort (hours, agent-assisted, including integration friction)
| Item | h | Item | h |
|---|---|---|---|
| Schema, RLS, append-only role, load | 1.5 | M5 rules engine | 1.0 |
| Data generator (90 d, 518K rows, injected anomalies) | 2.0 | M5 EWMA/z-score | 0.5 |
| Shell, tokens, 2 themes, Simple/Detailed | 1.5 | M5 explanations (₹) | 0.25 |
| i18n in 6 languages and first-launch flow | 1.5 | M6 ETA model and serving | 1.5 |
| M1 hero card, tasks, action contracts | 1.5 | M6 why bars and what-if | 0.75 |
| M1 conditions chip | 0.75 | M6 analytics | 1.0 |
| M2 seatbelt and PPE gate | 0.75 | M7 lesson player and quiz (plus ~3 h of Shlok's video work, off the path) | 0.75 |
| M2 proximity zones and radar | 1.0 | M7 Sim 1 Spot the Hazard | 2.0 |
| M2 four-tier alerts, acknowledge/escalate, TTS | 1.5 | M7 Sim 2 Faulty Machine | 1.25 |
| M2 working-condition rules | 0.75 | M7 Loop assignment | 0.75 |
| M2 SOS (Telegram, location, Ack, Twilio timer) | 2.0 | M7 booking | 0.75 |
| M3 incident capture (STT, photo) | 1.25 | M7 Skill Passport | 1.0 |
| M3 hash chain, verify, tamper | 1.0 | M8 corpus, embeddings, pgvector | 1.5 |
| M4 trail map and geofences | 1.0 | M8 chat, Citations, refusal | 1.0 |
| M4 health layer and anomaly table | 0.75 | M8 tools | 1.0 |
| M4 Guardian (protocol card, Twilio `<Gather>`, Telegram) | 1.5 | M9 offline (Serwist, IndexedDB, queue) | 3.0 |
| M11 supervisor console | 2.0 | *Unlisted:* demo driver 1.0; deploy and webhooks 1.5 | 2.5 |
| **Total P0** | | | **≈43 h vs 19 h** |

## 4. Cut list (in order; running total)
1. M9 offline → P1 (keep the connectivity chip): **40.0**
2. Sim 1 → P1: **38.0**
3. M8 tools → P1: **37.0**
4. Skill Passport → P1 (a static table in the supervisor view): **36.0**
5. ETA as a TS baseline plus P90 band; GBM → P1; one analytics chart: **34.5**
6. i18n in English and Hindi only (4 languages → P1): **33.75**
7. EWMA → P1: **33.25**
8. Incident voice note and photo → P1: **32.5**
9. Machine↔machine proximity and radar → P1: **32.0**
10. Conditions limited to heat, cold and power line (the rest become a catalogue table): **31.5**
11. Supervisor view limited to the inbox and Verify, reusing the maps and charts: **30.25**
12. Data cut to 30 days, 15-minute telemetry and 10 machines: **29.5**
13. SOS reuses the Guardian dispatch, with a server timer instead of pg_cron: **28.75**
14. Timeout escalation only on the Guardian and SOS alerts: **28.25**
15. Simple/Detailed and the Console theme → P1: **27.5**
16. Booking as a static slot picker without a reminder: **27.0**
17. Conditions chip with a single impact line: **26.75**
18. RAG corpus limited to 3 SOPs; Sim 2 as a 4-node tree: **≈25.75** (fits 2 builders)

For a **single builder**, a coherent demo does not fit in 13 h. The next cuts would be Ask Spotter and Sim 2, and those break beats 5 and 8.

## 5. Shlok: start these NOW, in parallel
1. **Supabase** (Mumbai): create the project. The free tier allows 2 active projects, so pause an old one if needed. Enable PostGIS and pgvector, then hand over the URL, anon key and service-role key.
2. **Twilio:** trial account, one number, verify every demo phone (Ravi, Anita), enable India under Voice Geographic Permissions, and test one call.
3. **Telegram:** get a bot token from BotFather. Anita's phone must send `/start` to the bot so it can capture her chat_id.
4. **Sarvam:** API key and credit check. Pre-generate the Hindi alert TTS clips.
5. **Anthropic** API key, plus one embeddings key (pick Voyage *or* OpenAI now).
6. **Vercel:** log in again and link the project. The webhooks need a public HTTPS URL.
7. **Google Flow/Veo:** one Hindi lesson of about 60 s. This is human time, off the critical path.
