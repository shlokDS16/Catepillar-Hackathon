# SPOTTER: product spec v1 (DRAFT for gate G1; not frozen until Shlok approves)

> Inputs: docs/brief/01-04, docs/design/ui-framework.md, docs/research/05-14.
> Traceability: every R-number is from docs/brief/02-requirements.md.

## 1. Name
**Spotter.** On every site, the *spotter* (banksman) is the person who watches the operator's blind
spots, guides every move and shouts before something goes wrong. That is exactly this product.
Tagline: **"Every operator deserves a spotter."**
Alternates if Shlok prefers: **Datum** (surveyor's fixed reference point), **Plumb** (true and level).

## 2. The thesis (why Caterpillar would buy it)
Caterpillar already has smart **machines**: VisionLink telematics, Cat Detect, the Cat AI Assistant,
Simulators and eLearning. What it lacks is a single companion for the **human** that ties them together
across a shift. Spotter is the operator-side layer that turns machine data into:
**today's work → a safe shift → the right response → a better operator.**

The step change is the **Spotter Loop**: every safety event, anomaly or near-miss automatically
becomes (1) a real-time response (alert, voice call, SOS), (2) a tamper-proof record, and (3) a
personalised micro-lesson plus a simulation rehearsal. The operator's own shift writes their
training. Nothing in Cat's stack closes this loop today (research 05, 08).

**North-star KPIs a Cat dealer or fleet can verify:** repeat-event rate (the same alert recurring after
coaching), time-to-proficiency, idle %, and ETA accuracy (estimate vs actual).

## 3. Users
| Persona | Context | Mode |
|---|---|---|
| **Ravi, novice excavator operator** (320 GC), quarry near Nagpur, 44 °C, Hindi/Marathi, limited reading | Phone or tablet in the cab, gloves, glare, noise above 90 dB, patchy signal | Simple mode: voice on, icon+colour+word |
| **Suresh, experienced loader operator**, coal mine in Jharkhand, night shift, Hindi | Tablet, low light | Detailed mode, Console (dark) theme |
| **Anita, site supervisor**, manages 3 sites | Laptop or tablet, Telegram on her phone | Supervisor console |
| (Roadmap) Dealer trainer / Cat instructor | Books sessions, signs off competencies | Instructor view |

## 4. Modules and features
Priority: **P0** = must work in the review-1 demo · **P1** = in the review-1 build if on schedule ·
**P2** = after review 1 (mobile phase) · **R** = roadmap slide only.

### M1. Cockpit and Daily Tasks (PS feature 1; R1, R2)
- P0 **Hero card** (the signature interaction): machine ID, state, current task, % progress, ETA,
  safety state. It changes colour and state word, never decoration.
- P0 **Today's tasks**: an ordered timeline (planned start, ETA, site/zone, conditions chip).
  Start / Pause / Complete, each with an action contract.
- P0 **Conditions chip**: live weather (Open-Meteo) plus site sensors (heat index/WBGT, wind chill,
  altitude, dust), with an impact line such as "Heat: +25 % task time, rest every 45 min".
- P1 **AI shift briefing**: a 30-second spoken briefing in the operator's language (tasks, hazards,
  weather, yesterday's repeat alerts) at shift start.
- P1 **Reminders**: in-app notifications for task start and overdue items, plus the pre-shift walk-around.

### M2. Safety Shield (PS feature 2; R3-R7, R11)
- P0 **Seatbelt compliance**: an alert when *unbuckled AND moving*, escalating when also on a slope
  (Cat Seat Belt Reminder logic, research 10). Compliance % per operator.
- P0 **Proximity hazard**: a three-zone model (awareness / warning / danger, ISO 21815 style),
  separating person↔machine (from a UWB tag) and machine↔machine; a live radar-style mini view on
  the cockpit.
- P0 **PPE status**: helmet, vest and tag from assumed UWB/smart-PPE sensors. A missing item blocks
  "Start Task" with a clear reason.
- P0 **Four-tier alert system** (research 14): Info → Caution → Warning (acknowledgement required,
  times out and escalates) → Critical. Colour, icon, word and vibration, with the TTS phrase in the
  operator's language. Designed against alarm fatigue (EEMUA 191).
- P0 **Working-condition safety**: heat (WBGT work/rest), cold (wind chill, cold-start
  procedure), altitude derate, dust, rain/mud, night, overhead power lines and water geofences
  (research 10 §4 taxonomy).
- P0 **SOS**: a persistent hold-to-arm button on every screen. It fires at once: a Telegram
  message to the manager with live location and an Acknowledge button, an in-app supervisor alert,
  and a Twilio voice call to the manager if nobody acknowledges within N seconds. Escalation goes to
  a human chain, never posing as emergency services.
- P1 **Fatigue signal**: hours on shift, circadian dip and repeated micro-events → a rest prompt
  (assumed wearable data).

### M3. Incident Ledger (PS feature 2 "incident logging"; R5, the cybersecurity angle)
- P0 **Log incident**: pick a type from icons, add a voice note (speech to text), a photo and an
  auto-attached context snapshot (machine, GPS, telemetry, conditions).
- P0 **Tamper-evident hash chain**: each record holds `SHA-256(record || prev_hash)`, and the table
  is append-only at the database role level. A **"Verify ledger"** button recomputes the chain and
  shows ✓ intact, or points to the first broken link. The demo tampers with a row live, and the
  verifier catches it.
- P1 Daily **Merkle root** checkpoint (and, on the roadmap, RFC 3161 timestamping).
- P1 **Voice-to-incident**: the operator speaks in Hindi, and AI structures it into the incident
  form; the operator confirms before submit.

### M4. Site Map and Proximity Guardian (R8, R9, R16)
- P0 **Operator trail** (Strava-style): the shift's GPS breadcrumbs on MapLibre, with the site
  polygon, exclusion zones and geofences.
- P0 **Machine health layer**: every machine coloured by health (OK / anomaly / fault code), with
  its anomaly table and location.
- P0 **Guardian**: when an anomalous or faulty machine is within X m of the operator's position,
  the operator gets a Warning card with a *"what to do"* protocol specific to the anomaly (for
  example a hydraulic burst means stay clear and go upwind; a rollover risk means move uphill and
  out of the swing radius). Unacknowledged, or at Critical, a **Twilio voice call to the operator in
  their language** ("Ravi, machine EXC-014 near you has a hydraulic fault. Move away to the north.
  Press 1 if safe.") plus Telegram to the supervisor.
- P1 **Supervisor fleet map**: all operators and machines, and the correlation of alerts over time.
- P2 Offline basemap as a single PMTiles file.

### M5. Unusual Behaviour Detection (PS feature 4; R15, R16)
- P0 **Rules engine** (explainable): excessive idling (idle % above threshold per machine type,
  from Cat's own baseline of 25 % average), seatbelt off while moving, overspeed, operating on a
  slope beyond the limit, cold-engine over-rev, harsh swing/braking, a warning ignored, fault code
  plus continued operation.
- P0 **Statistical layer**: EWMA/z-score against the machine's own baseline and its model's fleet
  baseline, which catches "unusual for this machine" even under the rule thresholds.
- P0 **Plain-language explanation** for every anomaly ("EXC-007 idled 58 % of the shift, 2.3× its
  normal; about 14 L of fuel wasted, ₹1,300"), with a severity score and an action.
- P1 Isolation Forest as a third opinion, evaluated against the injected ground-truth anomalies
  (precision/recall shown on the backup slide).

### M6. Task Time Estimator (PS feature 5; R17, R18)
- P0 **ETA as a range**: P50 plus a P90 band, from a model trained on the fabricated history. The
  baseline is Cat Performance Handbook-style productivity × multipliers (weather, temperature, wind,
  operator skill, machine age, shift hour/fatigue, soil), and gradient boosting learns the residual.
- P0 **"Why this estimate"**: the top factors as plain bars (for example cold -20 °C: +32 %;
  novice: +18 %).
- P0 **What-if**: change the weather, operator or machine and see the ETA move.
- P0 **Analytics** (supervisor): average time by task type × condition, estimate-vs-actual bias,
  skill-level curves.
- P1 The ETA updates live from task progress (the hero card's ETA).

### M7. Training Hub and the Spotter Loop (PS feature 3; R12-R14, R27)
- P0 **Micro-lessons**: 60-120 s videos (generated in Google Flow/Veo 3.1 from our prompts, dubbed
  per language with Sarvam TTS), each with a 3-question icon quiz. The library is organised by
  machine × skill × condition.
- P0 **Simulation 1, "Spot the Hazard"**: a pre-shift walk-around. Tap the hazards in the correct
  inspection order against the clock. Scored McKinsey-Solve style on outcome *and* process:
  safety, procedure, efficiency.
- P0 **Simulation 2, "Faulty Machine Nearby"**: a branching decision scenario under time pressure,
  which rehearses exactly the Guardian alert from M4.
- P1 Simulation 3, "Cold Start" (step ordering from Cat's cold-weather manual SEBU5898).
- P0 **The Loop**: an event (a seatbelt breach, idling, a near-miss) → an auto-assigned lesson plus a
  simulation → re-measured on the next shifts ("repeat-event rate"). It is visible on the operator's
  home as "Your next 2-minute lesson — because yesterday…".
- P0 **Instructor booking**: slot picker (trainer, machine type, location), confirmation, and a
  Telegram/in-app reminder. Minimal UI.
- P0 **Skill Passport**: competencies at levels Novice → Competent → Proficient → Expert (mapped to
  Cat Operator Levels I-III). Evidence comes from simulation scores, telemetry behaviour, instructor
  sign-off and incident-free hours.
- P2 "Load the Truck" (Phaser), "Reverse Proximity" reaction game. R: Open Badges 3.0 credentials.

### M8. Spotter AI (global assistant; R23)
- P0 **Ask Spotter**: a chat and voice assistant reachable from every screen. RAG over Cat-style
  operating and safety manuals and SOPs in pgvector, with **Claude Citations** so every safety answer
  is quoted from a source. There is a hard refusal ("ask your supervisor") when retrieval finds
  nothing.
- P0 **Tools**: next task, machine status, active alerts, ETA, and "log incident" (behind operator
  approval).
- P1 Voice in and out in 6 languages (Sarvam STT/TTS), push-to-talk.

### M9. Offline-first (R20)
- P0 Persistent **connectivity chip** ("Offline, synced 14:32"). The last-synced snapshot is kept in
  IndexedDB, the safety/anomaly rules run on-device in TypeScript against the cached data, and
  incidents/acknowledgements queue up and replay on reconnect. Cached lessons play offline.
- P0 Demo moment: turn on airplane mode mid-demo and the cockpit, rules, lessons and incident capture
  all still work.
- P2 Native offline (expo-sqlite) in the mobile app.

### M10. Access, languages and modes (R21, R22, R29)
- P0 First launch: pick a language by its own script with voice read-out, then a role, then pair a
  machine.
- P0 **6 languages**: English, हिन्दी, मराठी, తెలుగు, தமிழ், ଓଡ଼ିଆ (next-intl); the language switch
  is one tap from anywhere.
- P0 **Simple / Detailed** toggle (one codebase; fields tagged core or detail).
- P0 Glove-sized targets (15-20 mm; SOS 20 mm+), light high-contrast theme by default, **Console**
  dark theme for night/underground.

### M11. Supervisor Console (implied by PS + teammate; R10, R16)
- P0 Alerts inbox (SOS, Guardian, anomalies, with the Twilio/Telegram dispatch log), fleet map,
  analytics (ETA, idle, safety compliance), incident ledger with Verify, and a team skill view.

## 5. Data (fabricated, enterprise-grade; R19)
- Standards-shaped: fields follow ISO 15143-3 / AEMP 2.0 (hours, idle hours, fuel, DEF, location,
  payload, load count, fault codes in J1939 SPN/FMI and Cat-style CID/FMI with
  Warning→Derate→Shutdown severity).
- Core tables (the teammate's "machine table + operator table, connected"): `operators` and
  `machines` sit at the centre and connect to `sites`, `zones`, `shifts`, `tasks`,
  `telemetry_readings`, `fault_codes`, `safety_events`, `incidents` (hash-chained), `anomalies`,
  `operator_gps_trail`, `weather_snapshots`, `training_modules`, `lesson_assignments`,
  `sim_attempts`, `competencies`, `instructor_slots`, `bookings`, `alerts_dispatch`, and
  `doc_chunks` (RAG).
- Scale: 3 sites (a Nagpur quarry in heat, a Jharkhand coal mine at night, a Himachal highway in
  cold and altitude), 20 real Cat models (320 GC, 336, 950 GC, D6, 745 ADT, 140 grader…), 30
  operators, 90 days. Telemetry at 5 minutes (about 518K rows; the backend-lead decides retention).
- A seeded Python generator with realistic correlations (cold → slower, novice → more idle and more
  alerts, and so on) and **injected labelled anomalies** so detection can be scored honestly.

## 6. Demo story (≈5 min, review 1)
1. **05:58, Ravi opens Spotter** in Hindi. The briefing speaks: 3 tasks, 44 °C heat (rest every
   45 min), and "yesterday: seatbelt reminder twice".
2. **PPE check**: the vest tag is missing, so Start is blocked. He wears it and the task starts. The
   hero card goes to Operational with ETA 52 min (P90 61), and "why" shows heat +22 %, novice +15 %.
3. **Seatbelt unbuckled while moving on a slope** → a Warning with TTS in Hindi → acknowledged →
   recorded in the ledger.
4. **Guardian**: EXC-014, 40 m away, develops a hydraulic-pressure anomaly. The map lights up, the
   protocol card says to move north and upwind, **Ravi's phone rings** with a Hindi voice call,
   and Anita gets a Telegram alert with location.
5. **The Loop**: Ravi's home now shows "2-min lesson: Seatbelt on slopes" and the "Faulty Machine
   Nearby" simulation. Play it: a scored decision tree.
6. **Airplane mode**: everything keeps working, incidents queue, and it syncs on reconnect.
7. **Supervisor view**: the fleet map, idle anomaly (₹ wasted), ETA analytics by condition, the Skill
   Passport, and **Verify ledger**. We tamper with a row live and the chain breaks at #214.
8. **Ask Spotter** (voice, Hindi): "Is it safe to dig near the power line?" → a cited answer from
   the SOP.
9. Close: the KPIs, and how it plugs into VisionLink, Cat Detect and the Cat AI Assistant.

## 7. Integrations (final choice after backend research; .env list in docs/research/12)
Supabase (Postgres, PostGIS, pgvector, Auth, Realtime, Edge Functions, pg_cron for escalation
timers) in **Mumbai** · Claude via the AI SDK (verify the SDK major version in the backend phase) ·
embeddings (Voyage or OpenAI) · Sarvam AI (STT/TTS/translate, with Google as fallback) · Twilio
Programmable Voice (`<Say>`/`<Gather>`, hi-IN voices, trial with a verified number) · Telegram Bot
API · Open-Meteo (no key) · MapLibre + OSM/PMTiles · Serwist (check Next 16 compatibility on day 0).

## 8. Deliberately cut (and why)
- Our own in-cab voice assistant: Cat's AI Assistant already does this. We complement it.
- On-device LLM or offline speech recognition: no mature bridge; offline uses cached answers plus rules.
- Twilio ConversationRelay (two-way AI calls): onboarding isn't instant. One-way call plus "press 1".
- Video scoring, VR, real hardware integration: mocked feed with a clearly labelled data provenance.
- Leaderboards as a headline: they risk rewarding speed over safety.

## 9. UI direction (choice needed from Shlok; framework step 04-05)
- **A. "Site Signage" (recommended).** Off-white base, near-black text, a heavy grotesk for state
  words and numbers, safety yellow/orange/red used **only** for state, sharp corners and boxed
  modules like stencilled safety plates. Best in sunlight and for low literacy.
- **B. "Field Notebook."** Warm paper base, ink-navy, stamp-style state badges, checklist-first.
  Warmest and least "tech".
- **C. "Console."** Dark instrument-cluster styling, tabular numerals. Offered as the **night mode**
  alongside A, not as the default.
Framework amendments (research 14): voice as a first-class channel, glove-sized targets, a stated
light default, a persistent offline chip, SOS exempt from the minimalism pass (hold-to-arm, no modal),
Map as a first-class nav item, a larger motion budget inside the simulations only, and a supervisor
persona.
Operator nav: **Home · Task · Safety · Map · Training** (plus persistent SOS, safety chip,
connectivity chip, language, and Ask Spotter).

## 10. Plan after G1
1. Backend brainstorm by `backend-lead`: 2-3 architecture options, then red team, then ADR-001, the
   schema, the API/contracts and the alert pipeline. Checked by `backend-reviewer`,
   `program-architect` and `phase-validator`. Shlok approves (G2).
2. Supabase project (Mumbai) and .env handover.
3. Switch to Fable 5.1 → build P0 in the order: data + schema → cockpit/tasks → safety + alerts →
   map/Guardian → anomalies → ETA → training + Loop → AI assistant → offline → supervisor → polish.
4. Mobile (Expo) after review 1, reusing @cat/shared.
