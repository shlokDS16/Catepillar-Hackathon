# Real-Time Safety, Working Conditions & Geospatial — Research Brief

Research date: 2026-09-23. Scope: friend-prompt.md points 3, 4, 5, 6, 8, 10, 13 plus problem-statement "Real-Time Safety Features" and "Other relevant working-condition safety features." All claims are sourced from live web search; anything not independently verified against a primary/OEM source is marked **[UNVERIFIED]**. Where a design choice cuts against a common hackathon assumption, it is flagged **CONTRARIAN**.

---

## 1. Seatbelt compliance

### How it actually works on Cat machines
- Cat's **Seat Belt Reminder** is a retrofit/factory kit that watches the **parking-brake switch**: if the brake is released (machine about to move) and the belt buckle switch is not closed, it fires an audible alarm in-cab and a continuous light in the buckle housing. An optional external green beacon gives bystanders a visual "unbelted" signal. [Cat Seat Belt Reminder](https://www.cat.com/en_US/products/new/attachments/technology-kits/technology-kits/113020.html), [IPLOCA spec sheet](https://www.iploca.com/app/uploads/2024/09/Caterpillar-Seatbelt-Reminder-System.pdf)
- This is **not** a hard interlock that disables the machine — it is a reminder/logging layer. It logs a discrete **seatbelt event** (unbuckled-while-moving) into **VisionLink**, which supervisors can pull as compliance reports and use for targeted operator retraining. [Cat/VisionLink](https://www.cat.com/en_US/articles/for-owners/enhance-safety-with-cat-seat-belt-reminder.html)
- Underlying sensor pattern generalizable to any OEM: **seat-occupancy switch + seat-brake interlock + buckle micro-switch**, all feeding a telemetry event stream rather than gating hydraulics — this matches the "Seatbelt status" + "Safety alerts" fields already in the hackathon's provided dataset.
- **Design implication:** model our schema on this exact pattern — `seatbelt_status` (buckled/unbuckled), `parking_brake_status`, `machine_moving` (derived from GPS speed or hydraulic activity) → alert fires only when unbuckled AND moving, not just unbuckled-at-idle. This avoids nuisance alerts and mirrors the real product.

### Why operators skip it
- Commonly cited reasons: perceived low risk at low travel speeds, discomfort/restricted mobility when repeatedly twisting to check attachments behind the seat, and a genuine **regulatory gray zone** — OSHA has historically not required ROPS/seatbelts on excavator/backhoe rotating-housing seats the way it does on other earthmoving equipment. [OSHA standard interpretation 1995](https://www.osha.gov/laws-regs/standardinterpretations/1995-09-25-4), [OSHA 2006 interpretation](https://www.osha.gov/laws-regs/standardinterpretations/2006-05-09-0), [Safeopedia](https://www.safeopedia.com/7/4375/personal-protective-equipment-ppe/do-i-have-to-wear-a-seat-belt-while-operating-heavy-machinery)
- **CONTRARIAN point:** the "it's slow, I don't need it" intuition is backwards for exactly the failure mode that kills operators — rollover, not collision. Speed is irrelevant to rollover energy; grade and load position are what matter (see §4 rollover data below).

### Rollover / ejection fatality data
- In vehicle rollovers generally, ~8 of 10 rollover fatalities involve occupant ejection, and unbelted occupants are roughly **22× more likely to be ejected**; ~3 of 4 ejected occupants die. [NHTSA/DOT HS 812 369](https://crashstats.nhtsa.dot.gov/Api/Public/ViewPublication/812369.pdf) — note this NHTSA figure is for **road vehicles**, extrapolated to heavy equipment by analogy; treat the multiplier as **[UNVERIFIED]** for off-road machinery specifically.
- Construction-equipment-specific: rollovers are cited as the **leading cause of death** among heavy equipment operators; in one cited dataset at least 25% of operators killed had not fastened their seatbelt. [Weekly Safety](https://weeklysafety.com/blog/excavator-incident)
- ROPS-plus-seatbelt is ~99% effective at preventing operator death in an overturn; ROPS alone (no belt) is only ~70% effective because the operator can still be partially ejected and struck by the structure. In one small case study, 14 of 19 rollover accidents with ROPS installed but no seatbelt worn were fatal, versus 0 deaths in 5 cases where ROPS + belt were both present. [eLCOSH Construction Chart Book](https://www.elcosh.org/document/1059/270/d000038/sect39.html), [Hard Hat Training](https://www.hardhattraining.com/seatbelts-with-heavy-machinery/) — sample size is small; treat as illustrative, not statistically robust. **[UNVERIFIED — small-n]**

**Design decision:** the seatbelt alert should escalate — (1) in-cab audible/visual at unbuckled+moving, (2) VisionLink-style event log with timestamp/operator/machine, (3) if unbuckled AND machine is on a slope beyond a threshold (see §4) AND moving, escalate severity to "high" and surface on the supervisor dashboard in real time, not just in the end-of-day report. This is a genuine improvement over the reminder-only pattern Cat ships today.

---

## 2. Proximity hazard detection

### Product landscape
- **Cat Detect** (surface) and **Cat MineStar Detect** (underground) are the umbrella proximity/collision-avoidance products. Underground Detect uses a **peer-to-peer GNSS proximity tag network** (worn, or mounted on light vehicles/portable equipment) plus **RFID tags** worn by personnel and detection units mounted on machines, giving sub-meter location awareness to both the site controller and the machine operator. [Cat Detect for Underground](https://www.cat.com/en_US/products/new/technology/detect/detect/102360.html), [Finning MineStar Detect](https://www.finning.com/en_GB/performance/mining-solutions/minestar-detect.html)
- Surface/general proximity detection in the industry more broadly draws on three sensor families: **electromagnetic/radar** (all-weather, works in dust/fog, coarse angular resolution), **RFID/UWB personnel tags** (cheap, needs tag adoption, good ranging with UWB specifically), and **camera + AI object detection** (rich semantic info — can classify "person" vs "vehicle" vs "obstacle" — but degrades in dust, rain, darkness, backlighting). [Engineer Live](https://www.engineerlive.com/content/24498)
- **Cat Command** is the remote/semi-autonomous operation product line (operator physically removed from the cab, controlling via a 900 MHz/2.4 GHz console, line-of-sight or non-line-of-sight, range up to ~400 m) — its safety value is structural (operator never enters the hazard zone) rather than sensor-based, and is the strongest evidence Cat treats "get the human out of the blast/collision radius" as the gold-standard mitigation, not just alerting. [Equipment World](https://www.equipmentworld.com/equipment/article/15281410/cat-adds-remote-command-operation-to-dozers), [Cat Command press release](https://www.cat.com/en_US/news/machine-press-releases/caterpillar-expands-cat-command-remote-control-operation-to-excavator-line-enhancing-safe-machine-operation.html)

### ISO 21815 — collision warning and avoidance for earth-moving machinery
- Multi-part standard (parts 1–5, 2021–2023 vintage, some parts still in draft/DIS stage as of this research). Part 1 sets general requirements: object detection, operator warning, automatic intervention (speed reduction / motion inhibit — **not** automatic steering-away), and test procedures. Part 3 defines **risk area and risk level for forward/reverse motion**; Part 4 covers swing/rotation motion; Part 5 covers other motion types; Part 2 is the J1939 on-board communication interface. [ISO 21815-1](https://www.iso.org/standard/77302.html), [ISO 21815-3](https://www.iso.org/standard/77266.html), [ISO/TS 21815-2](https://www.iso.org/standard/77303.html)
- **Design implication — this maps directly onto a two-zone (not just "warning/danger" binary) design:** ISO 21815's "risk area / risk level" framing implies a **graded field around the machine**, not a single trip-wire. Recommend three concentric zones:
  - **Awareness zone** (outer): object detected, logged, no alert — informational only.
  - **Warning zone** (middle): audible/visual alert to operator + haptic/visual cue to the person if they carry a tag; machine does not auto-intervene.
  - **Danger zone** (inner, swing/rotation and forward/reverse radius adjusted per ISO 21815-3/4 logic): automatic speed reduction or motion inhibit, alert escalates to "critical," logged as a near-miss.
- **Machine-to-person vs machine-to-machine:** the person side (Cat Detect Personnel / GNSS tag) is asymmetric — the tag itself has limited compute, so the *machine* (or a central Detect server) does the risk-area math and pushes the alert to both the tag (buzz/vibrate) and the operator's console. Machine-to-machine, by contrast, can be genuinely **peer-to-peer**, with both machines exchanging position/heading/speed over the network (V2V-style) and computing time-to-collision independently, since both sides have full compute and comms. This is a real architectural distinction: person-side alerts are push/asymmetric, machine-side alerts are negotiated/symmetric.

### Sensor technology summary table

| Sensor | Strength | Weakness | Best for |
|---|---|---|---|
| Radar | All-weather, dust/fog-tolerant, long range | Coarse resolution, no object classification | Machine perimeter, swing-radius danger zone |
| UWB / RFID tag | Good ranging (UWB: cm-level), cheap (RFID) | Needs 100% tag adoption/compliance, battery/maintenance burden | Personnel proximity, geofenced zones |
| Camera + AI | Rich classification (person/vehicle/PPE), can read PPE compliance | Fails in dust, heavy rain, darkness, glare; higher compute cost | Blind-spot detection, PPE/behavior detection |
| GPS/GNSS V2V | Works at long range outdoors, cheap per-unit once GPS exists | Poor accuracy near structures/underground, no line-of-sight requirement | Open-pit/surface machine-to-machine, operator trail (see §6) |

---

## 3. Other operator safety sensing to "assume"

### PPE detection
- Two viable architectures: **camera + AI (YOLO-family object detectors)** trained to flag missing hard hat / vest / gloves / boots from CCTV or body-worn cameras (recent benchmarks report AP50 in the 83–92% range across PPE classes with YOLOv10/transformer variants), or **sensor-embedded PPE** (RFID/UWB tags sewn into helmet/vest, detected by a reader on the machine or site gateway — binary presence/absence, no image processing needed). [Ultralytics PPE dataset](https://docs.ultralytics.com/datasets/detect/construction-ppe), [PMC YOLOv10 PPE study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12297540/), [viAct.ai](https://www.viact.ai/ppedetection)
- For a hackathon demo, **fabricate a `ppe_compliance` boolean/enum per operator per shift** (helmet, vest, gloves) as if sourced from a UWB-tag reader at the machine ingress — this is simpler to fake convincingly than simulating camera-AI output, and is consistent with how MineStar's GNSS/RFID personnel tags already work (§2), so it reuses the same "tag" concept across PPE and proximity.

### Fatigue / drowsiness
- **Cat MineStar Detect / DSS (Driver Safety System)**: non-intrusive in-cab camera watches **eye-closure duration and head pose**, AI-classifies fatigue or distraction events, and alerts the operator via **in-seat vibration + audio alarm**. Cat also runs a human-in-the-loop **Monitoring Center**: DSS video/data is streamed to safety advisors who confirm and call onsite personnel about drowsy/distracted driving — i.e., Cat does not fully trust the model output alone; there's a human review layer. **Guardian 2** is a companion product in the same portfolio. [Cat DSS/Fatigue](https://www.cat.com/en_US/by-industry/mining/surface-mining/surface-technology/detect1/fatigue.html), [International Mining on Cat DSS](https://im-mining.com/2024/02/08/cat-dss-evolving-and-growing-rapidly/)
- **Design implication — CONTRARIAN:** a pure "AI detects fatigue → auto-alert" pipeline is *not* what Cat actually ships; they pair automated detection with human review before hard escalation. For the hackathon, note this as a "future work" item (human-in-the-loop monitoring center) rather than claiming full autonomy — it's more credible and matches real practice.

### Whole-body vibration (WBV)
- **EU Directive 2002/44/EC** sets an **Exposure Action Value (EAV) of A(8) = 0.5 m/s²** and an Exposure Limit Value of 1.15 m/s² r.m.s. (or VDV 21 m/s^1.75), assessed per ISO 2631 (three-axis, frequency-weighted, 8-hour equivalent). Research on heavy-equipment (e.g., load-haul-dump) operators shows real-world exposure on rough surfaces can **exceed the EAV**. [PMC WBV study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9102739/), [EU-OSHA Directive 2002/44/EC](https://osha.europa.eu/en/legislation/directives/19)
- **Design implication:** fabricate a `vibration_rms_ms2` sensor field (seat-mounted accelerometer, plausible on any Cat cab) and compute a running A(8); flag operators approaching 0.5 m/s² as needing task rotation — this is a genuinely underused signal in most hackathon safety dashboards and ties cleanly to task-time-estimation (§ task 5) since rough terrain that spikes vibration also slows the task.

### Heat stress
- WBGT (combines temperature, humidity, sunlight, air movement) drives OSHA/NIOSH work-rest tables. Rough bands: WBGT ≈78°F → minimal rest for light work; ≈85°F → up to 15 min rest/hour for moderate work; **>90°F** → 30+ min rest/hour for heavy work. Acclimatized-worker limits are ~4–5°F higher than unacclimatized-worker limits — i.e., the same WBGT is more dangerous for a worker new to heat. [OSHA Heat](https://www.osha.gov/heat-exposure), [LegalClarity OSHA work-rest chart](https://legalclarity.org/how-to-use-the-osha-heat-work-rest-chart/)
- **Design implication:** the work/rest schedule should be a function of **(WBGT, workload class, acclimatization days)**, not temperature alone — a common oversimplification is "if temp > X, alert," which misses humidity/sun/wind and acclimatization, all of which the real OSHA table accounts for.

### Cold stress
- NIOSH/OSHA cold-stress guidance centers on **wind chill**, not raw air temperature — frostbite risk exists at above-freezing air temps once wind chill is factored in. Illness types: hypothermia, frostbite, trench foot, chilblains. Mitigations: schedule cold jobs for warmer parts of day, shield from wind, warm sweetened liquids, mandatory buddy system. [OSHA Cold Stress Guide](https://www.osha.gov/emergency-preparedness/guides/cold-stress), [CDC/NIOSH Cold Stress](https://www.cdc.gov/niosh/cold-stress/about/index.html)
- Matches Cat's own cold-weather machine spec: Cat defines **Category 4 cold-start conditions as −30 °C to −40 °C**, requiring coolant heater, continuous-flow ether starting aid, and heavy-duty battery/starter package — i.e., the **−20 to −40 °C** band named in the research prompt is a real, named Cat operating category, not an arbitrary hackathon assumption. [Foley Cat cold weather](https://www.foleyinc.com/cold-weather-recommendations-cat-machines/), [Cat SEBU5898 cold weather manual](https://engine.od.ua/ufiles/SEBU5898-12-Cold-Weather-Recommendations.pdf)

### High altitude / low oxygen
- Above roughly 2,500–3,000 m, hypoxemia and Acute Mountain Sickness (AMS) risk rises — headache, dizziness, weakness, nausea, reduced SpO₂, elevated heart rate. Rotational high-altitude mine work (e.g., ALMA observatory pattern: nights at 2,900 m, days at 5,050 m, 7-on/7-off) is a studied real-world analog for mining at extreme altitude. [PMC AMS study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12000330/), [BJA Ed — humans at altitude](https://www.bjaed.org/article/S1743-1816(17)30062-8/fulltext)
- This is separate from and additive to **engine altitude derating** (below) — the operator's own body is derated at altitude, not just the machine.

### Rollover / tip angle
- Most compact/standard excavators are rated for **up to ~30° (≈58% grade)** along-track slope; engines generically are lubrication-limited to ~30°/70% grade regardless of application. Tip-overs mostly happen on embankments, sloped access tracks and cut-face edges, not flat ground — grade, not speed, is the dominant rollover variable, which reinforces the §1 contrarian point about "slow = safe." [Toyota-Takeuchi slope guidance](https://www.toyotatakeuchi.com.au/blog/best-practices-for-excavator-operation-on-slopes-and-uneven-terrain/), [JRD Machinery slope limits](https://www.jrdmachinery.com/news/working-slopes-and-embankments-with-a-mini-excavator-technique-limits-and-safety) — exact tip angle varies by model/counterweight/attachment load, so treat 30° as an illustrative default, not a universal constant. **[UNVERIFIED — model-specific]**
- **Design implication:** fabricate an `inclinometer_deg` field per machine; alert at a configurable threshold (default 25–30°) escalating faster if `load_engaged = true` (loaded bucket raises tip risk at a given angle).

### Overload, LOTO, pre-shift inspection, three points of contact, lone-worker man-down
- **Cat Inspect** is the real product for pre-shift walkarounds: serial-number-specific inspection forms, photo/annotation capture, works offline, syncs later — directly informs our "no-internet mode" design (§10) since Cat's own inspection tool is built offline-first. [Cat Inspect](https://www.cat.com/en_US/articles/for-owners/Using-Cat-Inspect-for-Equipment-Inspections.html)
- Lockout/tagout, three-points-of-contact, and overload are standard OSHA/ANSI practices with no Cat-specific product found in this pass; treat as checklist items inside Cat Inspect-style digital forms rather than sensor-driven features.
- Lone-worker man-down: see §7 (SOS/escalation) — this is where the fabricated "man-down" signal (accelerometer + no-motion timeout) belongs.

---

## 4. Working-condition taxonomy across sectors

| Condition | Hazard | Sensor signal (fabricated, plausible) | Alert rule | Operator action | Productivity impact |
|---|---|---|---|---|---|
| High heat (WBGT) | Heat exhaustion/stroke | `wbgt_c`, `humidity_pct` | WBGT > acclimatized threshold for task load | Mandatory rest cycle, hydration prompt | Task time +20–50% at high WBGT bands |
| Extreme cold (−10 to −40 °C) | Hypothermia, frostbite, cold-start engine failure | `ambient_temp_c`, `wind_speed_kmh` (wind chill) | Wind chill below frostbite threshold | Buddy system prompt, warm-up breaks, Cat Category 3/4 cold-start procedure | Task time +15–40%; engine warm-up adds fixed overhead |
| High altitude (>2500m) | Hypoxemia, AMS, engine power loss | `altitude_m`, operator `spo2_pct` (if wearable assumed) | Altitude > 1,520 m (engine derate threshold) or SpO₂ drop | Engine auto-derate notice to operator; rest/acclimatization schedule | Engine power ↓ ~3%/305 m above threshold; task time ↑ |
| Dust / silica | Respiratory (silicosis), visibility | `pm25_ug_m3` / `dust_index` | Above OSHA/exposure threshold | PPE (respirator) prompt, reduce camera-AI reliance (visibility) | Task time ↑ (reduced visibility slows precision work) |
| Mud / rain | Traction loss, rollover, visibility | `precipitation_mm`, `traction_slip_pct` | Slip detected or heavy rain flag | Reduce speed, avoid slope work | Task time ↑ significantly on grading/excavation |
| Night work | Visibility, fatigue compounding | `ambient_lux`, `shift_hour` | Low lux + late shift hour | Extra lighting check, fatigue monitoring weight ↑ | Task time ↑ modestly; incident risk ↑ |
| Confined space | Asphyxiation, entrapment | `co_ppm`, `o2_pct` (fabricated gas sensor) | O₂ < 19.5% or CO above limit | Evacuate, ventilate, LOTO | Task blocked until cleared |
| Near water | Drowning, submersion of machine | proximity to water polygon (GPS + map layer) | Geofence breach near water body | Slow approach, spotter required | Task time ↑ (extra caution) |
| Overhead power lines | Electrocution | GPS + known power-line geofence layer, boom-angle sensor | Within 10 ft (≤50kV) of line per OSHA 1926.1408/1410 | Stop, de-energize/insulate, or reroute | Task blocked/rerouted |
| Underground / mining | Rockfall, gas, entrapment, low visibility | `co_ppm`, `methane_ppm` (fabricated), UWB personnel tag | Gas threshold or personnel-proximity in blast radius | Evacuate, ventilate | Task blocked |
| Windy conditions | Load swing, crane/boom instability | `wind_speed_kmh` | Above rated wind limit for attachment | Lower load, pause lifting ops | Task time ↑ |

Sources for thresholds used above: OSHA power-line clearance (10 ft up to 50kV, +0.4"/kV above 50kV) — [1926.1410](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1410); altitude derate ~1,520 m base, ~3% power loss per 305 m above — [electrical-engineering-portal](https://electrical-engineering-portal.com/site-conditions-impact-on-caterpillar-genset-ratings); Cat cold-weather Category 4 (−30 to −40 °C) — [Cat SEBU5898](https://engine.od.ua/ufiles/SEBU5898-12-Cold-Weather-Recommendations.pdf). Gas/confined-space and water-proximity thresholds are standard industrial-hygiene practice, not Cat-specific, and are marked **[UNVERIFIED — generic industry practice, not machine-specific]**.

---

## 5. Incident logging — tamper-evident, court-admissible design

### Regulatory/taxonomy backbone
- **OSHA Forms 300 / 300A / 301** (29 CFR 1904): Form 301 captures per-incident detail (employee, physician/facility, date/time, what happened, object/substance involved); Form 300 is the running log (classification: death / days-away / job-transfer-restriction / other-recordable, plus injury/illness type); Form 300A is the annual summary. [OSHA recordkeeping forms](https://www.osha.gov/recordkeeping/forms)
- **ISO 45001** clause 10.2 requires incident *and near-miss* investigation with documented root cause, corrective action, and worker communication of results; clause 9.1 requires ongoing monitoring/measurement. [AssurX on ISO 45001](https://www.assurx.com/aligning-incident-management-with-iso-45001-requirements/)
- **Heinrich/Bird pyramid**: Heinrich's original ratio (from ~75,000 records) was roughly **1 major : 29 minor : 300 no-injury** incidents; Bird's later, larger study (1.7M incidents) produced **1 serious : 10 minor : 30 property-damage : 600 near-miss**. Both are now understood as *industry-era-specific ratios, not universal laws* — modern safety literature treats them as directional (near-misses vastly outnumber injuries) rather than precise multipliers. A healthy near-miss-to-recordable reporting ratio is generally cited as **30–300:1**; a *low* ratio usually signals under-reporting, not a safer site. [risk-engineering.org critique](https://risk-engineering.org/concept/Heinrich-Bird-accident-pyramid), [SmartQHSE](https://www.smartqhse.com/answers/near-miss-reporting-ratio) — **CONTRARIAN point worth stating in the pitch:** don't present a low near-miss count as a safety win; it's more likely a reporting-culture failure, and the dashboard should treat near-miss volume as a *leading* indicator to encourage, not suppress.

### Tamper-evident design
- **Hash chain**: each log record stores `hash_n = SHA256(record_n || hash_{n-1})`. Any retroactive edit to record *n* breaks every subsequent hash, making tampering detectable without needing to re-verify the whole chain by eye. [dev.to — Merkle vs hash chains](https://dev.to/gentlyding/merkle-trees-vs-hash-chains-for-audit-logs-a-practical-decision-guide-361l)
- **Merkle root**: periodically (e.g., hourly or daily) batch the chain into a Merkle tree and publish/anchor the root — this gives O(log n) proof that any individual record is part of the sealed batch, without re-hashing the whole log, and is the efficient complement to the linear hash chain (chain = ordering integrity, tree = fast individual-record proof). [dev.to — audit log architecture](https://dev.to/robertatkinson3570/the-architecture-behind-tamper-proof-audit-logs-56ek)
- **RFC 3161 timestamping**: submit the Merkle root to a trusted third-party Time-Stamp Authority (TSA); the TSA returns a signed token proving the root existed at a specific time — this is what gives the chain independent, third-party-backed evidentiary weight rather than relying solely on the operator's own database clock. [FinQub — tamper-evident audit trails](https://finqub.io/learn/tamper-evident-audit-trail/)
- **Court admissibility**: under US Federal Rules of Evidence 902(13)/(14), electronic records from a certified process can be **self-authenticating** (no live expert-witness testimony required) if accompanied by a certification binding the source hash, timestamp token, and a digital signature (e.g., X.509) into the record. This is the standard cited pattern for admissibility; exact requirements vary by jurisdiction and this should be flagged to the team as **not legal advice**. [FinQub](https://finqub.io/learn/tamper-evident-audit-trail/) **[UNVERIFIED as applied to India / non-US jurisdictions]**

### Recommended Postgres schema
```sql
CREATE TABLE incident_log (
  id              BIGSERIAL PRIMARY KEY,
  occurred_at     TIMESTAMPTZ NOT NULL,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  machine_id      TEXT NOT NULL REFERENCES machine(machine_id),
  operator_id     TEXT REFERENCES operator(operator_id),
  incident_type   TEXT NOT NULL,        -- 'near_miss' | 'first_aid' | 'recordable' | 'property_damage' | 'fatality'
  osha_class      TEXT,                 -- maps to OSHA 300 classification when applicable
  location_geom   GEOGRAPHY(POINT,4326),
  description     TEXT NOT NULL,
  contributing_factors TEXT[],
  severity        SMALLINT,             -- 1-5, feeds Heinrich/Bird pyramid rollup
  reported_by     TEXT NOT NULL,
  investigation_status TEXT DEFAULT 'open',
  record_hash     CHAR(64) NOT NULL,    -- SHA-256(payload || prev_hash)
  prev_hash       CHAR(64) NOT NULL,
  merkle_batch_id BIGINT REFERENCES merkle_batch(id),
  created_by_sig  TEXT                  -- optional digital signature of submitter
);

CREATE TABLE merkle_batch (
  id              BIGSERIAL PRIMARY KEY,
  batch_start     TIMESTAMPTZ NOT NULL,
  batch_end       TIMESTAMPTZ NOT NULL,
  merkle_root     CHAR(64) NOT NULL,
  rfc3161_token   BYTEA,                -- TSA-signed timestamp token over merkle_root
  anchored_at     TIMESTAMPTZ
);
```
Append-only enforcement: revoke UPDATE/DELETE grants on `incident_log` at the DB role level; corrections are new rows referencing the original via a `supersedes_id` column, never in-place edits — this preserves the hash chain's validity by construction.

---

## 6. GPS operator trail & machine proximity (geospatial)

### Breadcrumb trail / Strava-style path
- **PostGIS `ST_DWithin(geom1, geom2, distance)`** is the core proximity-query primitive — index-accelerated true/false test for "is point A within distance D of point B," used with `GEOGRAPHY` type distances are in meters. This is the natural fit for "is the operator within N meters of a flagged/faulty machine." **`ST_MakeLine`** assembles a sequence of GPS points (a "breadcrumb" of operator positions) into a LineString for rendering the walked path, exactly the Strava pattern. [ST_DWithin docs](https://postgis.net/docs/ST_DWithin.html), [PostGIS geofencing](https://dzone.com/articles/how-to-do-simple-geofencing-with-postgis-1)
- Geofencing pattern: pre-defined polygons (exclusion zones, water bodies, blast zones) stored as `GEOGRAPHY(POLYGON)`; a simple `ST_Contains`/`ST_DWithin` query on each new GPS ping determines zone entry/exit events.

### Map rendering stack
- **MapLibre GL JS** (open-source, no vendor lock-in, forked from Mapbox GL after the license change) + **PMTiles** (single-file tile archive format, served via HTTP range requests, no tile server needed) is the recommended offline-capable stack. The entire basemap can be one `.pmtiles` file copied to the device — "no database, no complex tile server, no thousands of individual files, just copy the file and point MapLibre at it." Data source: OpenStreetMap (ODbL license — requires `© OpenStreetMap contributors` attribution) or MapTiler/Protomaps as a build pipeline. [Protomaps PMTiles+MapLibre](https://docs.protomaps.com/pmtiles/maplibre), [maplibre-offline-pmtiles plugin](https://github.com/makinacorpus/maplibre-offline-pmtiles)
- This directly satisfies friend-prompt point 10 (no-internet mode): pre-bundle a `.pmtiles` region extract with the app install, so the map itself renders fully offline; only live telemetry/positions need connectivity, and those degrade gracefully to "last synced" data (see §working-condition point 10 in the brief).

### Battery and privacy
- **Battery**: continuous GPS logging is a known battery drain on mobile; standard mitigation is adaptive sampling (e.g., 1 fix every 10–30s when stationary, faster when moving) — not found as a Cat-specific spec in this pass; treat as general mobile-engineering best practice. **[UNVERIFIED — general practice, not sourced to a specific benchmark]**
- **Privacy — India DPDP Act 2023**: employee/worker location data is personal data under DPDP. **Section 7** provides a "legitimate use" carve-out for employment-related processing (payroll, benefits, attendance, **workplace safety**) that does not require explicit consent — this is directly relevant, since our safety-trail feature plausibly qualifies as workplace-safety processing. However, DPDP does **not** define "for the purposes of employment" precisely, so scope is legally ambiguous, and any monitoring must still satisfy **necessity and proportionality** — i.e., don't collect/retain more granular or longer-retained trail data than the safety purpose requires. Consent, where required, must be free, specific, informed, and revocable. [Legal500 — DPDP for logistics/GPS](https://www.legal500.com/developments/thought-leadership/dpdp-act-compliance-for-logistics-and-supply-chain-companies-in-india-gps-tracking-telematics-and-workforce-data-risks/), [DLA Piper — India employer obligations](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/india-key-employer-obligations-under-indias-new-data-protection-regime)
- **Design implication:** in the pitch, explicitly note the trail is collected under the Section 7 "workplace safety" legitimate-use basis, retained for a bounded window (e.g., 30–90 days) rather than indefinitely, and that operators are informed (not silently tracked) — this is a stronger, more defensible privacy story than most hackathon teams will present, and directly answers "is this legal in India."

### Faulty/anomalous machine near operator — protocol
No single Cat-published "operator encounters faulty machine" protocol was found; the recommended protocol synthesizes standard heavy-equipment safety practice:
1. **Stay clear** — maintain the ISO 21815-style warning-zone distance (§2); do not approach to investigate.
2. **Stop-and-signal** — if the operator is in a machine themselves, stop, engage parking brake, signal (horn/radio) rather than maneuvering closer.
3. **Safe approach** (only if directed by a qualified person) — approach from an angle outside the swing radius, uphill/upslope of the faulty machine to avoid rollover/runaway travel paths.
4. **Move uphill/away from rollover risk** — if the faulty machine is on a slope, do not stand or walk downhill of it.
5. **Hydraulic line burst** — never use bare hands/skin to check for a leak; use cardboard/wood to probe the suspected fluid path (pressurized hydraulic fluid can inject under skin at "bullet speed" with deceptively mild initial symptoms); treat any suspected injection injury as a medical emergency requiring surgical treatment within hours, not a first-aid matter. [Incident Prevention — hydraulic injection injuries](https://incident-prevention.com/blog/high-pressure-hydraulic-injection-injuries/)
6. **Fire-suppression response** — evacuate to a safe distance, do not attempt to fight an engine-bay fire on unfamiliar equipment; if the machine has an onboard suppression system, let it discharge before approaching; call emergency services. (No Cat-specific fire-suppression activation protocol found in this pass — treat as general heavy-equipment practice.) **[UNVERIFIED — general practice]**
7. **Lockout/tagout** the faulty machine before any close-range work, per standard LOTO practice.

This protocol is the natural payload for the SOS/Twilio call described in friend-prompt point 5 and 8: when the operator's GPS trail intersects a "faulty machine" radius, the app should surface exactly this ordered checklist, not just a generic "be careful" alert.

---

## 7. SOS / emergency escalation patterns

- Industry lone-worker apps (SoloProtect, Blackline Safety G7, OK Alone, MyLoneWorkers) converge on a common **tiered escalation** pattern: manual SOS button + passive man-down/no-motion detection + geofence-breach trigger → alert routed first to a monitoring center or first-tier contact → if unacknowledged within a timeout, escalates to next contact in the chain → ultimately to emergency services, with the operator's live location attached at every tier. Man-down detection typically opens a 2-way voice channel so a human can assess severity before escalating further. [SoloProtect man-down](https://www.soloprotect.com/safety-features/man-down-alarm), [Blackline Safety G7](https://www.blacklinesafety.com/solutions/lone-worker/g7-lone-worker)
- **Twilio fit for this app**: **Twilio Programmable Voice** (auto-call supervisor with a TTS message + location) and **Programmable Messaging** (SMS/WhatsApp text with location link) are both viable for the friend-prompt's "SOS button → direct call and message" requirement. Important caveat: **Twilio Programmable SMS is explicitly not designed/certified for delivery to 911/emergency services** — it's fine for calling/texting a *supervisor's* personal number (which is what's being asked here), but should not be pitched as a 911-replacement. Twilio's separate **Emergency Calling API** exists specifically for routing to Public Safety Answering Points (PSAPs) in supported countries, which is a different product from a supervisor-alert use case. [Twilio SMS emergency limitation](https://support.twilio.com/hc/en-us/articles/223134327-Can-I-use-Twilio-SMS-messaging-for-emergency-purposes), [Twilio Emergency Calling for Programmable Voice](https://www.twilio.com/docs/voice/tutorials/emergency-calling-for-programmable-voice) — **so yes, Twilio works for the in-app SOS-to-supervisor flow the friend describes**, but the pitch should be precise that it's supervisor escalation, not a 911 integration.
- **Recommended escalation ladder for this app:**
  1. **Tier 0 (automatic)**: man-down heuristic (accelerometer flat + no input for >60–120s) OR unusual-machine-proximity trigger (§6 protocol) → in-app alert to operator with a cancel window (avoid false-positive call spam).
  2. **Tier 1 (SOS button, manual)**: immediate Twilio voice call to primary supervisor with TTS message including operator name, machine ID, and last-known GPS coordinates; simultaneous SMS/Telegram message with a map link (satisfies friend-prompt point 13).
  3. **Tier 2 (no ack within timeout, e.g., 2 min)**: escalate call/message to secondary contact (site safety officer) and simultaneously push a Telegram bot alert per friend-prompt point 8.
  4. **Tier 3 (no ack, e.g., 5 min)**: surface a prompt for the app to guide the operator (or a bystander) toward calling local emergency services directly — the app itself should not attempt to silently auto-dial 911-equivalent numbers given the Twilio SMS/voice caveat above and jurisdictional emergency-routing complexity.

---

## Summary of confidence

- **High confidence, OEM-sourced:** Cat Seat Belt Reminder mechanism, Cat Detect/MineStar Detect architecture, Cat DSS fatigue detection + Monitoring Center, Cat Inspect offline walkaround app, Cat Command remote operation, Cat cold-weather Category 4 spec, ISO 21815 structure, OSHA power-line clearance, OSHA/EU WBV and WBGT thresholds, PostGIS/MapLibre/PMTiles technical capabilities, Twilio SMS-not-for-911 limitation.
- **Medium confidence, generalized from adjacent domain:** rollover ejection multipliers (road-vehicle NHTSA data applied to heavy equipment by analogy), Heinrich/Bird pyramid ratios (treat as directional, not precise), hash-chain/Merkle/RFC-3161 court-admissibility claims (pattern is well-documented, but not validated against Indian evidentiary law specifically).
- **Low confidence / explicitly fabricated per hackathon rules:** all specific sensor field values (vibration_rms, gas ppm, SpO₂ wearable, inclinometer readings) — these are *design proposals for plausible fabricated telemetry*, not claims about what any real sensor currently reports on a Cat machine.

## 8 most useful design decisions (also in the 300-word summary below)
1. Model seatbelt alert as `unbuckled AND moving`, not just `unbuckled`, and escalate severity when combined with slope angle — mirrors Cat's real logic and reduces nuisance alerts.
2. Use a **three-zone** (awareness/warning/danger) proximity model per ISO 21815, not a binary warning/danger flag.
3. Treat machine-to-person alerts as asymmetric/push (server computes, pushes to tag) and machine-to-machine as symmetric/peer negotiated — this is architecturally real, not arbitrary.
4. Reuse one "tag" concept (UWB/RFID) across PPE compliance and personnel proximity to cut fabricated-sensor surface area.
5. Pair fatigue-AI with a human-review escalation tier (Monitoring-Center pattern), not full autonomy — more credible and matches Cat's real DSS design.
6. Build incident logging as SHA-256 hash chain + periodic Merkle batch + RFC 3161 timestamp anchor, append-only at the DB role level.
7. Ship the basemap as a single offline `.pmtiles` file with MapLibre GL so the map works with zero connectivity, degrading only the live telemetry layer.
8. Frame GPS trail collection under DPDP Section 7 "workplace safety" legitimate use, with bounded retention and operator disclosure — directly defensible in Q&A.
