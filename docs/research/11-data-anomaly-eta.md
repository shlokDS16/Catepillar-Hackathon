# Enterprise Data Model, Unusual-Behaviour Detection & Task-Time Prediction — Research

Prepared: 2026-09-23, for the Smart Operator Assistant hackathon build. Covers the technical
grounding for fabricating enterprise-realistic telemetry data, the normalised Postgres/PostGIS
schema, the abnormal-behaviour detection stack, and the task-time (ETA) prediction stack.

**Methodology:** three parallel research passes (telematics standards + open datasets; unsafe-behaviour
definitions + detection methods; task-time productivity factors + models), consolidated and
cross-checked here, plus original schema/data-fabrication design work. Every claim below is either
**[fetched]** (a primary page was directly read), **cross-confirmed** (≥2 independent sources agree),
or **UNVERIFIED** (search-snippet only, page blocked, or no source found — do not present these to
judges as confirmed Cat/OSHA facts without your own follow-up check). See §7 for an explicit list of
contradictions found across sources. This document assumes/duplicates nothing from
`docs/research/05-cat-operator-ecosystem.md` (existing Cat products) — read that file for the
competitive-whitespace angle; this file is the technical-implementation layer.

---

## 1. Telematics standards that make fabricated data look enterprise-real

### 1.1 ISO 15143-3 (AEMP 2.0)

ISO/TS 15143-3:2020, "Earth-moving machinery and mobile road construction machinery — Worksite data
exchange — Part 3: Telematics data," is the international standard (built on AEMP 2.0, developed by
the Association of Equipment Management Professionals) for machine-telematics data exchange between
OEM servers and third-party fleet software. [ISO catalogue](https://www.iso.org/standard/76394.html)
(title/scope only — the standard itself is paywalled).

Data elements, cross-confirmed across two independent vendor implementations
([Flespi AEMP protocol docs](https://flespi.com/protocols/aemp), [AutoPi AEMP explainer](https://www.autopi.io/blog/what-is-aemp-telematics-standard/)):

| Field | Notes |
|---|---|
| `OEMName`, `Model`, `PIN`/`SerialNumber`, `EquipmentID` | Equipment identity |
| `Location.Latitude/Longitude/Altitude` | GPS position |
| `CumulativeOperatingHours` | Engine-on hours, lifetime |
| `CumulativeIdleHours` | Idle-while-running hours |
| `CumulativeIdleNonOperatingHours` | Key-on/engine-off idle hours |
| `FuelUsed` (lifetime), `FuelUsedLast24` | Fuel consumption |
| `FuelRemaining.Percent` | Fuel tank level |
| `DEFRemaining.Percent` | Diesel Exhaust Fluid level |
| `Distance.Odometer` | Distance traveled |
| `EngineStatus.Running` / `EngineCondition` | Engine health flag |
| `CumulativeLoadCount` | Load-cycle counter |
| `CumulativePayloadTotals` | Cumulative payload |
| `AverageLoadFactorLast24` | Daily average engine load |
| `MaximumSpeedLast24` | Daily peak speed |
| `CumulativePowerTakeOffHours`, `CumulativeActiveRegenerationHours` | PTO hours, DPF regen hours |
| Fault Codes (separate timeseries entity) | Cat's own throttling docs describe a dedicated Fault Codes endpoint, rate-limited at 100 calls/sec vs 30 calls/sec for the other timeseries fields — **UNVERIFIED** exact field-level schema (page blocked, [digital.cat.com developer guide](https://digital.cat.com/knowledge-hub/articles/iso-15143-3-aemp-20-api-developer-guide), search-snippet only) |

Also corroborated by [Trackunit's ISO 15143-4 explainer](https://trackunit.com/articles/benefits-from-iso-15143-4/)
and [Mantrac's (Cat dealer) ISO 15143-3/AEMP 2.0 page](https://www.mantracgroup.com/en-iq/technology/link/iso-15143-3-aemp-2-0-api/).

### 1.2 Cat VisionLink API

Cat exposes **two** API tiers from its Cat Digital Marketplace (digital.cat.com), per its own FAQ
(search-snippet confirmed, page 403'd on direct fetch —
[source](https://digital.cat.com/knowledge-hub/faq/iso-15143-3-aemp-20-api-faqs)):
1. **ISO 15143-3 (AEMP 2.0) API** — the generic cross-OEM standard above, recommended for "basic use cases."
2. **VisionLink API** — "defined by Caterpillar, not the international standards," offering "more
   enriched data" (recommended when richer data is needed).

Access is OAuth 2.0 with a Cat-approved subscription request (~2-week process, UNVERIFIED exact
timeline). The **3rd Party API Integrations Tool** lets fleet owners feed AEMP 2.0 data from
non-Cat OEMs into VisionLink for a mixed-fleet view
([announcement](https://digital.cat.com/news-and-announcements/3rd-party-api-integrations-tool-available)).
Payload data is explicitly called out as unavailable on older PL523 hardware, implying payload is a
normal field on newer Product Link hardware. The exact enumerated list of VisionLink-only fields
beyond the AEMP set is **UNVERIFIED** (developer-guide pages were 403-gated) — model your fabricator
as a two-tier schema: a generic AEMP/ISO-15143-3 base layer, plus a "VisionLink-enriched" layer
(richer fault detail, precise payload/load-count, digital switch inputs) on top.

### 1.3 Fault code formats

**SAE J1939 SPN/FMI** [fetched, CSS Electronics](https://www.csselectronics.com/pages/j1939-73-dm1-diagnostic-message-dtc):
- **SPN (Suspect Parameter Number):** 19-bit identifier of the failed component/parameter.
  Standardized SPNs run **1–24,324** (per the J1939 Digital Annex); the manufacturer-proprietary
  range is **516,096–524,287**.
- **FMI (Failure Mode Identifier):** 5-bit value, **0–31** (0 = data above normal range/most severe,
  5 = open circuit, 31 = proprietary/non-specific failure mode).
- Verified example pairs ([HVI J1939 explainer](https://heavyvehicleinspection.com/blog/post/j1939-fault-codes-spn-fmi-explained), [J1939Hub](https://j1939hub.com/)):
  SPN 110 (engine coolant temp); SPN 3361 FMI 5 (DEF dosing unit open circuit); SPN 791 (left steer
  wheel speed sensor); SPN 1569 FMI 31 (Engine Protection Torque Derate); SPN 157 FMI 18 (fuel
  injector rail pressure below normal).
- Heavy-equipment **hydraulic/swing/boom circuits are largely not covered by standardized J1939
  SPNs** — they're OEM-proprietary and reported via Cat's own CID scheme instead. No specific
  hydraulic SPN numbers beyond the above were confirmed — **UNVERIFIED**, use J1939Hub's lookup tool
  if more are needed.

**Cat-proprietary MID/CID/FMI** [fetched, getclue.com](https://www.getclue.com/blog/all-about-caterpillars-spn-fmi-cid-and-mid-codes-and-how-to-decipher-them):
- **MID (Module Identifier)** — which ECM detected the fault (e.g. MID 116 = Integrated Brake Control).
- **CID (Component Identifier)** — Cat-proprietary circuit/component ID, not shared with other OEMs.
  Confirmed example CIDs: CID 854 (brake oil temp sensor), **CID 1961 (hydraulic oil temperature
  sensor — directly usable for your hydraulic-fault fabrication)**, CID 3565 (A/C pressure sensor),
  CID 1469 (SAE J1939 data link).
- FMI is the same standardized failure-mode vocabulary as J1939.
- Worked example synthesized from multiple secondary Cat fault-code sites: "MID 036 CID 0110 FMI 03"
  = Engine ECM detected coolant-temp-sensor voltage above normal — **UNVERIFIED exact pairing**,
  though the MID/CID/FMI structure itself is corroborated across 4+ independent sources.

**Cat Event Identifier (EID)** [fetched, caterpillarfaultcodes.com](https://www.caterpillarfaultcodes.com/caterpillar-event-codes-event-identifiers-eid/) —
a third, distinct Cat-proprietary code type for significant events (not just circuit failures),
numeric range ~1–10,050. Confirmed examples: EID 15/16/17 = High Coolant Temp
Derate/Shutdown/Warning; EID 5/6/53 = Fuel Filter Restriction Derate/Shutdown, Low Fuel Pressure
Warning; EID 377/378 = 250/500-hour maintenance due; EID 201–216 = per-cylinder misfire;
EID 401–420 = per-cylinder detonation. **The EID vocabulary gives a directly citable severity
taxonomy: Warning → Derate → Shutdown** (escalating operator alert → automatic power reduction →
forced safe stop).

**Severity/caution-warning levels:** two schemes found, of differing confidence:
1. A third-party fleet-maintenance vendor describes a Cat "Warning Level 1/2/3" system
   ([HVI](https://heavyvehicleinspection.com/blog/post/cat-product-link-cmms-integration-work-order))
   but search results were **internally inconsistent on which level (1 or 3) is most severe** — do
   not use numbered levels without your own primary-source confirmation (see §7, contradiction #2).
2. The EID-native **Warning / Derate / Shutdown** vocabulary above is directly observed and
   higher-confidence.

**Recommendation:** use a 4-level severity enum for fabricated fault/caution records —
**Informational, Caution/Warning, Derate, Shutdown/Critical** — directly grounded in the EID
evidence, avoiding the ambiguous "Level 1/2/3" numbering.

---

## 2. Open datasets usable as-is or as a template

| Dataset / API | URL | Licence | Usable as-is or template? |
|---|---|---|---|
| APS Failure at Scania Trucks | [Kaggle](https://www.kaggle.com/datasets/uciml/aps-failure-at-scania-trucks-data-set) / [UCI mirror](https://archive.ics.uci.edu/dataset/421/aps+failure+at+scania+trucks) | GNU GPL v3+ | Real, licensed heavy-vehicle sensor telemetry (170 anonymized features) with failure labels. Not construction equipment — best used as a **structural template** for a multi-sensor + fault-label table. |
| SCANIA Component X dataset | [Nature Sci Data paper](https://www.nature.com/articles/s41597-025-04802-6) / [arXiv](https://arxiv.org/abs/2401.15199), DOI 10.5878/jvb5-d390 | CC BY 4.0 (cross-confirmed, not primary-fetched) | ~33,000 real trucks, operational readouts + time-to-failure labels + repair records. Large-scale **template** for predictive-maintenance schema/volume, not directly usable as CAT construction-machine data. |
| "Industrial Equipment Monitoring Dataset" / "Industrial IoT Fault Detection Dataset" (Kaggle, several near-identical listings) | e.g. [kaggle.com/datasets/dnkumars/industrial-equipment-monitoring-dataset](https://www.kaggle.com/datasets/dnkumars/industrial-equipment-monitoring-dataset) | **UNVERIFIED** — pages didn't render on fetch | Likely generic industrial IoT, plausibly themselves synthetic/generator-made. **Check the licence badge yourself before citing**; treat as schema inspiration only. |
| Excavator activity-recognition research (IMU-based) | [ResearchGate paper](https://www.researchgate.net/publication/382522200), [CSU East Bay PDF](https://www.csueastbay.edu/engineering/files/docs/papers/construction-equipment-activity-recognition-for-simulation-input-modeling-using-mobile-sensors-and-machine-learning-classifiers.pdf), [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0926580520310451) | Papers are open-access; **no confirmed public raw-data release** | **Methodology template only** — use their sensor placement (boom/arm/bucket IMUs) and activity taxonomy (dig/swing/load/travel/idle) to make your fabricated accelerometer/pitch-roll fields realistic. No downloadable dataset found. |
| Idle-time/fuel simulation study | [CSU East Bay PDF](https://www.csueastbay.edu/engineering/files/docs/papers/simulation-based-evaluation-of-fuel-consumption-in-heavy-construction-projects-by-monitoring-equipment-idle-times.pdf) | Open-access paper | Reports 15–30% (up to 80% in some cases) idle time and ~7x higher non-idle vs idle emission rates — **use to calibrate realistic idle-ratio parameters**, not a downloadable dataset. |
| Construction project schedule/task-duration datasets (Kaggle, several) | e.g. [ziya07/construction-project-performance-dataset](https://www.kaggle.com/datasets/ziya07/construction-project-performance-dataset) (self-described as "50,000 records simulating time-series data" — i.e. synthetic) | **UNVERIFIED** per-dataset | **Templates only** — several appear self-declared synthetic; good as structural references for a task-duration table, not as ground truth. |
| Nodes & Links project-schedule research database | [arXiv paper](https://arxiv.org/pdf/2312.12906) (118 real projects, ≥1,000 activities each) | Underlying data **not public** (proprietary) | Reference only for realistic task-duration distribution shapes — confirmed **not downloadable**. |
| **Open-Meteo Historical + Forecast Weather API** | [docs](https://open-meteo.com/en/docs/historical-weather-api), [pricing](https://open-meteo.com/en/pricing) | Free, no API key for non-commercial use [fetched] | **Directly usable, highest-confidence item in this table.** ERA5/ERA5-Land reanalysis from 1940/1950; hourly fields include temperature, humidity, dew point, precipitation, rain, snowfall, WMO weather codes, sea-level pressure, cloud cover, wind speed/direction/gusts at 10m & 100m, soil temp/moisture, solar radiation; daily aggregates too. Rate limit is not stated on the docs page itself — a secondary blog cites **10,000 calls/day non-commercial**, **UNVERIFIED at primary-source level**, confirm on the pricing page before hard-coding. Attribution: *Zippenfenig, P. (2023). Open-Meteo.com Weather API [Computer software]. Zenodo.* |

**Bottom line:** no confirmed, currently-downloadable, construction-equipment-specific open telemetry
dataset exists — every real, licensed dataset found (Scania APS Failure, Scania Component X) is
heavy-trucking, not construction/earthmoving, and is best used as a **structural/volume template**.
Open-Meteo is the one item in this section that should be wired in directly rather than templated.

---

## 3. Proposed normalised schema (Postgres + PostGIS)

Single-tenant hackathon schema (add an `org_id` column everywhere later for multi-tenant SaaS).
`geography(Point, 4326)` for GPS points, `geography(Polygon, 4326)` for zone boundaries — requires
`CREATE EXTENSION postgis;`. All tables have `id uuid primary key default gen_random_uuid()` and
`created_at timestamptz default now()` unless noted.

### Core reference tables

**`sites`** — `name`, `site_type` (construction/quarry/mining/agriculture/manufacturing_yard),
`location geography(Point,4326)`, `address`, `timezone`.

**`zones`** (FK `site_id`) — `name`, `zone_type` (work/hazard/no_go/parking/fuel_depot),
`boundary geography(Polygon,4326)`, `max_speed_kmh`, `max_slope_deg`. GIST index on `boundary`.

**`machines`** — `serial_number` (unique), `model` (enum: `320_gc_excavator`, `950_gc_wheel_loader`,
`d6_dozer`, `745_articulated_truck`, `140_grader`, …), `machine_type`, `manufacture_year`,
`purchase_date`, `cumulative_hours numeric`, `service_status` (operational/scheduled_maintenance/
down), `last_service_at`, `next_service_due_hours`, `home_site_id` FK, `current_location
geography(Point,4326)`. GIST index on `current_location`.

**`operators`** — `employee_code` (unique), `full_name`, `skill_level` (novice/intermediate/expert),
`certifications jsonb`, `languages jsonb` (e.g. `["en","hi","te"]`), `preferred_language`,
`experience_hours numeric`, `hire_date`, `phone_e164`, `telegram_chat_id`, `emergency_contact_phone`.

**`shifts`** (FK `operator_id`, `machine_id`, `site_id`) — `shift_type` (day/night/swing),
`scheduled_start`, `scheduled_end`, `actual_start`, `actual_end`, `status`. Index on
`(operator_id, scheduled_start)` and `(machine_id, scheduled_start)`.

### Task & analytics tables

**`tasks`** (FK `site_id`, `zone_id`, `machine_id`, `operator_id`, `shift_id`, `weather_snapshot_id`) —
`task_type` (excavation/trenching/material_loading/grading/demolition), `material_type` (sand/loam/
clay/rock_blasted/rock_unblasted), `planned_start`, `estimated_duration_min`, `actual_start`,
`actual_end`, `actual_duration_min` (generated), `status` (planned/in_progress/completed/cancelled),
`job_condition_rating`, `management_condition_rating` (excellent/good/fair/poor — see §5.1),
`p50_estimate_min`, `p90_estimate_min` (model outputs). Index on `(machine_id, planned_start)`.

**`telemetry_readings`** — the high-volume table (FK `machine_id`, `operator_id` nullable,
`task_id` nullable) — `ts timestamptz`, `engine_hours_cumulative`, `idle_hours_cumulative`,
`fuel_used_l`, `fuel_remaining_pct`, `def_remaining_pct`, `load_cycles_count`, `payload_kg`,
`engine_load_pct`, `rpm`, `coolant_temp_c`, `hydraulic_temp_c`, `hydraulic_pressure_bar`,
`speed_kmh`, `pitch_deg`, `roll_deg`, `location geography(Point,4326)`, `gps_altitude_m`,
`seatbelt_fastened boolean`, `ppe_status jsonb` (helmet/vest/gloves/boots each bool, per friend-prompt
point 3), `parking_brake_engaged boolean`. **Partition by month on `ts`.** Indexes:
`(machine_id, ts)` btree, GIST on `location`, BRIN on `ts` for the partitioned table.

**`fault_codes`** (FK `machine_id`, `telemetry_reading_id` nullable) — `ts`, `code_type`
(j1939_spn_fmi/cat_cid_fmi/cat_eid), `spn int`, `fmi int`, `cid int`, `mid int`, `eid int`,
`description`, `severity` (informational/caution/derate/shutdown — §1.3), `is_active`, `resolved_at`.
Index `(machine_id, ts)`.

**`safety_events`** (FK `machine_id`, `operator_id`, `task_id` nullable) — `ts`, `event_type`
(seatbelt_off_moving/ppe_missing/harsh_brake/harsh_swing/overspeed/slope_exceeded/cold_overrev/
boom_raised_travel/bucket_over_cab/warning_ignored/fatigue_signal), `severity`,
`location geography(Point,4326)`, `details jsonb`, `resolved boolean`. Index `(operator_id, ts)`,
`(machine_id, ts)`.

**`incidents`** (FK `safety_event_id` nullable, `machine_id`, `operator_id`) — hash-chained per the
friend-prompt (point 4): `ts`, `incident_type`, `description`, `severity`, `reported_by`,
`status` (open/investigating/closed), **`prev_hash char(64)`, `curr_hash char(64)`** where
`curr_hash = SHA256(prev_hash || canonical_json(incident_fields))`; the first row's `prev_hash` is
64 zeros (genesis block). Append-only (revoke `UPDATE`/`DELETE` grants at the DB role level; any
correction is a new row referencing the original). A periodic job can verify the chain by
recomputing hashes end-to-end and comparing to stored values — this is the auditability guarantee,
not blockchain/distributed consensus (be precise about that distinction with judges).

**`anomalies`** (FK `machine_id`, `operator_id`) — `ts_start`, `ts_end`, `anomaly_type`,
`detection_method` (rule/zscore/ewma/isolation_forest), `severity_score numeric` (0–100, §4.4),
`contributing_features jsonb`, `explanation text` (human-readable "why"),
`ground_truth_label boolean` (set by the fabricator when an anomaly was deliberately injected — used
to compute precision/recall for the judge demo, §6), `acknowledged boolean`, `resolved boolean`.

**`operator_gps_trail`** (FK `operator_id`, `shift_id`) — the Strava-style path (friend-prompt point
5): `ts`, `location geography(Point,4326)`, `accuracy_m`, `speed_kmh`,
`nearby_machine_ids uuid[]` (machines within a proximity radius at that timestamp — computed via
`ST_DWithin` against `machines.current_location`), `proximity_alert boolean` (true if a nearby
machine has an open fault/anomaly). GIST index on `location`; this is what powers "operator wandered
near a faulty machine → alert" logic.

### Training & engagement

**`training_modules`** — `title`, `module_type` (elearning_video/simulation/instructor_led),
`machine_type`, `skill_level_target`, `duration_min`, `languages jsonb`, `content_url`,
`description`.

**`training_bookings`** (FK `operator_id`, `module_id` nullable, `instructor_name` nullable) —
`booking_type` (elearning/simulation/instructor), `scheduled_at`, `status`
(booked/completed/cancelled/no_show), `location`.

**`training_progress`** (FK `operator_id`, `module_id`) — `started_at`, `completed_at`,
`score_pct`, `attempts`, `status`.

### Environment & alerting

**`weather_snapshots`** (FK `site_id` nullable) — `ts`, `temperature_c`, `feels_like_c`,
`humidity_pct`, `wind_speed_kmh`, `wind_gust_kmh`, `precipitation_mm`, `visibility_km`,
`weather_code`, `source` (open_meteo/fabricated). Index `(site_id, ts)`.

**`alerts_log`** — the Twilio/Telegram fan-out (friend-prompt points 5, 8, 13, 16): FK
`operator_id`, `machine_id` nullable, `anomaly_id` nullable, `incident_id` nullable; `alert_type`
(sos/unusual_machine_nearby/fatigue/telegram_broadcast), `channel` (twilio_voice/twilio_sms/
telegram), `recipient`, `sent_at`, `status` (queued/sent/failed/acked), `message_text`.

### Realistic row volumes (20 machines × 30 operators × 90 days)

| Table | Sampling assumption | Row count |
|---|---|---|
| `telemetry_readings` | 1-min interval, 24h/day, 20 machines, 90 days | 20 × 1,440 × 90 = **2,592,000** |
| `telemetry_readings` | 5-min interval (recommended default — see below) | 20 × 288 × 90 = **518,400** |
| `operator_gps_trail` | 1-min interval, 8h active shift, 30 operators, 90 days | 30 × 480 × 90 = **1,296,000** |
| `operator_gps_trail` | 5-min interval | 30 × 96 × 90 = **259,200** |
| `tasks` | ~4 tasks/machine/day, 20 machines, 90 days | ≈ **7,200** |
| `fault_codes` | sparse — assume ~1 per machine per 3 days | ≈ **600** |
| `safety_events` | ~1–2% of telemetry rows flagged | 5-min basis ≈ **5,000–10,000** |
| `anomalies` | derived/aggregated from safety_events + statistical flags | ≈ **1,000–3,000** |
| `weather_snapshots` | hourly, 3 sites, 90 days | 3 × 24 × 90 = **6,480** |
| `incidents` | rare — a handful per week across the fleet | ≈ **50–150** |

**Recommendation:** default to **5-minute telemetry** for the fabricated dataset (518K rows is
comfortably fast to seed/query/demo in Postgres/Supabase on a free tier) and generate a **short
1-minute-resolution burst** (e.g. one machine, one day) only for the anomaly-detection demo screens
where fine granularity visibly matters (harsh-swing/braking detection genuinely needs sub-minute
resolution to be meaningful — flag this to the team: 5-minute data cannot really show "harsh
braking," so either keep a 10–30 second stream for a couple of demo machines/days, or scope harsh-
event detection to the 1-minute-resolution subset only).

---

## 4. Unusual-behaviour detection

### 4.1 Excessive idling — thresholds

No single official Cat "excessive idle %" document was found; the strongest Cat-attributable figures
come from a KHL Group interview quoting Caterpillar's Peter-Valentin Sauter:
**"equipment idles around 25% of the time" on average**, and **"idling time for trucks can exceed
50%" in quarry operations** [fetched, khl.com](https://www.khl.com/1134885.article). Cat's own
VisionLink supports a configurable "Excessive Idle Threshold" but publishes no fixed default
([cat.com](https://www.cat.com/en_US/articles/for-owners/visionlink-software-analyzes-the-data-for-you.html)).
Non-Cat vendor sources (not peer-reviewed) converge in the 30–45% band for unmanaged fleets
([FleetRabbit](https://fleetrabbit.com/industry/construction-management-system/how-to-reduce-equipment-idle-time-construction-sites)).
Academic idle-reduction research (CSU East Bay, §2 above) reports 15–30% typical, up to 80% in some
cases.

**Recommendation (synthesized, not a single official number — say so to judges):**
- Normal/baseline idle: **~25%** (Cat's own Sauter figure)
- Flag/excessive: **≥40%**
- Critical: **≥50%** (matches Cat's own "can exceed 50%" quarry-truck figure)

### 4.2 Unsafe operating patterns

| Pattern | Definition / threshold | Source | Confidence |
|---|---|---|---|
| Harsh braking/acceleration | Standard cross-vendor telematics practice: flag deceleration/acceleration above a G-force threshold | [Geotab](https://www.geotab.com/blog/halting-harsh-braking-improve-fleet-safety/), [MiX Telematics](https://www.mixtelematics.com/us/resources/blog/how-harsh-braking-and-acceleration-impacts-your-fleet/), [Motive](https://helpcenter.gomotive.com/hc/en-us/articles/31054170471837-Harsh-Driving) | Well-established methodology, no Cat-specific number |
| Harsh swing (excavator) | **No published industry standard exists.** Must be defined by analogy to harsh-braking telematics (angular deceleration above a chosen threshold) and explicitly presented to judges as your own modeling choice | — | Genuine gap, not a citable fact |
| Overspeed | OSHA 29 CFR 1926.602(a): pneumatic-tired earthmoving equipment **over 15 mph requires fenders** (a safety-equipment trigger, not a speed cap) [UNVERIFIED — 403 on fetch, cross-confirmed via 3+ snippets]. **No universal OSHA/MSHA max travel speed exists** — MSHA's Haul Road Handbook ties speed limits to road geometry, i.e. site-configurable | [OSHA 1926.602](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.602), [MSHA Haul Road Handbook](https://arlweb.msha.gov/readroom/coal%20handbook/PH99-I-4%20Haul%20Road%20Inspection%20Handbook.pdf) | Make `max_speed_kmh` a per-zone configurable column, not a hardcoded constant |
| Slope beyond rated angle | Cat's dozer Slope Assist article: work slopes **steeper than 45% grade (~24°)** need a dozed trail/roadway. Secondary/forum sources (UNVERIFIED) converge on ~30° as a commonly-cited excavator gradeability limit | [cat.com](https://www.cat.com/en_US/articles/for-owners/using-slope-assist-in-your-cat-bulldozer.html) | No single unified number across machine classes — recommendation: **15–20° = warning, 25–30° = critical**, labeled as a conservative synthesis, not one Cat spec |
| Seatbelt off while moving | Cat Seat Belt Reminder monitors the parking-brake switch; alarms if unbuckled while the brake is disengaged. VisionLink logs "instances when a seat belt is not fastened while the machine is in motion" | [cat.com](https://www.cat.com/en_US/by-industry/construction-industry-resources/technology/detect/safety-technology/seat-belt-reminder.html) | High confidence — maps directly to `seatbelt_fastened=false AND (parking_brake=false OR speed_kmh>0)` |
| Over-revving a cold engine | Cat cold-weather guidance: warm hydraulics "running the engine at less than one-third throttle" before full load | [Cat cold-weather PDF via H.O. Penn](https://www.hopenn.com/content/uploads/2015/03/Cold-Weather-Recommendations-For-all-Machines.pdf) | High confidence — rule: `rpm > ~33% of rated_rpm AND coolant_temp < operating_threshold AND minutes_since_start < warmup_window` |
| Bucket over an occupied truck cab | Never swing a loaded bucket over the truck cab — swing over the rear instead | [OSU EHS excavation safety guide](https://cfaessafety.osu.edu/sites/safety/files/imce/Excavation%20Equipment%20Procedures_0.pdf) | Industry/university safety-training guidance, not a specific OSHA regulation number |
| Traveling with boom/bucket raised | Raises center of gravity, increases tip-over risk; correct practice is carrying the bucket low during transport | Cross-corroborated across multiple excavator-safety blogs (not individually fetched) | Threshold (bucket height while traveling) is not standardized — must define your own |
| Ignoring warnings (repeated override) | No construction-equipment-specific standard. Borrowed analogue: ANSI/ISA-18.2 alarm management defines an "alarm flood" as **≥10 alarms in any 10-minute period per operator**, target <1% of time in flood state | [ISA-18.2](https://www.isa.org/standards-and-publications/isa-standards/isa-18-series-of-standards) | Legitimate citable anchor, but explicitly borrowed from process-safety, not construction |
| Fatigue from long shifts | No construction-equipment-specific shift-length standard found. Best available analogue: FMCSA Hours of Service — **11h driving limit after 10h off duty, 14h on-duty window, mandatory 30-min break after 8 cumulative driving hours** [UNVERIFIED — 403 on fetch, corroborated across 5+ snippets]. Foundational science: 17h awake ≈ BAC 0.05%, 24h awake ≈ BAC 0.10% (Dawson & Reid 1997) | [FMCSA HOS](https://www.fmcsa.dot.gov/regulations/hours-of-service), [Dawson & Reid, Nature 1997](https://fatiguemanagersnetwork.org/wp-content/uploads/Dawson-et-al.1997_Fatigue-Alcohol-Performance-Impairment.pdf) | Cat's own Driver Safety System (camera-based eye-closure/head-pose monitoring) + Smartband (wrist actigraphy) is the real-world analogue — see `docs/research/05` §3.2 |

### 4.3 Detection methods — what's credible in 24 hours

| Method | How it works | Explainability | Build cost |
|---|---|---|---|
| **Rule-based thresholds** | `if/then` on fields (idle%, RPM, slope, seatbelt) | Full — every alert traces to one human-readable condition | Trivial, hours |
| **Z-score / EWMA per machine-type baseline** | Z-score standardizes against historical mean/std; EWMA (`EWMA_t = λx_t + (1-λ)EWMA_{t-1}`) gives a responsive, noise-smoothed moving baseline that adapts as machine/job conditions drift | High — "N standard deviations from this machine-type's normal baseline" is judge-friendly | Low — standard SPC math ([NIST/SEMATECH e-Handbook §6.3](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc3.htm); EWMA control charts trace to Roberts 1959, companion paper: [Lucas & Saccucci 1990](https://www.tandfonline.com/doi/abs/10.1080/00401706.1990.10484583)) |
| **Isolation Forest** | Random trees isolate points faster (shorter path length) when they're rare/different — no labeled anomalies needed | Partial — native score is path-length-based, not per-feature; needs an added feature-attribution layer for a real "why" | Low — `sklearn.ensemble.IsolationForest` is a ~10-line add-on. [Liu, Ting, Zhou, ICDM 2008](https://dl.acm.org/doi/abs/10.1145/2133360.2133363) |
| **Autoencoder** | Neural net trained to reconstruct "normal" telemetry; high reconstruction error = anomaly | Weakest — an open research problem in itself (e.g. [arXiv:2501.02069](https://arxiv.org/html/2501.02069) exists specifically to add explainability on top) | High for 24h — architecture choices, training-data curation, threshold calibration. [Sakurada & Yairi 2014](https://dl.acm.org/doi/10.1145/2689746.2689747) |

**Recommendation:** rule-based thresholds as the always-on, primary layer (judges need a "why" for
every alert); z-score/EWMA per machine-type as a second statistical layer; Isolation Forest as an
optional tertiary cross-check if time remains. **Skip autoencoders** — with fabricated data there's
no real fault ground truth to validate a reconstruction-error threshold against, and it's the
weakest on the one thing that matters most in a judged demo: explainability.

### 4.4 Anomaly severity scoring

No single public Cat formula was found; this is substantially best-practice synthesis, say so
explicitly to judges. Two legitimate, citable anchors:
- **Risk-matrix methodology** (likelihood × consequence), standard across safety engineering/aviation
  SMS — [Wikipedia overview](https://en.wikipedia.org/wiki/Risk_matrix),
  [ICAO SRM methodology](https://www.icao.int/sites/default/files/SMI/TrainingDocs/Chapter%202%20Safety%20Management%20Fundamentals/2.6-07.%20SRM-Methodology%20Use%20of-the-Risk-Matrix.pdf).
- **ISA-18.2 alarm-priority tiering** (already cited in §4.2) for a defensible multi-level (not just
  continuous) severity scheme.

**Recommendation:** a 0–100 `severity_score` computed as a weighted sum of active rule violations,
with each rule pre-assigned a consequence weight (seatbelt-off-while-moving and slope-exceedance
weighted higher than idle%) — framed as "risk-matrix-style likelihood × consequence, informed by
ISA-18.2 tiering, not a single official Cat formula."

---

## 5. Task-time prediction

### 5.1 Caterpillar Performance Handbook productivity factors

**Job efficiency ("50-minute hour"):** Cat's own methodology corrects theoretical production by job
efficiency, operator efficiency, and material factors
([cat.com](https://www.cat.com/en_US/articles/for-owners/how-to-calculate-cat-wheel-loader-productivity.html)).
The widely-used baseline is **50 worked minutes per 60-minute hour ≈ 0.83 efficiency**. A more
granular management-condition × job-condition grid (excellent/good/fair/poor each) is standard in
construction-estimating textbooks (e.g. Peurifoy), yielding multipliers from **~0.52 (poor/poor) to
~0.84 (excellent/excellent)** — cell values sourced from a course PDF summary, **UNVERIFIED exact
numbers, structure well-corroborated**.

**Operator/skill factor:** no authoritative numeric table was found from the Handbook itself. One
non-authoritative industry source claims novice operators show 25–40% cycle-time variance vs 5–10%
for experienced operators, and up to 50% productivity improvement from skill alone — **UNVERIFIED,
low-confidence source**. **Recommended, explicitly-labeled-as-estimated multiplier: novice 0.75,
intermediate 0.90, expert 1.00–1.05.**

**Material/soil factor:** well-supported bucket-fill-factor ranges (UNVERIFIED exact boundaries,
page 403'd but broadly consistent with independent manufacturer-handbook tables): sand/gravel
0.95–1.10, common earth 0.80–1.00, hard clay 0.65–0.85, well-blasted rock 0.60–0.75, poorly-blasted
rock 0.40–0.60. Swell factor: sandy soils 10–15%, common earth 20–30%, heavy clay 30–40%, rock
40–65%. Bank volume = loose (bucket-rated) volume ÷ (1 + swell factor).

**Weather factor:** Cat's published methodology appears to fold weather into the general
excellent/good/fair/poor job-condition rating rather than publishing a separate numeric weather
coefficient — **no explicit weather multiplier found**; derive weather effects instead from the
human-factors research in §5.3.

### 5.2 Cycle-time estimation

Standard excavator/loader cycle: **fill/dig → swing loaded → dump → swing empty/return**. A
peer-reviewed mining/construction study reports an example breakdown of ~41% fill, ~24% loaded
swing, ~25% empty swing, ~10% dump by time share, ~34s total cycle
([E3S Web of Conferences](https://www.e3s-conferences.org/articles/e3sconf/pdf/2020/34/e3sconf_iims2020_01010.pdf)).

Standard production-rate formula:

```
Production rate (vol/hr) = (Bucket capacity × Fill factor × Job efficiency × 3600) / Cycle time (s)
Total task time = Total quantity ÷ Production rate
```

with typical ranges fill factor 0.60–1.15, job efficiency 0.67–0.83 (40–50 min/hour) — this is your
physics-informed baseline for §5.4.

### 5.3 Human factors — quantified

| Factor | Effect | Source | Confidence |
|---|---|---|---|
| Shift length | 12h vs 8h shift: **+37% injury risk**; **+9%** for needlestick-type injuries specifically (healthcare-derived, widely cited generally); fatigue costs US employers an estimated **$218B/year** in lost productivity | [NIOSH Module 3](https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod3/13.html), [NIOSH Science Bulletin 2023](https://www.cdc.gov/niosh/bulletin/2023/fatigue.html) | Confirmed (official NIOSH), cross-domain analogue |
| Sustained wakefulness | 17h awake ≈ BAC 0.05%; 22h ≈ BAC 0.08%; 24h ≈ BAC 0.10%; ~1.16% cognitive decline per 0.01% BAC-equivalent | [Dawson & Reid, Nature 1997](https://fatiguemanagersnetwork.org/wp-content/uploads/Dawson-et-al.1997_Fatigue-Alcohol-Performance-Impairment.pdf) | Confirmed, classic peer-reviewed paper — clean curve for an "hours since shift start" fatigue multiplier |
| Circadian dip | Alertness/performance dip ~14:00–16:00 (post-lunch); overnight nadir ~04:00–06:00 (additional trough ~02:00–04:00) | [PubMed](https://pubmed.ncbi.nlm.nih.gov/15892914/), [NIOSH Module 2](https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod2/13.html) | Confirmed timing windows; **magnitude/% effect size not quantified in sources found** — use as categorical flags, not a precise multiplier |
| Heat | OSHA proposed rule (not yet final as of Sept 2026): trigger at ≥80°F heat index, high-heat at ≥90°F. ACGIH WBGT TLVs: 27.5°C heavy workload / 28°C moderate. Meta-analysis (14 studies, 2,387 workers): **1°C WBGT rise → 0.33–0.57% productivity decline**; 60% of exposed workers show significant loss above WBGT 28°C / ambient 35°C | [OSHA rulemaking](https://www.osha.gov/heat-exposure/rulemaking/), [PMC meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC11583663/) | Confirmed, peer-reviewed meta-analysis — best-quality numeric anchor in this table |
| Cold | Manual dexterity decrement onset ~22.9°C finger skin temp (before rewarming), shifting to ~25.7°C after cold-rewarm cycling; 14-subject study across 20/10/0°C air temps | [Chapman et al. 2025, Physiological Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC12059468/) | Confirmed, peer-reviewed 2025 study. **No Cat-specific cold/arctic-package productivity numbers found** — UNVERIFIED/not found |
| Wind | No fixed OSHA number for ground equipment; crane-specific practice commonly cites ~20–22 mph as a hoisting-halt threshold, but OSHA defers to manufacturer/qualified-person limits | [OSHA 1926.1435](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1435) | Regulatory structure confirmed; specific mph figures UNVERIFIED as universal constants |
| Rain | Qualitative guidance only ("should not lift/operate in rain/sleet/snow") — no quantified per-mm productivity-loss figure found | Same crane-guidance cluster | Recommend a flat, clearly-labeled 15–30% derate for "rain" as a category, mirroring the job-condition grid's poor-condition range |

### 5.4 Model options

- **Gradient boosting quantile regression** — LightGBM's `objective='quantile'` with `alpha`
  (e.g. 0.1/0.5/0.9) trains P10/P50/P90 directly via pinball loss
  ([LightGBM docs](https://lightgbm.readthedocs.io/en/latest/Parameters.html)).
- **Conformal prediction** for distribution-free interval coverage on small/fabricated tabular data
  — canonical tutorial: [Angelopoulos & Bates, arXiv:2107.07511](https://arxiv.org/html/2107.07511v6);
  conformalized quantile regression (CQR): [Romano, Patterson & Candès, arXiv:1905.03222](https://arxiv.org/pdf/1905.03222).
- **Physics-informed baseline × multipliers** (§5.2/5.1/5.3 combined) is often *preferable* for a
  hackathon: fully explainable to non-ML judges, guarantees physically sane bounded outputs, and
  doesn't risk overfitting noise in data you invented yourself. **Recommended hybrid:** use the
  physics baseline as the P50 point estimate, wrap it in a conformal-calibrated residual band trained
  on your fabricated baseline-vs-"actual" errors for the P90 interval — gets you both explainability
  and a statistically-motivated uncertainty band.

### 5.5 Deployment

| Option | Pros | Cons |
|---|---|---|
| FastAPI on Vercel (Python runtime) | Fast `git push`→URL, generous free tier, official [docs](https://vercel.com/docs/frameworks/backend/fastapi) | Serverless cold starts, per-invocation model load |
| FastAPI on Render | Genuinely always-on if paid (~$7/mo); free tier has [official FastAPI template](https://render.com/docs/deploy-fastapi) | Free tier sleeps after 15 min idle, 30–60s cold restart — risky live in front of judges |
| Precompute in Postgres/Supabase (SQL/plpgsql or Edge Function) | Near-zero latency, no separate server, trivial to demo from the dashboard | Not suited to real gradient-boosting inference; best paired with the physics-baseline approach |
| ONNX export + ONNX Runtime Web (in-browser) | Genuinely offline-capable, zero server cost — strong fit for the "no-internet remote site" pitch | Tree-ensemble (LightGBM) → ONNX-Web conversion is less mainstream than for neural nets; validate the export path early or fall back to a JS re-implementation of the physics formula |

**Recommendation:** FastAPI on Vercel (or pre-warmed Render) for the ML/quantile service; a
client-side JS re-implementation of the physics-baseline formula as the offline fallback — lower risk
under a 24h deadline than a full ONNX pipeline.

### 5.6 Analytics to show

Average duration by task type × condition (weather/soil/shift-hour) as bar/heatmap views;
estimate-vs-actual bias tracking (residual-over-time, the standard way ML teams monitor calibration
drift); an interactive what-if slider (soil, weather, operator skill, shift hour) that visibly moves
the P50/P90 band — doubles as both a demo centerpiece and a development sanity-check.

---

## 6. Data-fabrication approach

A single seeded Python generator (`numpy.random.default_rng(seed)` for reproducibility — never
`random` module directly, so a fixed seed reproduces the exact dataset for re-runs/demos) that
builds the tables in §3 in dependency order (sites → zones → machines → operators → shifts → tasks →
telemetry/fault/safety/gps/weather → anomalies/incidents), then writes to CSV (fast local iteration)
and/or directly via `psycopg`/Supabase client for seeding Postgres.

**Realistic correlations to encode** (each traceable to §1–§5 above, not arbitrary):
- Cold engine (`coolant_temp_c` low, `minutes_since_start` small) + high RPM → tags a
  `cold_overrev` safety event (§4.2) and adds a task-duration penalty (§5.3 cold-dexterity effect).
- Novice operators (`skill_level='novice'`) → higher idle_pct (sample from a right-shifted
  distribution, e.g. Beta skewed toward 35–50% vs 15–25% for experts), more `safety_events` rows per
  shift, and an `operator_factor` multiplier of ~0.75 applied to task durations (§5.1).
- Heat/cold/rain conditions (drawn from `weather_snapshots`, ideally real Open-Meteo history for the
  demo site/dates) → apply the quantified heat-productivity-loss curve (§5.3) and the flat
  rain/wind derate (§5.3) to `actual_duration_min` when generating tasks.
- Long shifts (`hours_since_shift_start` high) and circadian-dip windows (14:00–16:00, 02:00–06:00,
  §5.3) → elevate both `fatigue_signal` safety-event probability and idle/error rates.
- Slope/zone → machines assigned to steep zones sample slope_deg near or above the zone's
  `max_slope_deg`, occasionally exceeding it to trigger `slope_exceeded` events.

**Injected anomalies with ground truth:** for a configurable fraction of telemetry rows/shifts
(e.g. 2–5%), the generator deliberately writes an out-of-distribution pattern (e.g. a sudden idle
spike, a fault-code burst, a seatbelt-off-while-moving stretch, an EWMA-breaking sensor drift) *and*
sets `anomalies.ground_truth_label = true` (or a matching `safety_events` row) at generation time.
This lets the detection stack (§4.3) be scored against a known answer key — report precision/recall/
F1 for the rule-based + z-score/EWMA + Isolation Forest stack on this held-out injected set as a
concrete, honest "our detector works" slide for judges, rather than an unverifiable claim.

**Config surface** (so the generator is tunable without code changes): number of machines/operators/
sites/days, telemetry interval (1-min vs 5-min per §3), anomaly injection rate, idle/fatigue/skill
distribution parameters, and the random seed — a `config.yaml` or CLI flags, not hardcoded constants.

---

## 7. Contradictions and gaps flagged

1. **Excessive idle % has no single official number.** Cat's own quoted figures (25% average, >50%
   quarry trucks) differ from non-Cat vendor claims (30–45%) and an unconfirmed "38% across 75,000
   machines" figure that could not be sourced — treat 40%/50% (§4.1) as a synthesis, not a cited Cat
   threshold.
2. **Cat's "Warning Level 1/2/3" severity numbering is directionally ambiguous** across the sources
   found — one implies Level 1 is least severe, another implies Level 3 is informational. Use the
   descriptive Informational/Caution/Derate/Shutdown scheme (§1.3) instead of numbered levels.
3. **No unified slope-angle limit exists across Cat machine classes.** The one confirmed cat.com
   figure (45% grade / ~24° for dozer trail-building) is dozer-specific; excavator figures (~30°)
   are secondary/forum-sourced and unverified; do not present a single "Cat max slope" number.
4. **"Overspeed" has no universal regulatory number.** OSHA's 15 mph figure is a fender-equipment
   trigger, not a speed cap; MSHA ties speed to road geometry. Model `max_speed_kmh` as
   per-zone-configurable, not a hardcoded constant.
5. **"Harsh swing" is not a published industry term at all** (unlike harsh braking, which is a
   standard telematics concept) — this is a genuine gap to flag as your own modeling choice, not
   present as an established standard.
6. **Open-Meteo's rate limit (10,000 calls/day non-commercial)** appears only in a secondary blog,
   not on the primary docs page fetched — confirm on the pricing page before relying on it.
7. **The excellent/good/fair/poor job-condition efficiency grid's exact cell values (0.52–0.84)**
   come from a course-PDF search snippet, not an independently re-verified primary text extraction —
   the structure is standard, the specific numbers need a manual check if used verbatim.
8. **The fatigue shift-length threshold is borrowed from FMCSA trucking rules (11h/14h)** — no
   construction/heavy-equipment-operator-specific standard was found; label this explicitly as a
   cross-domain analogue, not a construction-industry standard, if presented to judges.
9. **Several candidate Kaggle datasets' licences and real-vs-synthetic status could not be verified**
   (pages blocked on fetch) — open each page yourself and check the licence badge before citing any
   of them as "real, licensed data" in a deck or README.

---

## Summary of confidence

- **High confidence, primary-fetched or multiply cross-confirmed:** AEMP 2.0/ISO 15143-3 field list;
  Cat's two-tier ISO/VisionLink API structure; J1939 SPN/FMI format + several concrete examples; Cat
  CID/EID format + severity vocabulary (Warning/Derate/Shutdown); Open-Meteo fields and free/no-key
  access; Scania APS Failure + Component X datasets and licences; Cat Seat Belt Reminder behavior;
  Cat cold-weather warm-up guidance; OSHA/ISA alarm-management structure; NIOSH fatigue/shift-length
  data; Dawson & Reid wakefulness-BAC curve; heat-productivity meta-analysis; cold-dexterity study;
  LightGBM quantile objective; conformal-prediction tutorials; all deployment-platform docs.
- **Medium confidence (secondary/snippet-only, primary page blocked):** exact VisionLink-exclusive
  field list beyond AEMP; Cat's ISO 15143-3 developer-guide fault-code schema; the "Warning Level
  1/2/3" numbering direction; exact slope-angle specs per machine model; the 40%+ idle-threshold
  synthesis; job-condition-grid exact cell values.
- **Low confidence / explicitly unverified:** several Kaggle datasets' licences/real-vs-synthetic
  status; existence of a downloadable open excavator IMU dataset (none found); Open-Meteo's daily
  rate limit; any Cat-specific weather or cold/arctic productivity-derating coefficient; precise
  circadian-dip and rain-productivity-loss percentages.
