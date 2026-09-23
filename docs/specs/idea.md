# SPOTTER: product spec v3 (G1 decisions applied 2026-09-23)

> v1 → v2: G1 reviews (docs/gates/G1-*.md). v2 → v3: Shlok's decisions + teammate's improvements (docs/brief/05-g1-decisions.md).
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
- The generator has **hidden effects the model is not told about** (interactions, noise, outliers), so
  the model's metrics aren't circular. Every screen labels its data *simulated* or *assumed sensor*.
- The repeat-event chart is presented as **"how we would measure impact"**, never as proven impact.
- The weather line reads as a forecast ("peak 44 °C forecast by 14:00"), not a claim about the present.
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
- P0 **PPE** (assumed tags): a missing item warns first. Start then needs a **logged supervisor
  override** (who, why, when → ledger), not a hard block (teammate #3).
- P0 **Motion lock**: while the machine moves, the UI is glance-only (big state word, audio, no
  touch needed) and there are no calls to the operator (teammate #3).
- P0 **Alert budget**: merge duplicates, suppress lower tiers while a higher one is active, and cap the
  rate per operator (EEMUA 191).
- P0 **Four-tier alerts**: Info / Caution / Warning (acknowledge, then timeout escalation) / Critical.
  Colour + icon + word + **vibration** (Vibration API) + pre-generated Hindi TTS audio.
- P0 **SOS**: persistent, hold-to-arm. Sends a Telegram alert (location + Acknowledge button) and a
  supervisor inbox entry. With no acknowledgement in 60 s, it places a Twilio call to the manager.
  The timer is Supabase pg_cron plus a status compare-and-set.
- P1 Fatigue prompt (hours on shift + circadian). R: dust, altitude, power-line and water geofences.

### M3. Incident ledger (PS-2; R5)
- P0 Log an incident: icon types, a note, an auto context snapshot (machine, GPS, telemetry, conditions).
- P0 **SHA-256 hash chain** over a **canonical serialization** (sorted keys, fixed number/date
  formats). The previous-hash link is set **server-side inside a locked transaction** (advisory lock),
  never by the client. Append-only by database role.
- P0 **Verify ledger** shows ✓ or "chain breaks at #214".
- P0 **Daily Merkle root published outside the database** to the fleet manager's Telegram (with the
  per-record head hash as P1). The live tamper demo then proves something real: the database no longer
  matches the externally published root (teammate #4).
- P1 Voice-to-incident (Groq Whisper STT → structured form → confirm). R: RFC 3161 timestamping.

### M4. Map and Guardian (R8, R9, R16)
- P0 MapLibre site map: operator trail (Strava-style), zones, machines coloured by health, and an
  anomaly table with locations.
- P0 **Guardian**: an anomalous or faulty machine within X m of the operator raises a Warning card with
  a **fixed, reviewed protocol card per fault type** (not AI-generated) ("hydraulic fault: stay clear, move upwind/north"). At Critical, or when
  unacknowledged: **Twilio call to the operator in Hindi** (if on foot or parked; in the cab it is a
  full-screen TTS alert instead), plus Telegram to the supervisor.
- P1 Supervisor fleet map. P2 Offline PMTiles basemap.

### M5. Unusual behaviour (PS-4; R15, R16)
- P0 **Rules**: excessive idling, seatbelt off while moving, overspeed, slope over limit, cold-engine
  over-rev, harsh operation, warning ignored, fault code with continued operation.
- P0 **EWMA/z-score** against each machine's own baseline and its model's fleet baseline.
- P0 **Plain-language explanation + cost** ("EXC-007 idled 58 %, 2.3× normal, ≈14 L ≈ ₹1,300").
- P0 **Measured**: precision/recall per anomaly type on held-out injected labels → evidence card.
- P0 **One anomaly detected live** during the demo (the scenario engine streams telemetry; the detector
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

### M7. Training hub: feedback-based simulation first (PS-3; R12-R14, R27; decision D10)
Training is built like McKinsey Solve: a scenario, more data than you need, decisions under time
pressure, scored on the **outcome and the process**. Unlike Solve (which gives no feedback), every run
ends in a **coached debrief**. The simulations are the learning; video is optional.
- P0 **Replay**, generated from the operator's own event record. It has four phases:
  1. **Brief** (10 s): what happened, where, and when.
  2. **Investigate** (Solve-style, against a timer): a panel of cards (telemetry trend, wind, map with
     trail and machine, fault code, protocol card, weather, time on shift). Only some are relevant.
     Which cards the operator opens, and in what order, is scored as *process*.
  3. **Decide**: 3-4 sequenced choices (stop / move upwind / radio / approach / SOS), each against a
     countdown.
  4. **Debrief**: scores for safety, procedure and efficiency. It shows the operator's process trace
     next to the ideal one, the one rule to remember (quoted from the fixed protocol card), and an
     **animated re-enactment** (map playback of his real trail, the machine and the wind at 10×).
     That playback is a personalised, auto-generated "video" of his own event.
- P0 **The Loop**: event → Replay + a micro-lesson assigned on Home ("because today…") → the
  repeat-event rate is tracked (evidence card, labelled "how we would measure impact").
- P0 **Micro-lessons** are interactive, not passive: 3-5 illustrated cards (a site-signage graphic, one
  rule each, Hindi TTS audio) plus a 3-question icon quiz with instant feedback.
- P1 **Video clips** (Google Flow, docs/media/video-brief.md) slot into the micro-lesson card 1 **if**
  generated. They are nice-to-have and don't block anything. Fallback: embed one public-domain
  OSHA/NIOSH safety clip, with attribution.
- P1 Instructor booking. P1 Skill Passport. P1 "Spot the Hazard" (same four-phase engine, walk-around
  scene). R: Cold Start, Load the Truck, Open Badges.

### M8. Ask Spotter: shift-aware, multimodal, role-based assistant (R23; Shlok decision: P0)
- Positioning: **complements** Cat AI Assistant. Cat's answers questions about the machine; Spotter's
  knows *this shift, this site, this operator* (live tasks, alerts, conditions, training history) plus
  the full safety and procedures corpus.
- P0 **Advanced RAG on Pinecone**: hybrid (dense + sparse) retrieval, then rerank, then a grounded
  answer. It ingests text, PDFs/manuals (with tables) and **images** (diagrams, and operator photos at
  query time, e.g. "what is this leak?" → vision model → retrieve procedure).
- P0 **Role-based**: the same knowledge, answered per role. Operator: short, voice-friendly, 3 steps.
  Fleet manager: data-rich with live numbers. Trainer: curriculum links. Retrieval is filtered by role
  metadata.
- P0 **Agentic tools** into live Supabase data: next task, machine status, alerts, ETA, and "log
  incident" (only after the operator approves).
- P0 **Strict safety-answer pattern** (teammate #3): cite the source → state the rule → hand over to
  the supervisor. Citations are validated against the retrieved chunk IDs, and when there is no
  evidence it refuses ("ask your supervisor").
- P0 Prompt-injection defence for uploaded documents and images; a 20-question eval (hit@k,
  faithfulness) on the evidence card.
- Models: Groq primary; fallback chain per decision D9 (Groq account A → Gemini → Groq account B), selected by env. Details in docs/research/15-16.

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
- P0 **Privacy by design** (India DPDP Act; teammate #5): consent at onboarding, an operator view of
  "my data", bounded retention, a **non-punitive near-miss mode** (near-misses are used for learning,
  never for discipline), and roles enforced by RLS.

### M11. Supervisor console (R10, R16)
- P0 Alerts inbox (SOS, Guardian, anomalies + dispatch log), the ledger with Verify, the **evidence
  card**, and the fleet map (shares the M4 components). P1 team skills and full analytics.

### M0. Scenario engine: the spine every module runs on (teammate improvement #1)
- P0 **Simulated clock** with speed control (1×, 10×, 60×), so a full shift plays in minutes.
- P0 **Scenario scripts** per shift: a fixed random seed plus scheduled events, so every run replays
  identically.
- P0 **Director panel** (hidden `/director`, guarded by a secret): fire an event, jump to a time,
  reset, switch persona (operator Ravi / fleet manager Anita).
- P0 **One `events` table is the single source of truth.** Every module subscribes to it (Supabase
  Realtime), so one seatbelt breach shows at once on the cockpit, alerts, ledger, map, supervisor inbox
  and Loop. Detectors read the scenario's telemetry stream and write events; nothing in the UI is
  faked.
- Everything except the Telegram message and the Twilio call (weather, telemetry, GPS, sensors) is
  scenario-driven. Those two real integrations are what prove it isn't a mock-up (teammate #6).

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
   protocol card → Ravi is on foot, so **his phone rings** in Hindi, and the fleet manager gets Telegram.
4. **2:40-3:40** **Replay**: Home shows "because of today…". Play Ravi's own near-miss as a scored
   simulation, then the 60 s lesson clip.
5. **3:40-4:30** Supervisor: evidence card (precision/recall, ETA MAE vs the organiser's estimate,
   repeat-event trend) → **Verify ledger** → tamper a row live → the chain breaks, and the Telegram
   witness hash proves it.
6. **4:30-5:00** Close: how it plugs into VisionLink, Cat Detect and Cat AI Assistant; the KPIs; the roadmap.
Q&A backups: offline chip, Ask Spotter (if built), what-if ETA, the Tamil switch.

## 7b. Security story (a slide, plus it is built in)
STRIDE threat model: SOS abuse (rate limit, audit, hold-to-arm), database access (RLS per role, secret
key server-only), device login (auth, session expiry), AI prompt injection (retrieved and uploaded
content treated as data, never as instructions), AI-initiated writes (incident logging needs human
approval), and ledger tampering (canonical hash chain plus an external Merkle root).

## 8. Cut or deferred (with reason)
In-cab voice assistant (Cat has one) · on-device LLM / offline STT (no mature bridge) · Twilio
ConversationRelay (onboarding lag) · VR / video scoring / real hardware (mock feed, labelled) ·
leaderboards (reward speed over safety) · 6 full languages in P0 (time) · full offline in P0 (time).

## 9. UI direction: DECIDED, A "Site Signage" (Shlok, 2026-09-23); C "Console" is a P1 night theme
**A "Site Signage" (recommended)** + **C "Console"** as the night theme; B "Field Notebook" as the
alternative. Details in docs/research/14 §6. Framework amendments are adopted: voice first-class,
glove targets, light default, persistent offline chip, SOS exempt from minimalism (hold-to-arm),
Map as a first-class nav item, a motion budget only inside simulations, a supervisor persona.
Operator nav: **Home · Task · Safety · Map · Training**, plus persistent SOS, safety chip,
connectivity chip and language.

## 10. Critical path
Supabase + keys → schema + contracts + **events table** → scenario engine + generator (built from the organiser's sample) → seed data + organiser CSVs → alert/dispatch service
(Supabase Edge Functions give the public HTTPS URLs Twilio and Telegram need) → cockpit + director panel
→ Guardian (map + call + Telegram) → Replay + Loop → supervisor evidence + Verify → deploy → dry run.
