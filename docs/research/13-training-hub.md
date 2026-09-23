# Operator Training Hub — Research Brief

Prepared 2026-09-23 for the Caterpillar hackathon "Smart Operator Assistant" (feature 3: Operator
Training Hub). Covers: the McKinsey-Solve-style simulation concept (friend-prompt point 7,
directive point 13/14), mapping to real Cat curricula, e-learning video generation tooling,
micro-learning structure, instructor booking, the competency/skill passport, and six draft video
prompts. Builds on docs/research/05 (Cat ecosystem), 06 (AI training SOTA), 07 (offline/mobile),
08 (founder corrections) and docs/specs/thesis-draft.md. Every claim is cited; anything not
independently corroborated is flagged UNVERIFIED.

---

## 1. McKinsey-Solve-style simulation → 5 operator mini-games

### 1.1 How McKinsey Solve actually works

McKinsey's gamified assessment ("Solve," formerly the Problem Solving Game) has run two
generations of modules — **Ecosystem Building** (legacy, phased out in most markets but still the
best-documented "build a system under constraints" template) and **Redrock Study** (the current
core module) — plus a set of short timed "mini-cases." Both share the same scoring architecture:
a **product score** (did you reach the right outcome) and a **process score** (how you got there —
what you looked at first, whether you revised decisions, how structured your clicks were).
([MyConsultingCoach 2026 guide](https://www.myconsultingcoach.com/mckinsey-problem-solving-game))

- **Ecosystem Building** — you pick a biome (aquatic/alpine/jungle) with fixed environmental stats
  (depth, current, temperature, salinity), then choose ~7-8 species from ~39 options and place them
  so predator/prey caloric needs balance. Species "eat once"; if a species doesn't get enough
  calories, or its food source is depleted, it dies. Product score = whether the ecosystem reaches
  equilibrium (no species dies); process score = whether your placement pattern was structured or
  erratic (i.e., did you plan the food chain before dragging pieces, or thrash and self-correct
  under time pressure). ([MyConsultingCoach](https://www.myconsultingcoach.com/mckinsey-problem-solving-game))
- **Redrock Study** — a timed ecological investigation with three sequential, one-way phases:
  **Investigation** (drag relevant data points from noisy exhibits into a "Research Journal" — only
  ~10-15% of the data shown is actually needed, so what you *choose to collect* is itself scored),
  **Analysis** (weighted averages, percentage/probability questions, using an in-game calculator),
  and **Report** (pick the right chart type, fill in a templated finding). Critically: **once you
  advance to Report you cannot go back** — an irreversible-commitment mechanic that is itself part
  of the process score. Six additional timed mini-cases follow, each independent, testing fast
  quantitative reasoning under a hard clock.
  ([MyConsultingCoach](https://www.myconsultingcoach.com/mckinsey-problem-solving-game),
  [Hacking the Case Interview](https://www.hackingthecaseinterview.com/pages/mckinsey-solve-red-rock-game))

**The transferable pattern for our mini-games** (this is the design template, not McKinsey's IP):
(1) a short scenario premise with a hard time budget, (2) a constrained decision space (drag/select/
sequence, not free text), (3) an irreversible-commit step so hesitation and re-checking are
observable, (4) a **product score** = correct/safe outcome, and (5) a **process score** = order of
attention, number of reversals, time-to-first-action, i.e., did the operator check the right thing
first (e.g., look at the ground before reversing) or guess.

### 1.2 Five mini-games for the demo

| # | Game | Mechanics | Scoring | Tech | Build effort | Feeds competency profile |
|---|---|---|---|---|---|---|
| 1 | **Pre-shift walk-around: Spot the Hazard** | A static 360°/panorama or multi-angle SVG scene of a machine + site (leak, missing chock, cracked hose, unfastened seatbelt, person in blind spot, low tyre, PPE not worn). Operator taps hotspots against a 60-90 s clock; must also sequence the check in the *correct walk-around order* (engine bay → undercarriage → cab → attachment), not just find hazards randomly. | **Safety** = hazards found / total. **Procedure** = did the tap order match the real Cat pre-op checklist order (order-sensitivity is the process score, direct echo of Redrock's "what did you collect first"). **Efficiency** = time to complete. | Inline SVG or 2D canvas with clickable hotspot regions; no game engine needed — cheapest to build. | **S (2-4 h)** — art can be a stylised illustration or an AI-generated static image, no animation required. | Hazard-recognition skill, checklist discipline, PPE compliance sub-score. |
| 2 | **Faulty machine nearby — what do you do** | Branching decision tree: operator is told a nearby machine is showing an unusual-behaviour flag (from the abnormal-behaviour-detection feature). 3-4 sequential choices (approach vs. stay clear vs. radio the operator vs. call SOS) each with a countdown clock; wrong/unsafe branches are scored down even if the operator "gets away with it." | **Safety** = did the final branch match the correct protocol (stand off, notify, don't approach a machine flagged unstable). **Procedure** = which action was chosen first (checking radio/telemetry vs. immediately walking toward the machine). **Efficiency** N/A (safety-primary game). | React state machine (a JSON scenario graph + a component that renders the current node) — no canvas/game engine needed. | **S (2-3 h)** — content-authoring heavy, code-light. | Directly populates the "faulty-machine response" competency and cross-links to the SOS/Telegram alert flow (directive 8/13) as a training rehearsal for the same real alert. |
| 3 | **Load the truck efficiently** (cycle-time/fuel optimisation) | Top-down 2D scene: excavator + truck bed + spoil pile. Operator sequences bucket-fill → swing → dump cycles against a target cycle time and a fuel-burn meter that penalises over-revving/over-filling (bucket spill) and under-filling (extra cycles). | **Efficiency** = cycles-to-fill vs. optimal, fuel used. **Safety** = did the swing path cross the "keep-clear" zone near the truck cab. **Procedure** = smoothness of the joystick-equivalent input curve (reward gradual over jerky inputs — ties to the "process, not just outcome" pattern). | 2D canvas (Phaser is justified here — it has built-in tweening/physics for the swing-arc and fill-meter, which would be hand-rolled in plain canvas). ([Phaser vs PixiJS comparison](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs)) | **M (5-8 h)** — the one game worth a real engine because of animation/physics feel. | Cycle-time competency, direct analogue to the task-time-estimation feature (same underlying metric, gamified). |
| 4 | **Extreme cold-start procedure** | Sequencing/checklist game under a countdown: operator must order steps correctly — install block heater / warm engine bay (canvas + space heater in extreme cold), start at <⅓ throttle, warm hydraulics by slowly cycling the attachment a few cm before full load — mirroring Caterpillar's own **Cold Weather Recommendations manual (SEBU5898)**. Wrong order (e.g., full-throttle immediately, full hydraulic load before warm-up) is scored down even if the engine "starts." ([Foley Inc. summary of Cat cold-weather guidance](https://www.foleyinc.com/cold-weather-recommendations-cat-machines/), [SEBU5898-12 PDF](https://engine.od.ua/ufiles/SEBU5898-12-Cold-Weather-Recommendations.pdf)) | **Procedure** = step order correctness (primary score — this game is almost pure process score, like Ecosystem Building's placement logic). **Safety** = did the operator skip a required warm-up stage. **Efficiency** = time to complete without skipping steps. | Drag-to-reorder list UI (plain React + a sortable-list library) — no canvas needed. | **S (2-3 h)**. | Feeds the "working-conditions" competency dimension (friend-prompt point 6: cold/heat/altitude cases) with a citeable, real-manual-accurate scenario. |
| 5 | **Proximity alert while reversing** | Real-time reaction test: a top-down/rear-camera-style 2D view scrolls; a person or obstacle enters the blind zone at a random moment; operator must react (stop/look/sound horn) within a strict latency window, styled after Cat Detect's actual behaviour (radar/camera object detection + reverse Collision Warning + Motion Inhibit). ([Cat Detect product page](https://www.cat.com/en_US/products/new/technology/detect/detect/128121.html)) | **Safety** = reaction correctness. **Efficiency** = reaction latency (ms). **Procedure** = whether the operator was scanning mirrors/camera *before* the hazard appeared vs. only reacting after an alert sound (rewards proactive scanning, the same "check before you're told" pattern as Redrock's data-collection score). | 2D canvas with a simple timer-based spawn loop; PixiJS is the right weight class if frame-accurate timing matters more than game features. ([Phaser vs PixiJS](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs)) | **M (4-6 h)** — reaction-timing logic + a believable rear-view scene. | Reaction-time/vigilance sub-score, direct tie-in to the real-time proximity-hazard safety feature (this game *is* a rehearsal of the live feature, same framing as game #2). |

A sixth candidate, **slope-stability decision** (assess a grade/soil/load combination and choose
safe vs. unsafe positioning), was considered but dropped to a stretch/roadmap item — it overlaps
conceptually with games #2 and #4 (branching safety judgement + working-condition awareness) without
adding a new mechanic, so it's lower marginal value for a 24-hour build.

### 1.3 Recommended 2 for the demo

**Spot the Hazard (#1) + Faulty machine, what do you do (#2).**

Reasoning: both are the cheapest to build (S, 2-4 h each, no game engine, mostly content
authoring), both map directly onto the problem statement's *named* pillars (real-time safety
features, unusual-behaviour detection) rather than a nice-to-have, both cleanly demonstrate the
McKinsey-style **product-score + process-score** split to judges in under two minutes of demo time
(a hazard count and a "you checked the wrong thing first" callout are easy to show live), and #2
is a direct rehearsal of the same alert logic the SOS/Telegram feature already needs — so the
content (the scenario graph) can be reused, not built twice. If time remains, **Load the truck
efficiently (#3)** is the best third pick because it is the only game that demonstrates the
*efficiency* pillar, giving judges all three scoring dimensions (safety, procedure, efficiency)
across the demo.

---

## 2. Mapping to real Cat curricula

Grounding in docs/research/05 so the mini-games read as an extension of Cat's actual pedagogy, not
an invented game:

- **Cat Operator Training Level I ("Competent Operator," <3 yrs experience) → Level II/III** is a
  tiered, instructor-verified, task-competency-standard curriculum ending in a Certificate of
  Completion. ([cat.com Heavy Equipment Operator Training](https://www.cat.com/en_US/support/cat-training/Heavy-Equipment-Operator-Training.html)) Our mini-game scores should target the *same
  named competency categories* Cat already certifies against (pre-operation inspection, safe
  operating technique, hazard recognition) so a Level I badge earned in-app is legible to a real Cat
  dealer instructor, not a made-up scale.
- **Cat Online Operator Training / catoperatortraining.com** (40+ self-paced courses covering
  safety, pre-operation checks, walk-arounds, basic technique per machine family) is the closest
  existing analogue to game #1 (Spot the Hazard) and game #4 (cold-start) — but it is flat video/quiz
  content with **no offline mode and no adaptive difficulty** ([05 §1.3](05-cat-operator-ecosystem.md)) — our version should explicitly out-perform it on exactly those two axes (offline-capable, scored/adaptive) rather than duplicate its content.
- **Cat Simulators (Simformotion/SimScholars) + Immersive Technologies** cover the same skill
  categories at much higher fidelity (full-motion cab replicas) but only exist as fixed hardware at
  dealer centers — not reachable by a remote/rural operator ([05 §1.1](05-cat-operator-ecosystem.md)). Position the mini-games explicitly as the **phone-reachable on-ramp** that feeds *into* a
  real simulator/instructor session, not a replacement for it — this also motivates the instructor-booking flow in §5.
- **Cat MineStar Detect — Fatigue & Distraction** (in-cab camera + Cat Smartband wearable,
  subscription, human-analyst-reviewed) is the real-world system game #5 (proximity/vigilance)
  rehearses for. ([05 §3.2](05-cat-operator-ecosystem.md))
- **Cat Cold Weather Recommendations (SEBU5898)** is the literal source document for game #4's step
  order — citing it by name in the training-hub UI ("per Cat's Cold Weather Recommendations
  manual") is a credibility signal for judges. ([Foley Inc. summary](https://www.foleyinc.com/cold-weather-recommendations-cat-machines/))
- **What none of Cat's existing training covers** (per 05 §7 white-space analysis): adaptive
  difficulty per operator, offline delivery, a unified skill record portable across employers, and
  turning live telemetry/near-miss events into new lesson content automatically. That is where the
  training hub's differentiation must sit — the mini-games are the demo-able front door to that
  gap, not the whole pitch.

---

## 3. E-learning video generation tools (2026 comparison)

| Tool | Machinery/industrial quality | Character consistency | Native audio/VO | Multilingual (incl. Indian languages) | Price / free tier | Aspect ratios |
|---|---|---|---|---|---|---|
| **Google Flow (Veo 3.1)** | Strong photorealism, good physics for machinery motion; first major model with native synced dialogue+SFX+ambience at 48 kHz. ([BuildFastWithAI Veo 3.1 review](https://www.buildfastwithai.com/blogs/google-veo-3-1-ai-video-generator)) | Good within a session via reference images; not as strong as Runway across many separate shots. | **Yes — native, 48 kHz synced dialogue**, the strongest in the category for this. ([BuildFastWithAI](https://www.buildfastwithai.com/blogs/google-veo-3-1-ai-video-generator)) | English-centric; no confirmed native Hindi/Telugu/Tamil generation — pair with a separate Indian-language TTS pass (see below). | Free: 50 credits/day in Flow. Paid: Google AI Pro $19.99/mo, AI Ultra $249.99/mo; API from $0.03-0.05/s (Lite) to $0.60/s (4K+audio). ([costbench.com](https://costbench.com/software/ai-video-generators/google-veo/), [VO3AI pricing](https://www.vo3ai.com/veo3-pricing)) | Standard widescreen/vertical via Flow UI; API supports custom. |
| **Sora 2 / Sora 2 Pro** | Strong, especially Pro; good multi-shot consistency. | Pro maintains consistency well across separately generated clips; two-character scenes need careful prompting. ([eachlabs Sora 2 characters](https://www.eachlabs.ai/openai/sora-2/sora-2-characters)) | Yes, synced audio. | Not specifically Indian-language marketed. | Standard $0.10/s (720p), Pro $0.30-0.50/s depending on res; batch discounts to $0.05-0.35/s. **API sunsets 2026-09-24** — i.e., essentially now, so treat Sora 2 API as end-of-life for this build. ([CostGoat Sora pricing](https://costgoat.com/pricing/sora)) | 720×1280 / 1280×720 standard; 1024×1792 / 1792×1024 and 1080p on Pro. ([WaveSpeed Sora 2 guide](https://wavespeed.ai/blog/posts/openai-sora-2-complete-guide-2026/)) |
| **Runway Gen-4 / Gen-4.5** | Best-in-class for consistent characters across many separate shots — described as the current strongest option when a recurring "operator" character must appear across multiple lesson clips. ([UD.hk Gen-4 guide](https://www.ud.hk/en/blogs/insight/article/2026-05-05-runway-gen4-guide)) | **Strongest in market** — one reference image holds the same character across shots/lighting/locations. | Available via Act-One/audio tools, less the headline feature than Veo. | Not Indian-language specific. | Standard $12/mo (annual) to Max $76/mo; Gen-4 Turbo API from $0.05/s. ([Unifically Gen-4 API](https://unifically.com/blogs/runway-gen-4)) | Flexible via editor/API. |
| **Kling 3.0** | Native 4K, physics-aware motion, strong for two-minute-plus consistency. ([Atlas Cloud Kling review](https://www.atlascloud.ai/blog/tips/kling-3.0-review-features-pricing-ai-alternatives)) | Strong — "unusually strong character consistency over clips up to two minutes." | Native multilingual audio generation. | **Chinese, English, Japanese, Korean, Spanish only** — no Hindi/Telugu/Tamil. ([eesel Kling pricing](https://www.eesel.ai/blog/kling-ai-pricing)) | Consumer $6.99-$64.99/mo; API $0.084-$0.168/s; free 66 credits/day (720p, watermarked, non-commercial). ([eesel](https://www.eesel.ai/blog/kling-ai-pricing)) | Native 4K, 720p/1080p modes. |
| **Higgsfield** | Aggregator, not its own model — routes to Sora 2/Veo 3.1/Kling/Seedance under one credit system, plus Cinema Studio camera presets and a DaVinci Resolve plugin. ([Higgsfield free-generation guide](https://higgsfield.ai/blog/free-unlimited-ai-video-generation-2026)) | Inherits the underlying model's consistency. | Inherits underlying model. | Inherits underlying model. | Starter $15, Plus $39, Ultra $99/mo (annual); premium models (Sora 2, Veo 3.1) cost 40-70 credits vs. Kling's ~6. ([layer3labs pricing](https://www.layer3labs.io/guides/higgsfield-ai-pricing)) | Inherits underlying model. |
| **Luma Ray3(.2)** | HDR pipeline, multi-keyframe (up to 16) sequencing, native audio with Ray3+. ([eesel Luma pricing](https://www.eesel.ai/blog/luma-ai-pricing)) | Good, not category-best. | Yes, native with Ray3+. | Not Indian-language specific. | Lite $7.99/mo (≈20 videos); Plus $30, Pro $90, Ultra $300/mo. ([eesel](https://www.eesel.ai/blog/luma-ai-pricing)) | Flexible via app/API. |
| **Pika** | Weaker for photoreal industrial scenes; strongest for stylised/social-effect content (Pikaffects). | Moderate. | Yes. | Not Indian-language specific. | $8/mo Standard, ~700 credits (~50 videos) — cheapest per-clip of the set. ([eesel comparison](https://www.eesel.ai/blog/luma-ai-pricing)) | Social/vertical-first. |

**Recommendation: Google Flow (Veo 3.1) as primary, Kling 3.0 as fallback.**
Flow/Veo 3.1 wins on the combination that matters most for this brief — the best machinery
photorealism/physics in the set, genuinely native synced audio (so a single generation can carry
ambient machine sound plus a scripted English voiceover), a usable free daily-credit tier for
iterating on 6 lesson prompts, and it is explicitly the tool named in directive 13 (replacing the
now-ended OpenArt plan). Kling 3.0 is the fallback specifically because it is markedly cheaper per
clip, has the longest single-clip consistency window (useful if a lesson needs one continuous
2-minute take rather than stitched shots), and has its own free daily tier as a backup if Flow's
credits run out mid-hackathon.

**None of the seven tools natively generates Hindi/Telugu/Tamil/etc. voiceover** — the realistic
production pipeline for the multilingual requirement in directive 12/friend-prompt point 12 is:
generate the visual + English guide track in Flow/Kling, then produce the actual in-app voiceover
separately with an Indian-language TTS model — **Sarvam AI (Bulbul v3)**, which supports 11 Indian
languages including Hindi/Tamil/Telugu, handles Hindi-English code-switching, streams at <250 ms
latency, and prices at ≈₹30 per 10,000 characters (with free starting credits) — versus ElevenLabs,
which has a deeper voice library and cleaner commercial licence but roughly 10x Sarvam's
per-character cost and comparatively thin Tamil/Telugu support.
([Sarvam TTS product page](https://www.sarvam.ai/text-to-speech), [VoisLabs ElevenLabs-vs-Sarvam comparison](https://www.voislabs.com/vs/elevenlabs)) This also matches directive 12's "user picks
app language at start" requirement — one video asset, N dubbed/TTS audio tracks, rather than N
separately generated videos.

### 3.1 Free real footage + trademark avoidance

- **Pexels** and **Pixabay** both carry large, genuinely free, no-attribution-required libraries of
  excavator/heavy-machinery/construction-site footage (Pexels: 6,000+ excavator clips, 34,000+
  "heavy equipment" clips; Pixabay: 100+ excavator clips, 1,500+ "construction equipment" clips) —
  usable directly as b-roll or as a reference/establishing shot layer around AI-generated hero
  shots. ([Pexels excavator search](https://www.pexels.com/search/videos/excavator/), [Pixabay heavy machinery](https://pixabay.com/videos/search/heavy%20machinery/))
- **Caterpillar's own YouTube channel**: embedding a public Cat YouTube video (via YouTube's own
  embed player, unmodified, with on-screen attribution) is generally permitted under YouTube's
  standard terms and does not itself require a Caterpillar trademark licence, because the video
  plays back from Caterpillar's own channel rather than being copied/re-hosted. **Do not** download,
  re-cut, or re-host Cat's footage as if it were the team's own generated content, and do not lift
  frames from it into the AI-video prompts below.
- **Trademark/trade-dress risk on "generic yellow excavator":** Caterpillar's own legal notices
  explicitly list **"Caterpillar Corporate Yellow"** itself, plus the **"Power Edge" trade dress**
  (Cat mark on black background with a diagonal red bar) and **"Cat Modern Hex"** (red hexagon +
  grille pattern) as protected trade dress, separate from the CAT/CATERPILLAR wordmarks and logos.
  ([cat.com copyright/legal notices](https://www.cat.com/en_US/copyright.html)) Separately, Getty
  Images' internal IP guidance flags that imagery where Caterpillar-branded machinery is the main
  subject (roughly >20% of frame) is unsuitable for commercial licensing at all.
  ([Getty Images IP wiki — Caterpillar](https://wiki.gettyimages.com/caterpillar/)) **Practical
  guidance for the 6 prompts below:** "generic yellow excavator" alone is not fully safe — the exact
  Cat yellow hue plus black+red accents reads as trade dress even without the wordmark. Shift the
  hue (amber/construction-orange rather than Cat's specific yellow), skip any diagonal red bar or
  hexagonal grille pattern, and leave the body panels unbranded/undecaled. Shlok should make this
  same call explicitly when refining prompts in ChatGPT, since it's a legal judgment call, not a
  technical one.

---

## 4. Micro-learning structure

Reuses the learning-science findings already sourced in docs/research/06 §3 rather than
re-deriving them:

- **Lesson length:** 60-120 s micro-lessons are consistently supported over long-form video for
  retention, especially for low-literacy/first-generation-learner populations — shorter cognitive
  load, more frequent reinforcement, and a better fit for patchy connectivity than a long eLearning
  video. ([06 §3, Microlearning row](06-ai-operator-training-sota.md))
- **Lesson template (recommended, not yet built):** 10-15 s hook (the real event or hazard that
  triggered the lesson) → 30-45 s demonstration/explanation → 1 explicit "the rule" callout → a
  3-question retrieval-practice quiz (not passive replay — retrieval practice + interleaving is
  cited as the highest-utility strategy across skill types). ([06 §3, Retrieval practice row](06-ai-operator-training-sota.md))
- **Voice-over in the operator's language**, selected at first app launch (directive 12) — see §3
  above for the Sarvam TTS pipeline that makes one video asset serve every language without
  re-generating video.
- **Offline download:** cache the lesson (video/audio + quiz JSON) for install-once, no-connectivity
  playback — directly answers friend-prompt point 10 and is flagged as the single biggest
  differentiator vs. every existing Cat digital training product, all of which are confirmed
  online-only or UNVERIFIED-offline. ([05 §7, white-space #2](05-cat-operator-ecosystem.md))
- **Spaced repetition vs. deliberate practice — use the right tool for the right skill layer, and
  say so explicitly in the pitch:** spaced repetition is strong, replicated evidence **for
  declarative/procedural knowledge only** — safety rules, checklist steps, terminology, multilingual
  vocabulary. A 2026 *Scientific Reports* study found spaced practice has "limited or no effects" on
  *motor* sequence learning — joystick/lever proficiency needs deliberate practice (clear goal →
  attempt → immediate gap feedback → retry) plus social/comparative feedback, not spacing.
  ([06 §3, full table](06-ai-operator-training-sota.md), [Nature/Scientific Reports](https://www.nature.com/articles/s41598-026-52702-5)) Concretely: spaced re-quiz the
  *knowledge* layer (hazard-ID recall, checklist order, vocabulary) on a spaced schedule; keep the
  *motor-skill* mini-games (load-the-truck cycle smoothness, proximity reaction time) as
  deliberate-practice loops the operator can repeat on demand rather than on a spaced timer. This is
  also a credibility point if a judge with a learning-science background probes the pitch.

---

## 5. Instructor booking flow

Real Cat dealer training today: Level I/II/III certification is instructor-led, delivered either
on the customer jobsite or at a Cat Demonstration & Learning Center, scheduled per-dealer (each of
Cat's 156 dealers, across 192 countries, prices/schedules independently — there is no unified
booking system today). ([05 §1.2, "What to know about certified dealer training"](05-cat-operator-ecosystem.md), [cat.com training hub](https://www.cat.com/en_US/support/cat-training.html)) Enterprise dealer scheduling tools (e.g., EverLogic) already run on a
"request → assign by skill/availability → calendar slot" pattern for service work, which is the
right reference pattern to borrow, simplified for an operator-facing minimal UI.
([EverLogic dealership scheduling](https://everlogic.com/heavy-equipment-dealership-management-software/))

**Recommended minimal flow (4 taps, no dealer backend needed for the demo — a request row in
Supabase is enough):**
1. **Machine type / class** — operator picks from the machines already in their profile (excavator,
   loader, dozer, etc.) rather than typing.
2. **Desired certification outcome** — Level I "Competent Operator" / Level II / Level III, mirrored
   directly from Cat's own tier names so a real dealer instructor recognises the request instantly.
3. **Location** — "at my site" vs. "nearest Cat Demonstration & Learning Center" (auto-suggest
   nearest from the operator's GPS/map data, reusing the same location plumbing as the hazard-map
   feature in friend-prompt point 5).
4. **Date/time slot** — a simple calendar picker against instructor-availability rows (mocked for
   the demo).
   → **Confirm** produces a booking-request record; on completion (instructor marks it done) it
   writes a signed evidence event straight into the competency passport (§6) — the booking flow's
   entire purpose in the architecture is to be one of the passport's four evidence sources, not a
   standalone feature.

---

## 6. Competency / skill passport

**Levels:** Novice → Competent → Proficient → Expert. "Competent Operator" is not an invented label
— it is Cat's own Level I certification name — so naming our tiers this way keeps the passport
legible to a real Cat instructor rather than inventing a parallel scale.
([05 §1.2](05-cat-operator-ecosystem.md))

**Evidence sources feeding each skill node (four independent inputs, deliberately redundant so no
single weak signal can fake a level):**
1. **Simulation/mini-game scores** (§1) — safety/procedure/efficiency sub-scores per skill.
2. **Telemetry behaviour** — the provided dataset's idling time, seatbelt compliance, load-cycle
   consistency, plus the abnormal-behaviour-detection feature's flags, read as ongoing evidence
   rather than a one-time test.
3. **Instructor sign-off** — the outcome of a booked session (§5), the only evidence source with a
   real human in the loop, weighted highest for level-up decisions.
4. **Incident-free hours** — accumulated safe operating time since the last logged safety alert or
   near-miss, directly reusable from the incident-logging feature (which directive 4 already
   requires to be cryptographically hashed).

**Credential format:** issue passport achievements as **Open Badges 3.0**, the current 1EdTech
standard, which represents each badge as a **W3C Verifiable Credential** — cryptographically signed,
tamper-evident, and portable across issuers/employers by design.
([1EdTech Open Badges 3.0 announcement](https://www.1edtech.org/1edtech-article/new-open-badges-30-standard-provides-enhanced-security-and-mobility/411060), [Open Badges 3.0 spec](https://www.imsglobal.org/spec/ob/v3p0)) This is a natural fit alongside directive 4's
cryptographic hashing of the incident log — the same "signed, tamper-evident evidence trail" idea
applied to competency evidence, not just incidents — and it directly answers the white-space gap
identified in 05 §7 #1: Cat's own skill data is fragmented across VisionLink/eLearning/Simulators
with no single portable operator-owned record.

---

## 7. Six draft video prompts (Flow/Veo-style)

Written for a ~2026-current Veo/Flow-class model; each targets a single ~8 s hero clip (native
generation length for this model class) meant to be the anchor shot of a 60-120 s micro-lesson —
stitch 4-6 such clips with the demonstration/rule/quiz structure from §4 rather than trying to
generate the full lesson length in one pass. **No Caterpillar logos, wordmarks, or trade dress** —
generic construction-industry look per §3.1 (shifted yellow/amber hue, no diagonal red bar, no
hexagonal grille, unbranded panels). Shlok will refine these in ChatGPT before generating.

1. **Pre-shift walk-around / hazard spotting**
   - Shot: wide establishing shot, then push-in to medium shot.
   - Subject: an operator in hi-vis vest and hard hat, generic amber-yellow excavator behind them.
   - Action: operator walks a slow deliberate loop around the machine, crouches to check a track
     pad, runs a hand along a hydraulic hose, stops at a cracked hose fitting and points at it.
   - Setting: overcast morning light on a dusty construction site, distant cranes.
   - Lighting: soft diffused daylight, slightly cool colour temperature (early morning).
   - Camera: slow orbiting dolly around the operator and machine, ending on a close-up of the
     cracked hose.
   - Duration: 8 s.
   - Audio/VO (neutral English placeholder, to be swapped for Sarvam TTS per language): "Before you
     start, walk the machine. Check the tracks, the hoses, the attachment pins. If something looks
     wrong — stop and report it."

2. **PPE and seatbelt compliance**
   - Shot: medium shot inside a machine cab, shot from the open cab door.
   - Subject: an operator climbing into the cab wearing a hard hat and hi-vis vest.
   - Action: operator sits, pulls the seatbelt across, clicks it in, and only then reaches for the
     ignition/start control.
   - Setting: cab interior, quarry visible through the windshield.
   - Lighting: bright midday sun through the cab glass, slight lens flare.
   - Camera: static shot from outside the open cab door, slight handheld sway.
   - Duration: 8 s.
   - Audio/VO: "Seatbelt first, every time. No belt, no start. This machine won't move until you're
     buckled in."

3. **Faulty machine nearby — response protocol**
   - Shot: wide shot of a job site with two machines at a distance from each other.
   - Subject: a second, generic amber excavator in the background with an amber warning beacon
     flashing on its roof.
   - Action: the near-camera operator stops walking, looks at the flagged machine, then turns and
     raises a handheld radio to their mouth instead of approaching.
   - Setting: open quarry/construction yard, midday, some dust haze.
   - Lighting: harsh overhead sun, strong shadows for tension.
   - Camera: slow zoom from wide to medium on the operator's radio call, background machine kept in
     soft focus.
   - Duration: 8 s.
   - Audio/VO: "If a nearby machine is flagged faulty, don't approach it. Stay clear, radio it in,
     and wait for the all-clear."

4. **Extreme cold-start procedure**
   - Shot: medium-wide shot of a machine at a snowy/frost-covered site at dawn.
   - Subject: an operator in heavy winter gear, breath visible in the cold air, next to the machine
     with an engine-bay canvas cover partly open.
   - Action: operator checks a block-heater cable plugged into the machine, then climbs in and is
     shown gently working a control lever a few centimetres, not a full throttle motion.
   - Setting: frost/snow-covered ground, pale blue dawn light, visible steam/breath.
   - Lighting: cold blue-white light, low sun angle, long shadows.
   - Camera: static wide shot, then cut to a close-up of the gloved hand gently moving the lever.
   - Duration: 8 s.
   - Audio/VO: "Cold morning. Warm the engine first, keep it under a third throttle, and ease the
     hydraulics before you put it to work."

5. **Proximity alert while reversing**
   - Shot: over-the-shoulder shot from inside the cab looking at a rear-view screen/mirror.
   - Subject: an operator's hands on the controls, rear-view display showing a small figure walking
     into the machine's blind zone behind it.
   - Action: an on-screen amber proximity icon flashes, the operator's hand immediately moves off
     the reverse control and taps a horn button; the machine stays still.
   - Setting: busy site with other workers and equipment moving in the background.
   - Lighting: bright daylight, high contrast between cab interior shadow and bright exterior.
   - Camera: close, slightly handheld shot centred on the rear-view display and the operator's
     hands.
   - Duration: 8 s.
   - Audio/VO: "If the proximity alert sounds, stop. Sound the horn, check again, and only move once
     it's clear."

6. **Load-cycle efficiency technique**
   - Shot: wide tracking shot following the swing arc of an excavator loading a truck.
   - Subject: a generic amber excavator smoothly filling an adjacent dump truck bed.
   - Action: one clean, unhurried bucket-fill → swing → dump cycle, bucket levelled (not overfilled
     or half-empty), no sudden jerks in the swing motion.
   - Setting: active loading area, another truck queued in the background.
   - Lighting: bright, even daylight, minimal shadow harshness.
   - Camera: smooth side-tracking shot matching the swing speed of the arm, ending on the dump into
     the truck bed.
   - Duration: 8 s.
   - Audio/VO: "Smooth and level beats fast and sloppy. A steady cycle burns less fuel and gets more
     done by the end of the shift."

---

## Source list

- McKinsey Solve mechanics/scoring: https://www.myconsultingcoach.com/mckinsey-problem-solving-game , https://www.hackingthecaseinterview.com/pages/mckinsey-solve-red-rock-game
- Phaser vs PixiJS: https://generalistprogrammer.com/comparisons/phaser-vs-pixijs
- Cat Detect: https://www.cat.com/en_US/products/new/technology/detect/detect/128121.html
- Cat cold weather manual: https://www.foleyinc.com/cold-weather-recommendations-cat-machines/ , https://engine.od.ua/ufiles/SEBU5898-12-Cold-Weather-Recommendations.pdf
- Cat dealer training: https://www.cat.com/en_US/support/cat-training.html , https://www.cat.com/en_US/support/cat-training/Heavy-Equipment-Operator-Training.html
- Video tools: https://www.buildfastwithai.com/blogs/google-veo-3-1-ai-video-generator , https://costbench.com/software/ai-video-generators/google-veo/ , https://www.vo3ai.com/veo3-pricing , https://wavespeed.ai/blog/posts/openai-sora-2-complete-guide-2026/ , https://costgoat.com/pricing/sora , https://www.eachlabs.ai/openai/sora-2/sora-2-characters , https://www.ud.hk/en/blogs/insight/article/2026-05-05-runway-gen4-guide , https://unifically.com/blogs/runway-gen-4 , https://www.atlascloud.ai/blog/tips/kling-3.0-review-features-pricing-ai-alternatives , https://www.eesel.ai/blog/kling-ai-pricing , https://higgsfield.ai/blog/free-unlimited-ai-video-generation-2026 , https://www.layer3labs.io/guides/higgsfield-ai-pricing , https://www.eesel.ai/blog/luma-ai-pricing
- Free footage: https://www.pexels.com/search/videos/excavator/ , https://pixabay.com/videos/search/heavy%20machinery/
- Cat trademark/trade dress: https://www.cat.com/en_US/copyright.html , https://wiki.gettyimages.com/caterpillar/
- Indian-language TTS: https://www.sarvam.ai/text-to-speech , https://www.voislabs.com/vs/elevenlabs
- Open Badges 3.0: https://www.1edtech.org/1edtech-article/new-open-badges-30-standard-provides-enhanced-security-and-mobility/411060 , https://www.imsglobal.org/spec/ob/v3p0
- Dealer scheduling reference pattern: https://everlogic.com/heavy-equipment-dealership-management-software/
- Learning science (reused from 06): https://www.nature.com/articles/s41598-026-52702-5
