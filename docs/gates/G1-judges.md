# G1: judge simulation of the Spotter spec (docs/specs/idea.md)

Simulated panel: judge-simulator persona (.claude/agents/judge-simulator.md). Scored against
docs/brief/01-problem-statement.md. Date: 2026-09-23. This scores the spec and the §6 demo story.
Nothing has been built yet.

## Panel scores (1-10)
| Judge | Score | Reason |
|---|---|---|
| Engineering manager | 6 | The architecture is sound (hash chain, on-device TS rules, Postgres core), but about 45 P0 items across 11 modules and 9 external services is far too much to build for review 1. |
| Product owner, operator/dealer | 8 | Real Indian field pain (heat, gloves, literacy, patchy signal), sits alongside VisionLink, Cat Detect and the Cat AI Assistant instead of copying them, and the Loop is a new idea. |
| Data-science lead | 5 | Explainable rules plus EWMA and labelled injected anomalies are the right design, but evaluation is P1 and "backup slide", and no ETA accuracy metric is stated. |
| Hiring manager | 7 | Clear thinking, traceable to requirements, and §8 "deliberately cut" shows judgement. The spec is wider than one team can defend in depth. |
| **Total** | **26/40** | |

## Rubric coverage
| Criterion | Rating | Note |
|---|---|---|
| F1 Daily Task Dashboard | Strong | Hero card, timeline, conditions chip |
| F2 Real-time safety | Strong (overbuilt) | Seatbelt, proximity, PPE, 4-tier alerts, SOS, ledger |
| F3 Training Hub | Strong | Videos, booking, 2 sims, Skill Passport. Veo video generation in 6 languages is a schedule risk |
| F4 Unusual behaviour | **Weakest** | See below |
| F5 Task time estimation | Adequate | P50/P90, "why", what-if are good. No metric against the provided `Estimated time` column |
| Intelligent companion | Strong | The Loop, briefing, Ask Spotter. The briefing that opens the demo is only P1 |
| Efficiency | Adequate | Idle ₹ and ETA exist, but efficiency never leads a demo beat |
| Safety | Strong | |
| Training | Strong | |

## Weakest expected feature: F4 Unusual Behaviour Detection
- In the demo it gets about 10 seconds ("idle anomaly (₹ wasted)" inside the supervisor tour in step 7).
- The Guardian hydraulic anomaly is scripted and uses a field the provided dataset does not have.
- "Unsafe operation patterns" (slope, harsh swing, overspeed) rely on assumed fields. The provided
  telemetry only supports idling, seatbelt-while-alert and load cycles.
- Precision and recall are P1. The data-science judge will ask for them first.
- Fix: make evaluation P0. Detect one anomaly live in Ravi's flow, with its explanation and ₹ figure,
  and show one evidence card (precision/recall per anomaly type).

## Demo length: too long
Nine beats in about 5 minutes leaves about 33 s per beat, and four beats rely on live external
services (Twilio, Telegram, Sarvam voice, airplane-mode sync). Cut to six beats:

| Time | Beat |
|---|---|
| 0:00-0:40 | Open in Hindi, PPE blocks Start, task starts, ETA 52 min (P90 61) with "why" |
| 0:40-1:20 | Seatbelt off on a slope: Warning, Hindi TTS, acknowledge, ledger entry |
| 1:20-2:20 | Guardian: map, protocol card, phone rings, Telegram to Anita |
| 2:20-3:10 | The Loop: lesson assigned, 20 s of the "Faulty Machine Nearby" sim |
| 3:10-4:10 | Supervisor: idle anomaly explained in ₹, then Verify ledger with a live tamper |
| 4:10-5:00 | Evidence card (ETA MAE vs provided estimate, anomaly P/R), Cat integration, KPIs |

**Cut:** airplane mode (show the offline chip only and keep the full demo for Q&A), Ask Spotter
(keep it for Q&A), Skill Passport, the ETA analytics tour, and the fleet-map tour. Either promote the
AI shift briefing to P0 or open without it. Record a fallback video of step 3 in case the Twilio
trial or the venue network fails.

## The 5 hardest questions, with answers
1. **"Our dataset has 9 telemetry fields. Where do hydraulic pressure, slope, UWB and PPE come
   from, and how much works on our data alone?"**
   The organisers allowed extra fields. Every assumed field carries an "assumed sensor" provenance
   tag. Seatbelt compliance, idling and ETA run on the provided schema only, and we show those
   results first.
2. **"Is your ETA better than the `Estimated time` already in the data?"**
   Give the number: MAE/MAPE on held-out tasks (split by operator, no leakage) against the provided
   estimate and the handbook baseline, plus P90 band coverage. This has to be computed before
   review 1.
3. **"Your generator plants the anomalies and your detector finds them. Isn't that circular?"**
   The generator and detector are written separately, the labels are held out, and we report
   precision/recall per anomaly type, including the "below-threshold" ones only the statistical
   layer catches. Real validation would use VisionLink data through the ISO 15143-3 / AEMP 2.0 API.
4. **"A phone screen and a ringing call while operating a 20-tonne excavator: isn't that a new
   hazard?"**
   While the machine moves the UI switches to glance mode: audio plus Critical cards only, and no
   touch needed. Calls fire only at Critical or unacknowledged. The production target is the Cat
   in-cab display and cab audio, not a hand-held phone.
5. **"You list about 45 P0 items. What works end to end today, and what is mocked?"**
   Name the working vertical slice exactly. State which parts are mocked (sensor feeds, video
   scoring, hardware), as §8 already does. Never claim a module that the demo does not run.

## Weakest moment and the one change
- **Weakest moment:** step 4 (Guardian), which needs three live services at once to land the climax.
- **Change that raises the score most:** make measurement P0. One evidence card with ETA error against
  the provided estimate and anomaly precision/recall would move the data-science lead from 5 to 7-8
  and fix F4 at the same time.
