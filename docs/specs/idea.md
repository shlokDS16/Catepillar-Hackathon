# SPOTTER: product spec v2 (for gate G1: Shlok's approval)

> v1 → v2: applied the reviews in docs/gates/G1-founder.md, G1-judges.md and G1-program.md (v1 is in git history).
> Inputs: docs/brief/01-04, docs/design/ui-framework.md, docs/research/05-14. R-numbers → docs/brief/02-requirements.md.

## 1. Name and one line
**Spotter.** "Every operator deserves a spotter." On every site, the spotter (banksman) watches the
operator's blind spots and warns before something goes wrong.
Checked: Caterpillar publishes a "Cat Spotters Guide" dealer app, so **never write "Cat Spotter"**. The
product is "Spotter, an operator companion for Cat machines". Datum and Plumb were rejected (Datum is
too abstract; Plumb already has app and tool conflicts).

## 2. Thesis
Cat has smart **machines** (VisionLink, Cat Detect, Cat AI Assistant, Simulators, eLearning). Spotter is
the companion for the **human** across the shift: *today's work → a safe shift → the right response →
a better operator.*

**The leap is Replay.** When Ravi has a near-miss, Spotter rebuilds it as a simulation from *his own*
event: the real site map, his GPS trail, the faulty machine, the wind, and his response time. It asks
him "what should you have done?", scores it, and then tracks whether the event recurs. His shift
writes his training. VisionLink Coaching sends tips; Cat AI Assistant answers questions. We found no
public evidence of any Cat product that turns an operator's own event into rehearsal and then measures
recurrence.

**KPIs** (evidence card, measured on our data and labelled "synthetic cohort"): repeat-event rate,
anomaly detection precision/recall, ETA error vs the organiser's "Estimated time", idle %.

## 3. Honesty rules (the judges will probe these)
- The organisers' two datasets are **exact subsets of our schema**. Their columns load as-is, and every
  field beyond them is labelled *assumed sensor* in the UI (a small "assumed" tag) and in the deck.
- "Tamper-**evident**" (not tamper-proof). "Informed by ISO 21815-3/-4; not a certified collision-warning
  system." "Aligned with Cat Operator Level I categories; instructor sign-off required."
- Anomaly generator and detector are built separately. Labels are held out. Results are reported per
  anomaly type.
- **Phone ≠ in-cab hazard:** while the machine moves, alerts are audio + full-screen with no touch
  needed. Phone calls happen only when the operator is on foot or the machine is parked.

## 4. Build tracks and priorities
- **P0** = review-1 demo (must work live). **P1** = after P0, before review 1 if time allows, else
  before the final. **P2** = mobile phase. **R** = roadmap slide.
- Two parallel tracks in separate git worktrees (this amends the "never parallel" rule: parallel is
  allowed only across disjoint folders):
  **Track B** (backend-lead): `supabase/`, `scripts/`, `packages/shared`.
  **Track F** (ui-ux-lead): `apps/web`.
  The contracts in `packages/shared` are frozen first, so the tracks don't collide.

## 5. Features

### M1. Cockpit and daily tasks (PS-1; R1, R2)
- P0 **Hero card**, the signature interaction: machine, state word, current task, % progress, ETA
  (P50 and a P90 band), safety state.
- P0 **Today's tasks** timeline with Start / Pause / Complete (action contracts).
- P0 **Conditions chip** built end-to-end for **heat (WBGT)** and **cold (wind chill)**, with the ETA
  and safety impact line. Other conditions are data-only rows (R).
- P1 Task reminders (in-app + Telegram). P1 Spoken shift briefing.

### M2. Safety Shield (PS-2; R3-R7, R11)
- P0 **Seatbelt**: unbuckled AND moving, escalating on slopes. Uses the given `seatbelt status` +
  `safety alerts` fields.
- P0 **Proximity**: three zones (awareness / warning / danger), person↔machine (assumed UWB tag) and
  machine↔machine, with a mini radar on the cockpit.
- P0 **PPE** (assumed tags): a missing vest or helmet blocks Start with a clear reason.
- P0 **Four-tier alerts**: Info / Caution / Warning (acknowledge, then timeout escalation) / Critical.
  Colour + icon + word + **vibration** (Vibration API) + pre-generated Hindi TTS audio.
- P0 **SOS**: persistent, hold-to-arm. Sends a Telegram alert (location + Acknowledge button) and a
  supervisor inbox entry. With no acknowledgement in 60 s, it places a Twilio call to the manager.
  The timer is Supabase pg_cron plus a status compare-and-set.
- P1 Fatigue prompt (hours on shift + circadian). R: dust, altitude, power-line and water geofences.

### M3. Incident ledger (PS-2; R5)
- P0 Log an incident: icon types, a note, an auto context snapshot (machine, GPS, telemetry, conditions).
- P0 **SHA-256 hash chain**, append-only by database role. **Verify ledger** shows ✓ or "chain breaks at
  #214". Each new head hash is posted to Telegram as an **external witness**. Live tamper demo.
- P1 Voice-to-incident (Sarvam STT → structured form → confirm). R: Merkle checkpoint + RFC 3161.

### M4. Map and Guardian (R8, R9, R16)
- P0 MapLibre site map: operator trail (Strava-style), zones, machines coloured by health, and an
  anomaly table with locations.
- P0 **Guardian**: an anomalous or faulty machine within X m of the operator raises a Warning card with
  an anomaly-specific protocol ("hydraulic fault: stay clear, move upwind/north"). At Critical, or when
  unacknowledged: **Twilio call to the operator in Hindi** (if on foot or parked; in the cab it is a
  full-screen TTS alert instead), plus Telegram to the supervisor.
- P1 Supervisor fleet map. P2 Offline PMTiles basemap.

### M5. Unusual behaviour (PS-4; R15, R16)
- P0 **Rules**: excessive idling, seatbelt off while moving, overspeed, slope over limit, cold-engine
  over-rev, harsh operation, warning ignored, fault code with continued operation.
- P0 **EWMA/z-score** against each machine's own baseline and its model's fleet baseline.
- P0 **Plain-language explanation + cost** ("EXC-007 idled 58 %, 2.3× normal, ≈14 L ≈ ₹1,300").
- P0 **Measured**: precision/recall per anomaly type on held-out injected labels → evidence card.
- P0 **One anomaly detected live** during the demo (the demo driver streams telemetry; the detector
  catches it; nothing is scripted after the stream).
- P1 Isolation Forest as a third opinion.

### M6. Task time estimation (PS-5; R17, R18)
- P0 **TypeScript model**: a Performance-Handbook-style baseline × condition multipliers (weather,
  temperature, wind, skill, machine age, shift hour) with a calibrated **P90 band** (conformal
  residuals). Trained on the organiser-format dataset.
- P0 "Why this estimate" factor bars + a **what-if** slider.
- P0 **Evidence**: MAE on held-out tasks, ours vs the dataset's own "Estimated time" column.
- P0 Supervisor analytics: average time by task type × condition, estimate-vs-actual bias.
- P1 A gradient-boosting residual model, trained offline in Python and exported as coefficients or a
  lookup, only if it beats the TS model on held-out MAE.

### M7. Training hub and the Loop (PS-3; R12-R14, R27)
- P0 **Replay simulation** (the leap): generated from a real event record. It renders the site map
  snapshot, trail, machine and wind, then gives a 3-4 step decision under time pressure, scored on
  outcome + process (McKinsey-Solve style). Built as a React state machine driven by a scenario JSON
  generated from the event, so any event type can drive it.
- P0 **The Loop**: event → Replay + a micro-lesson assigned on Home ("because yesterday…") →
  repeat-event rate tracked (synthetic cohort chart on the evidence card).
- P0 **Two micro-lessons** (60-90 s, Veo/Flow video in English + Sarvam Hindi dub + a 3-question icon
  quiz): "Seatbelt on slopes" and "Faulty machine nearby". Prompts in docs/research/13 §7, which Shlok
  refines and generates.
- P1 **Instructor booking** (slot picker → confirm → Telegram reminder). P1 **Skill Passport**.
  P1 "Spot the Hazard". R: Cold Start, Load the Truck, Open Badges.

### M8. Ask Spotter, the global assistant (R23)
- P1 (top of P1): RAG over SOP/manual text in pgvector + **Claude Citations**. A hard refusal when
  retrieval is empty; tools (next task, machine status, alerts, ETA). Positioned as **off-machine**
  (walk-around, training, supervisors) so it complements "Hey Cat" in-cab. *Decision for Shlok:
  promote to P0?* It costs about 3-4 h.

### M9. Offline (R20)
- P0 A persistent connectivity chip + "last synced" + a cached last snapshot (the cockpit renders
  offline). P1 on-device rule evaluation + an incident queue + replay on reconnect.
  P2 native offline (expo-sqlite).

### M10. Access and language (R21, R22, R29)
- P0 First launch: pick a language by its native-script name (voice read-out) → role → pair a machine.
- P0 **English + Hindi fully**, plus **Tamil** to prove the script switch (next-intl; strings extracted
  from day 1). P1 Marathi, Telugu, Odia.
- P0 Simple / Detailed toggle (fields tagged core or detail), glove-size targets (≥15 mm; SOS ≥20 mm),
  light high-contrast default. P1 Console night theme.
- P0 **Consent + privacy** (India DPDP Act): location use is disclosed at onboarding, retention is
  bounded, and roles are enforced by RLS.

### M11. Supervisor console (R10, R16)
- P0 Alerts inbox (SOS, Guardian, anomalies + dispatch log), the ledger with Verify, the **evidence
  card**, and the fleet map (shares the M4 components). P1 team skills and full analytics.

### M12. Demo driver (new, required)
- P0 A hidden `/demo` control panel that streams the scripted telemetry scenario (seatbelt off on a
  slope, EXC-014 hydraulic drift, SOS) on cue, with a reset button. Scenario data is real rows fed
  through the real detectors, not UI fakes.

## 6. Data (R19)
- Tables centred on **operators ↔ machines** (the teammate's request) plus sites, zones, shifts, tasks,
  telemetry_readings (the organiser's 9 fields + assumed extras: RPM, load %, coolant/hydraulic
  temperature and pressure, pitch/roll, speed, GPS, DEF), fault_codes (J1939 SPN/FMI + Cat-style
  CID/FMI, Warning→Derate→Shutdown), safety_events, incidents (hash-chained), anomalies,
  operator_gps_trail, weather_snapshots, task_history (the organiser's 7 fields + wind, temperature,
  soil, shift hour), training/lesson/sim tables, alerts_dispatch, doc_chunks.
- Sites: a Nagpur quarry (heat), a Jharkhand coal mine (night), a Himachal highway (cold + altitude).
  20 real Cat models, 30 operators, 90 days.
- A seeded Python generator (uv) with realistic correlations + injected labelled anomalies, which also
  exports **organiser-format CSVs** so judges can see their schema handled directly.

## 7. Demo (≈5 min, 6 timed steps; backup video of every live-call step)
1. **0:00-0:40** Ravi opens Spotter in Hindi → PPE blocks Start → vest on → the task starts. Hero card
   with ETA 52 min (P90 61), and "why": heat +22 %, novice +15 %.
2. **0:40-1:30** A live telemetry stream shows seatbelt off on a slope → Warning, vibration, Hindi TTS →
   acknowledged → ledger entry.
3. **1:30-2:40** **Guardian**: the detector flags EXC-014's hydraulic drift → the map lights up →
   protocol card → Ravi is on foot, so **his phone rings** in Hindi, and the supervisor gets Telegram.
4. **2:40-3:40** **Replay**: Home shows "because of today…". Play Ravi's own near-miss as a scored
   simulation, then the 60 s lesson clip.
5. **3:40-4:30** Supervisor: evidence card (precision/recall, ETA MAE vs the organiser's estimate,
   repeat-event trend) → **Verify ledger** → tamper a row live → the chain breaks, and the Telegram
   witness hash proves it.
6. **4:30-5:00** Close: how it plugs into VisionLink, Cat Detect and Cat AI Assistant; the KPIs; the roadmap.
Q&A backups: offline chip, Ask Spotter (if built), what-if ETA, the Tamil switch.

## 8. Cut or deferred (with reason)
In-cab voice assistant (Cat has one) · on-device LLM / offline STT (no mature bridge) · Twilio
ConversationRelay (onboarding lag) · VR / video scoring / real hardware (mock feed, labelled) ·
leaderboards (reward speed over safety) · 6 full languages in P0 (time) · full offline in P0 (time).

## 9. UI direction (Shlok to choose)
**A "Site Signage" (recommended)** + **C "Console"** as the night theme; B "Field Notebook" as the
alternative. Details in docs/research/14 §6. Framework amendments are adopted: voice first-class,
glove targets, light default, persistent offline chip, SOS exempt from minimalism (hold-to-arm),
Map as a first-class nav item, a motion budget only inside simulations, a supervisor persona.
Operator nav: **Home · Task · Safety · Map · Training**, plus persistent SOS, safety chip,
connectivity chip and language.

## 10. Critical path
Supabase + keys → schema + contracts → seed data + organiser CSVs → alert/dispatch service
(Supabase Edge Functions give the public HTTPS URLs Twilio and Telegram need) → cockpit + demo driver
→ Guardian (map + call + Telegram) → Replay + Loop → supervisor evidence + Verify → deploy → dry run.
