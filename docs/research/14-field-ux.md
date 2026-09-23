# Field UX research: low-literacy, multilingual, in-cab operators

Prepared for: Smart Operator Assistant for CAT Machinery (Caterpillar hackathon, India, 2026)
Scope: docs/brief/01-problem-statement.md, docs/brief/03-friend-prompt.md (points 2, 11-15), docs/design/ui-framework.md.
Methodology: web research, September 2026. India-specific product claims (Google Pay voice rollout,
UMANG feature list, Meesho localization) are current as reported publicly; treat exact percentages and
in-progress feature rollouts as directional, not contractual — mark **UNVERIFIED** where noted.

---

## 1. Evidence-based design for low-literacy and first-time smartphone users in India

### The core finding: text fails, voice helps, graphics win
The foundational study here is Microsoft Research's field work with **570 participants across India,
the Philippines and South Africa, 700+ hours of fieldwork**, testing three UI styles for a mobile
banking task with low-literacy users: **0% of low-literacy users completed the task with a text-only
UI; 72% completed it with a spoken/voice dialog; 100% completed it with a graphical UI.** The same body
of work documents *why* text UIs fail this population: difficulty with hierarchical menus, soft keys,
scroll bars, non-numeric input and specialized terminology — not just the words themselves.
[Designing mobile interfaces for novice and low-literacy users, ACM TOCHI](https://dl.acm.org/doi/10.1145/1959022.1959024),
[Microsoft Research project page](https://www.microsoft.com/en-us/research/project/uis-low-literate-users/),
[Actionable UI Design Guidelines for Smartphone Applications Inclusive of Low-Literate Users, ACM 2021](https://dl.acm.org/doi/10.1145/3449210).

Implication for this build: **icon leads, text confirms, voice is a parallel channel — never make voice
or text the only way to understand a state.** This is stricter than "icons support text" (ui-framework.md
§6) — it means every safety-critical state needs a third channel (audio) because gloved, moving,
noisy-cab operators can't always look *or* read.

A broader systematic review of UI design for illiterate/semi-literate users converges on the same
levers: local language, local content, video, audio, touch-first input, clear content categorization,
and peer/community validation of the design. [Designing User Interfaces for Illiterate and
Semi-Literate Users: A Systematic Review, SAGE 2023](https://journals.sagepub.com/doi/full/10.1177/21582440231172741).
High-contrast colour and simplified text layout were preferred by roughly 70% of participants in a
comparable low-literacy field study. [Designing Accessible UIs for Illiterate Populations, Zenodo](https://zenodo.org/records/18805638)
(rural Africa cohort — directionally consistent with the India studies above, not India-specific; flagged
**UNVERIFIED for India** as a hard number).

### What Indian apps actually did

**Google Pay** — is rolling out AI-powered, Bhashini-integrated voice payments in India specifically
framed as an accessibility feature for illiterate/low-literacy users, letting them speak a UPI payment
in their own language rather than type. [Google Pay to introduce AI-powered voice payments in
India](https://ibsintelligence.com/ibsi-news/google-pay-to-introduce-ai-powered-voice-payments-in-india/),
[India TV News coverage](https://www.indiatvnews.com/technology/apps/google-pay-to-support-voice-activated-upi-payments-with-new-ai-integration-2025-02-16-976504).
Google Pay and PhonePe together carry over 80% of India's UPI transaction volume (GPay ~37%, PhonePe
~47.8%, Nov 2024) — i.e. the two dominant consumer fintech UIs in the country are both converging on
voice as the literacy bridge, not just text simplification. **UNVERIFIED**: exact rollout completion
date and measured task-success lift.

**UMANG** (Government of India's unified services app) — ships in **13 languages** and offers the same
service catalog through four channels: app, website, chatbot and **voice bot**, with the chatbot/voice
layer now running on Bhashini's ULCA multilingual models. [UMANG 3-year anniversary release,
PIB](https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=1675131&reg=3&lang=2), [UMANG overview,
IMPRI](https://www.impriindia.com/insights/umang-unified-mobile-application/). Lesson: a national-scale
multilingual government product treats "voice bot" as a first-class channel alongside the app, not a
bolt-on.

**ASHA-worker apps (ANMOL and successors)** — over 10 lakh ASHA/ANM community health workers moved
from paper registers to apps like ANMOL. Documented lessons from that rollout are directly relevant:
ASHAs **share devices**, work **offline**, and operate in **multilingual, low-literacy field
conditions**, so apps designed like "urban professional" tools fail in the field; **colour-coded
graphical UIs work well** in this exact combination of low literacy + multiple languages; and most
existing tools were built for *administrator data capture*, not *worker support* — a gap the field
workers themselves complain about. [Reimagining Maternal Health Record Keeping for ASHA
Workers](https://medium.com/@surbhisardana/reimagining-maternal-health-record-keeping-for-asha-workers-1113551866b0),
[Designing mobile computational support for low-literate community health workers,
ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S107158191830048X). This maps
almost exactly onto the CAT operator app risk: don't build a telemetry-capture tool for a supervisor
and call it "operator-friendly" — the operator screen has to serve the operator's own moment-to-moment
decisions, not just upstream reporting.

**Meesho** — added vernacular support for **8 Indian languages** (Tamil, Telugu, Marathi, etc.) in
2022, uses **icon-led navigation with universal visuals** to reduce text dependence for tier-2/3,
first-time-internet users, and runs an AI voice bot (Hindi/English, expanding to regional languages).
[What Indian Startups Get Right About Product UX](https://procreator.design/blog/indian-startups-get-right-about-product-ux/),
[Meesho marketing strategy 2026, IIDE](https://iide.co/case-studies/marketing-strategy-of-meesho/). The
onboarding principle worth copying: **vernacular-first, icon-led, trust- and simplicity-first** rather
than feature-first.

**Kisan-type agri apps (Kisan Suvidha, Plantix, Apni Kheti) — a cautionary finding.** A readability
study using the Gunning Fog Index found these three government/commercial farmer apps score at
*moderate-to-high* reading difficulty for their actual end users, despite being explicitly built for
low-literacy farmers. [Indian Journal of Agricultural Sciences readability
study](https://epubs.icar.org.in/index.php/IJAgS/article/download/120831/46308/332675). The lesson:
*intending* to design for low literacy doesn't guarantee it — copy has to be tested against a
readability metric, not just "kept short." The design literature's fix for this class of app: icons
over text, voice-guided flows, no English dependence, and **functional illustrations** (a picture of
the actual action, not a generic icon) to bridge literacy and language gaps simultaneously. [UI/UX
Guide to Agriculture App Design, Gapsy](https://gapsystudio.com/blog/agriculture-app-design/).

### Colour coding and confirmation
Red/amber/green ("traffic light") status coding is close to universally understood and is the right
default for machine/safety state — but **~10% of men and ~1% of women are red-green colour-blind**, so
colour can never be the only signal; pair every state colour with an icon shape and a word. [UX Traffic
Light Colours](https://uxmag.com/articles/ux-traffic-light-colours), [Dashboards: Save Red, Yellow and
Green for Traffic Lights](https://www.dbkay.com/measures/red-yellow-and-green). Across the low-literacy
literature, **confirmation matters disproportionately**: because low-literacy/first-time users are
more likely to mis-tap, mis-read a label, or not fully trust what a screen says, every state-changing
or irreversible action needs a visible, unambiguous confirmation step before it commits — this is the
same principle ui-framework.md's button-state and action-contract sections (§7-9) already encode; the
research just explains *why* it matters even more for this user group specifically.

### Design implications for this build
1. Every safety-critical state (seatbelt off, proximity alert, incident logged, SOS sent) gets three
   simultaneous channels: colour+icon, a short word in the selected language, and a TTS phrase — not
   sequentially degraded (no "read the alert if you can, otherwise tap it").
2. Primary navigation icons are never icon-only; label text sits under/beside every icon, always.
3. Destructive/high-stakes actions (SOS, incident submit, task abandon) get an explicit confirm step;
   everything else should minimize friction, per ui-framework.md's own button-minimisation protocol.
4. Localize with real content review, not just string translation — the Kisan-app finding shows
   translated-but-still-hard copy is a real, common failure mode.

---

## 2. In-cab and rugged use

### Touch targets for gloved operation
**ISO 9241-411** sets a baseline minimum touch target of **9.0 mm** (square) / **11.0 mm** (circular)
for <4% error rate with **3.0 mm** minimum spacing, and explicitly scales targets by context: ~7-8 mm
for stationary desktop touch, **9-11 mm for mobile/handheld use**, and 12-15 mm for public kiosks used
by diverse populations. Separately, **ISO 9241-9** recommends sizing buttons to the breadth of the
distal finger joint of a 95th-percentile male — about **22 mm**. [ISO 9241 touch target size
data](https://www.nngroup.com/articles/touch-target-size/), [ISO 9241 overview,
Fiveable](https://fiveable.me/introduction-industrial-engineering/key-terms/iso-9241). **MIL-STD-1472F**
(DoD Design Criteria Standard) specifies a **0.5 in × 0.5 in (12.7 mm)** minimum button size for a
touch panel operated *without gloves* in a stationary position — i.e. that figure is a bare-finger
floor, not a glove spec. For gloved operation specifically, practitioner guidance for
ruggedized/military field UI converges on **~15-20 mm minimum**, since standard gloves reduce effective
touch precision to roughly 20-25 mm and thin capacitive glove tips to 12-15 mm. [Touch Target Sizing
Law](https://uxuiprinciples.com/en/principles/touch-target-sizing), [UX design for military field
applications: gloved operation, sunlight, stress](https://corvusintell.com/blog/field-apps/ruggedized-ux-military-operators/).

**Recommendation for this app:** primary action targets ≥ 15 mm (roughly 56-64 dp on a standard phone
density) with ≥ 4-6 mm spacing; the SOS button and any acknowledge/confirm control should be sized at
the top of that range (closer to 20 mm) since these are the controls most likely to be hit under
vibration, with a gloved hand, without a careful look.

### Sunlight readability: default to a light, high-contrast theme
Dark UIs read worse outdoors: ambient light reflecting off the screen raises the effective black level
so "blacks shift toward grey" and fine text/edges lose definition — the opposite of what a dark theme
is designed for. [Sunlight Readability for Outdoor Displays](https://www.suntunesignage.com/post/sunlight-readability-for-outdoor-displays-the-science-behind-clear-viewing-in-direct-sunlight),
[Industrial UX: Sunlight Susceptible Screens](https://medium.com/@callumjcoe/industrial-ux-sunlight-susceptible-screens-2e52b1d9706b).
Dark mode is also documented as *harder to see in bright sunlight* generally, even outside industrial
contexts. [Dark Mode Design: A Practical Guide](https://www.uxdesigninstitute.com/blog/dark-mode-design-practical-guide/).
Minimum recommended contrast is WCAG AA's **4.5:1 for body text**; for outdoor glanceable UI this should
be treated as a floor, not a target — aim higher on the hero state card. **Recommendation:** default the
operator cockpit to a light, high-contrast theme (not the inverse of a typical "AI app" dark theme);
reserve a genuine dark variant for night-shift/underground-mining contexts only, switched deliberately
or by ambient-light sensor, not as the default aesthetic choice.

### Noise, vibration, one-hand use
Cab noise on excavators and similar earthmoving equipment **frequently exceeds 90 dB**, and OSHA
requires hearing-conservation measures above 85 dB TWA and engineering/administrative controls above 90
dB TWA (8-hour). [CPWR: Quieter Excavators](https://www.cpwrconstructionsolutions.org/heavy_equipment/solution/815/quieter-excavators.html),
[OSHA Occupational Noise Exposure standards](https://www.osha.gov/noise/standards). This directly
supports the friend-prompt's framing (points 8, 13): at 85-100 dB, a phone/tablet speaker alert **will
be masked**, so any audio alert needs a paired **vibration/flash** channel plus persistent on-screen
text — audio should never be the sole notification path in-cab, exactly inverting the "voice helps
low-literacy users" finding above (voice is essential when *reading* is the bottleneck; vibration/visual
is essential when *hearing* is the bottleneck — the app needs both, simultaneously, not as alternates).
Haptic alerting is a well-documented mitigation for exactly this "can't hear, can't look" combination in
industrial settings, including via wrist-worn form factors if a phone is mounted out of body contact.
[How do haptic feedback wearables reduce notification fatigue?](https://elitacwearables.com/how-do-haptic-feedback-wearables-reduce-notification-fatigue/)

Whole-body vibration during operation is itself governed by **ISO 2631-1/2631-5**, with an EU Exposure
Action Value of **0.47 m/s²** and Exposure Limit Value of **0.93 m/s²**; earthmoving-equipment operators
are among the highest-exposure occupational groups for this. [Whole Body Vibration Exposure Transmitted
to Drivers of Heavy Equipment Vehicles, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9102739/). Two
consequences for the UI: (1) tap targets must tolerate an unsteady hand — hence the enlarged glove-size
minimums above, not the bare ISO 9241 desktop minimum; (2) any physically mounted device benefits from a
vibration-isolating mount (rubber ball-and-socket designs are already standard in this exact use case,
e.g. RAM Mounts deployed on Komatsu excavators for 3D machine guidance) — worth citing as prior art for
"how does a tablet survive a cab," even though it's a hardware, not UI, answer. [How Komatsu Leveraged
RAM Mounts for Onboard 3D Machine Guidance](https://rammount.com/blogs/case-study/how-komatsu-leveraged-ram%C2%AE-mounts-for-onboard-3d-machine-guidance).

**One-hand use:** the friend-prompt (#12, #14) implies one-handed, glanceable use is the norm (operating
a machine with the other hand). Combined with the touch-target sizing above, this argues for a
bottom-anchored primary action zone (thumb reach) and a persistent SOS control in a fixed bottom corner
— never top-of-screen, which is not reachable one-handed on a larger tablet mount.

### Glanceability in ~2 seconds
Automotive HMI guidance (NHTSA-aligned) caps a single glance at **~1.5-2 seconds** and total
eyes-off-primary-task time at ~12 seconds; a "glanceable interface" is explicitly defined as one that
communicates its key message within that single glance — which is a cognitive-ergonomics constraint
(consistent position, consistent shape, strong visual hierarchy), not a minimalism aesthetic. [Design
for glanceable interfaces](https://medium.com/design-bootcamp/design-for-glanceable-interfaces-how-preattentive-vision-shapes-intuitive-interactions-d2042b119280),
[Automotive HMI Design & Development Guide](https://www.apriorit.com/dev-blog/how-to-design-automotive-hmi-system).
This validates ui-framework.md's "signature interaction" hero card (machine state, safety, ETA in one
fixed layout) — it is structurally the right answer to this constraint, provided its layout position and
shape never change between screens/states (only the colour/value changes).

---

## 3. Alert design for safety-critical UI

### Alarm fatigue is a measured, not hypothetical, failure mode
When the great majority of alerts are false or low-value, operators stop trusting and start
auto-dismissing the alert channel — documented in one industrial case where operators acknowledged
alarms without investigating because **95% were known nuisance conditions**, at a rate of ~50
alarms/hour. [Actuate: Alarm Fatigue causes, costs, fixes](https://actuate.ai/alarm-fatigue/). The
process-industry alarm-management standard **EEMUA 191** quantifies the safe zone: **no more than ~1
alarm per 10 minutes per operator** in steady state, with **6-12+ alarms/hour beginning to measurably
degrade operator performance**; it also caps how alarms should be distributed by severity (**no more
than 5% of alarms Priority 1 (critical), no more than 15% Priority 2**), so that the highest tier stays
rare enough to retain meaning. [Alarm System Standards
overview](https://industrialmonitordirect.com/blogs/knowledgebase/industrial-alarm-system-standards-iec-62682-isa-182-and-eemua-191),
[EEMUA Alarm Priority glossary](https://www.eemua.org/Glossary/A/Alarm-Priority.aspx). Direct implication
for "unusual behaviour detection" (problem-statement feature 4, friend-prompt point 8): **the detector
needs a deliberately conservative threshold and a capped alert budget**, or the operator/supervisor will
tune it out within days — this is a concrete, testable design constraint for that model, not just a UI
concern.

### ISO 7010 / ANSI Z535 colour and symbol convention
ANSI Z535.1 and ISO 7010/3864 define the same conceptual escalation used worldwide on physical safety
signage: **yellow = caution** (non-life-threatening hazard, raise awareness), **orange = warning**
(stronger, in-between severity), **red = danger** (immediate threat / prohibits entry), with pictograms
placed inside a yellow triangle with black border/surround for warning-class signs, and black-on-white
or colour-coded pictograms for mandatory/prohibition/emergency classes. [ANSI Z535.1-2022: Safety
Colors](https://blog.ansi.org/ansi/ansi-z535-1-2022-safety-colors-standard/), [ANSI Z535.3-2022:
Designing Effective Safety Symbols](https://blog.ansi.org/ansi/ansi-z535-3-2022-criteria-safety-symbols/),
[Fire Safety Symbol Color Coding Guide: ISO 3864, ANSI Z535](https://evacplangenerator.com/articles/fire-safety-symbol-color-coding-guide).
Because operators already read these exact colour/shape conventions off physical signage around a Cat
machine every day, **reusing them on-screen (not inventing a new app-specific palette) is a literacy
shortcut** — it transfers a convention the operator already trusts instead of asking them to learn a new
one.

### IEC 62682 alarm-management principles, adapted
IEC 62682 ("Management of alarm systems for the process industries") frames the alarm system's job as
"taming" a mixed, near-random-priority notification stream into a true operator-support tool, and
(alongside EEMUA 191, which shares its lineage) formalizes the response lifecycle: **acknowledge** →
(reasonable-time) **respond** → **escalate if unresolved** → **shelve** nuisance conditions for a
bounded time (EEMUA 191's default shelf life is **4 hours**, not indefinite) → **log**. [IEC
62682 overview, Wikipedia](https://en.wikipedia.org/wiki/IEC_62682), [Implementing Alarm Management per
IEC-62682, Yokogawa](https://blog.yokogawa.com/blog/implementing-alarm-management-per-iec-62682-standard).
**Acknowledgement matters** because it is the only signal the system has that a human has actually seen
and taken ownership of a condition — without it, the system cannot know whether to escalate, and the
operator has no forcing function to actually look. ui-framework.md's own sequence (§8: *ALERT → View →
Understand → Acknowledge → Resolve/escalate → Recorded*) already mirrors this almost exactly — it is
correct and should be kept as the canonical pattern for every safety alert, including the SOS flow, with
one addition: an **unacknowledged critical alert should escalate automatically** (e.g. to the
supervisor's Telegram/Twilio channel per friend-prompt #8) after a bounded timeout, rather than staying
silent if the operator can't respond — this is the standards-backed justification for the
Twilio/Telegram escalation the teammate already asked for.

### Escalation tiers for this app (concrete proposal)
- **Tier 1 – Informational** (task progress, weather note): on-screen only, no sound, no vibration.
- **Tier 2 – Caution** (idling threshold approaching, PPE reminder): on-screen + short vibration + amber
  colour/icon; auto-clears if condition resolves; does not require explicit acknowledgement.
- **Tier 3 – Warning** (proximity hazard, seatbelt off while machine active): on-screen + sustained
  vibration/flash + orange colour/icon + TTS phrase; **requires acknowledgement**; unacknowledged after
  a short bounded window escalates to Tier 4.
- **Tier 4 – Critical / SOS** (operator-initiated SOS, or system-detected severe hazard near operator's
  logged position): red, full-screen, vibration + audio + TTS in the operator's language, **and**
  simultaneous out-of-band notification (Twilio call/SMS + Telegram to the supervisor) — this tier does
  not wait for in-app acknowledgement to fire the external escalation, it fires both at once, because the
  cost of a late external alert is much higher than the cost of a false positive at this tier.

This keeps the app's own Priority-1-class alerts rare (per EEMUA's 5% guidance) by design: only Tier 4
triggers the "call a human" path, so it stays meaningful every time it fires.

---

## 4. Language coverage and i18n stack

### Which languages cover the construction/mining operator population
By native-speaker count (2011 Census, most recent full-population language census): **Hindi ~528M
(43.6%)**, **Bengali ~97.2M (8.0%)**, **Marathi ~83.0M (6.9%)**, **Telugu ~81.1M (6.7%)**, **Tamil
~69.0M (5.7%)**, **Kannada ~43.7M (3.6%)**, **Odia ~37.5M (3.1%)**. [List of languages by number of
native speakers in India, Wikipedia](https://en.wikipedia.org/wiki/List_of_languages_by_number_of_native_speakers_in_India),
[India's 2011 Census Indic Language Data, Reverie](https://reverieinc.com/blog/2011-census-indic-language-data-localisation/).
Mapped onto the regions the brief names: **Hindi** covers the Hindi belt and is also the dominant lingua
franca across the Jharkhand/Chhattisgarh mining belt; **Odia** is specific to Odisha's mining workforce
(and Odisha mining districts show real linguistic fragmentation below Odia/Hindi — e.g. Jharsuguda
district's 2011 census shows Sambalpuri 42.3%, Odia 27.4%, Hindi 9.6%, plus Kisan, Munda, Kharia, Sadri
as smaller shares — a reminder that even a 6-language demo is a simplification of ground truth, not full
coverage); **Tamil** covers Tamil Nadu; **Telugu** covers Telangana/Andhra Pradesh; **Kannada** covers
Karnataka; **Marathi** covers Maharashtra (a major construction-equipment market and Cat dealer base);
**Bengali** covers West Bengal. [Jharsuguda district, Wikipedia](https://en.wikipedia.org/wiki/Jharsuguda_district).

**Recommended demo set (6 languages):** **English, Hindi, Marathi, Telugu, Tamil, Odia.** Rationale:
Hindi + English cover the largest combined population and function as defaults; Marathi, Telugu and
Tamil each anchor a distinct, large, non-Hindi-belt operator population named in the brief; Odia is
the deliberate inclusion that signals real understanding of the mining-belt workforce (most hackathon
teams will stop at Hindi/Tamil/Telugu/Bengali) and is cheap to add given Noto Sans Oriya exists in the
same font family. If forced to cut to 4 for time: **English, Hindi, Telugu, Tamil**, with Marathi and
Odia as the first two stretch languages. In production, real coverage would eventually need Bhashini's
broader model set (which already reaches many of these languages plus some tribal ones like Santali) —
worth naming as the credible production path even though it's out of scope for a demo build.
**UNVERIFIED**: exact current language coverage of Bhashini's voice models per language as of this
writing.

### i18n implementation
**Web (Next.js App Router): next-intl.** It is the default 2026 recommendation for App Router projects
— ~2 KB bundle, native React Server Component support, built-in locale routing via middleware, and full
TypeScript type-safety for translation keys; setup is a `[locale]` route segment + middleware +
`useTranslations()`/`getTranslations()`. [next-intl official docs](https://next-intl.dev/docs/getting-started/app-router),
[next-intl: The Complete Next.js i18n Guide 2026](https://stacknotice.com/blog/nextjs-i18n-next-intl-guide-2026).

**Mobile (Expo): i18next + expo-localization.** This is documented as the de facto standard pairing for
Expo/React Native — `expo-localization` reads the device's language/region/calendar/text-direction,
`i18next` + `react-i18next` handle translation, interpolation and pluralization via the
`useTranslation()` hook, installed via `npx expo install expo-localization react-i18next i18next`.
[Expo Localization docs](https://docs.expo.dev/guides/localization/), [A Comprehensive Guide to React
Native Localization, Phrase](https://phrase.com/blog/posts/react-native-i18n-with-expo-and-i18next-part-1/).
Given master-plan.md already commits to Expo for mobile, this pairing is the correct, already-aligned
default — no further evaluation needed.

### Fonts, text expansion, line-height
Google's **Noto Sans** family ships purpose-built, UI-optimized variants per Indic script — **Noto Sans
Devanagari (UI)**, **Noto Sans Tamil (UI)**, **Noto Sans Telugu**, and (for the recommended Odia
addition) Noto Sans Oriya — designed specifically for on-screen app/website interface use rather than
long-form typesetting. [Noto Sans Devanagari UI](https://notofonts.github.io/noto-docs/specimen/NotoSansDevanagariUI/),
[Noto Sans Tamil UI](https://notofonts.github.io/noto-docs/specimen/NotoSansTamilUI/), [Noto Sans
Telugu](https://fonts.google.com/noto/specimen/Noto+Sans+Telugu). Recommended CSS/font-stack pattern:
stack the active script's Noto Sans (UI variant where available) before a Latin fallback, e.g.
`'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans', sans-serif`, so mixed
content (a Latin numeral inside a Hindi sentence) renders consistently.

**Text expansion:** short UI strings (button labels, nav items) are the worst case — a single English
word can expand by **100-300%** when translated, and German-family languages expand 20-35% even on
longer strings; the W3C's general guidance is to design for **up to 2× expansion on short strings**.
[Text Expansion by Language: The Cheat Sheet for Designers](https://localeproof.com/blog/text-expansion-by-language/),
[Text Expansion Is Breaking Your UI, Translated.com](https://translated.com/resources/text-expansion-ui-translation).
This directly confirms ui-framework.md §6's existing rule ("no containers that only work in English, no
fixed-width buttons") — it's correct, and should be enforced with `min-width` + intrinsic sizing, never
fixed pixel widths, on every label, chip and button.

**Line-height:** Devanagari, Tamil and Telugu all place vowel signs (matras) above and below the base
consonant, and Devanagari in particular has a connecting headstroke (shirorekha) — scripts like these
need **taller line-height than Latin text** to avoid visual clipping/crowding; no single authoritative
numeric line-height ratio was found in this research pass (**UNVERIFIED exact multiplier** — Noto's own
docs do not publish one), so the practical rule is: pick a generous baseline (e.g. 1.4-1.6× font size,
vs. ~1.2× typical for Latin-only UI) and visually QA each Indic script's UI variant directly rather than
trusting a single ratio across all six scripts.

---

## 5. Onboarding and the two-mode UI

### Onboarding sequence: language → role → minimal setup
This matches both the friend-prompt (#12: "user also gets a choice to select the app language at
start") and general onboarding best practice: keep first-launch flows to a handful of screens, each with
one clear purpose, moving the user to real value fast. [Mobile App Onboarding: 11 Best Practices,
DesignStudioUIUX](https://www.designstudiouiux.com/blog/mobile-app-onboarding-best-practices/). For
language selection specifically, **flags alone are a known failure mode** — flags represent countries,
not languages (a flag doesn't disambiguate Hindi from Marathi, both spoken heavily in areas that also
use the Indian flag), so the safest pattern is **each language's own name, written in its own script**
(e.g. "हिन्दी", "தமிழ்", "తెలుగు") as the primary label, with a small supporting icon/illustration per
language only as a secondary visual anchor — not a substitute for the native-script name. [Designing A
Perfect Language Selector UX, Smashing Magazine](https://www.smashingmagazine.com/2022/05/designing-better-language-selector/),
[Language selector best practices, SimpleLocalize](https://simplelocalize.io/blog/posts/language-selector-best-practices/).
A voice prompt reading each language name aloud as the user scrolls (per the icon+text+voice principle
in §1) is a natural, low-cost addition given this is the very first screen a possibly non-reading user
sees.

Given ASHA-worker research above ("ASHAs share devices"), the language switch must also be **reachable
from every screen in one tap**, not just at first launch — a shared-device shift handover (e.g. two
operators on the same tablet across a shift) is a realistic scenario for this product.

### Two-mode UI (simple vs. detailed) without doubling the build
This is a known, only-partially-solved UX pattern: the common approach is a single screen with a
**core layer always visible** and an **"advanced"/detail layer revealed by one explicit control**,
rather than two separately designed and maintained screens — this keeps novice and expert users on the
same information architecture and the same underlying components, differing only in density and
optional depth. [UI Practicum: How to Present Advanced Options Without Overwhelming the
User](https://uibreakfast.com/practicum-02-optimize-common-scenarios-scheduling/), [GUIs are killing
Expert Users, on the same novice/expert tension](https://medium.com/@neilpfeiffer/guis-are-killing-expert-users-2655f095992a).
The research is candid that transitioning users from novice to expert well is "largely unsolved" — so
the safest implementation is **not** an automatic graduation system, but a **persistent, user- or
role-set toggle** (Simple / Detailed) that the operator or supervisor controls directly.

**Concrete mechanism for this build:**
1. Every screen's data model is authored once, with each field tagged `core` or `detail`.
2. **Simple mode** renders only `core` fields, at larger type size, with icon+colour+word for every
   state, and voice narration on by default. This is the default for the operator role generally, and
   always the default for a first-time/low-literacy-flagged profile.
3. **Detailed mode** renders `core` + `detail` fields at standard density (smaller type, more numeric
   precision, secondary charts), voice optional. Default for supervisor/experienced-operator roles.
4. The mode toggle is one switch in Settings *and* a one-tap affordance on the Home screen (not buried),
   because friend-prompt #11 treats "easy to navigate for both freshers and experienced" as equally
   important, not novice-only.
5. This means **one component library, one set of API responses, one codebase** — "detail" is a
   visibility flag plus a type-scale token, not a second app. This directly satisfies the brief's "ease
   to use... important for skilled person and uneducated operator" (point 2) and "without doubling the
   build."

---

## 6. Critique of docs/design/ui-framework.md and proposed information architecture

### What's excellent (keep as-is)
- **The L1-L6 hierarchy (§3) is exactly right** for this user group. It operationalizes the same
  finding the low-literacy literature keeps repeating — complex hierarchical navigation is where these
  users fail — by forcing "current task → safety → machine state → action → secondary info" as a fixed
  priority order rather than a flat menu.
- **The signature-interaction hero card (§5)** is a well-chosen glanceable pattern: fixed position, fixed
  shape, colour/value-only changes — this is precisely what the automotive-HMI glanceability research
  (§2 above) says a 2-second glance needs.
- **The button action-contract and one-action-one-sequence rules (§7-9)** already encode the
  IEC 62682/EEMUA alert-response lifecycle (acknowledge → resolve/escalate → recorded) almost exactly,
  and the "confirmation, undo, duplicate prevention" fields map directly onto the low-literacy
  literature's emphasis on confirmation as a trust mechanism.
- **The anti-AI visual rules (§12)** (no glassmorphism, no gradients, no glowing particles) happen to
  also be the right call for sunlight readability — glass/gradient surfaces are exactly what loses
  contrast outdoors — so the aesthetic rule and the ergonomic rule reinforce each other here, probably
  by accident, but worth keeping for both reasons.
- **The "no fixed-width containers, text must expand" rule (§6)** is already correctly anticipating the
  100-300% short-string text-expansion finding in §4 above.

### What's wrong or missing for this user group
1. **No voice/TTS channel anywhere in the document**, despite the friend-prompt (#12) explicitly asking
   for it and the core research finding (0% text-only vs. 72% voice vs. 100% icon+voice+text success) — the
   document's multilingual section (§6) covers labels and layout but never mentions audio. This is the
   single biggest gap relative to both the evidence and the teammate's stated requirement.
2. **No touch-target sizing spec.** For a glove-operated, vibrating cab environment this is not a
   cosmetic omission — undersized targets in this context are a safety-relevant miss-tap risk, not just
   a usability annoyance. Needs an explicit minimum (see §2 above: ≥15 mm, ≥20 mm for SOS/acknowledge).
3. **No stated default theme (light vs. dark) or contrast floor**, despite "sunlight readability" being
   core to the brief's own environment (outdoor cabs, in-cab glare). The document should commit to a
   high-contrast light default with a deliberate, separately-triggered dark variant for night/underground
   use, not leave this open.
4. **Offline is treated as one bullet in a list of button states (§9)**, not as a persistent, always-
   visible system state — this under-serves friend-prompt #10 (no-internet mode, edge computing, "last
   updated" data) which the brief treats as core, not edge-case. A confident-looking UI silently showing
   stale hazard data is a real safety risk; "Offline — last synced HH:MM" needs to be a persistent,
   glanceable chip, not a disabled-button style.
5. **No supervisor/manager persona or navigation at all** — the whole document is written for a single
   "the operator" audience. But the brief clearly implies a second audience (who receives SOS calls,
   Telegram alerts, incident logs, unusual-behaviour flags, and needs a fleet-level map/analytics view).
   This is the largest structural gap versus friend-prompt #2/#11/#14's explicit "skilled person and
   uneducated operator" framing, and versus the two-mode UI need described in §5 above.
6. **Colour is described qualitatively ("controlled colour") but never tied to a concrete, colour-blind-
   safe rule** — given ~10% of men can't reliably distinguish red/green, and safety state is the single
   highest-stakes use of colour in this app, the document should hard-require colour+icon+word together,
   every time, not just for the hero card.

### Where it conflicts with the teammate's requirements
- **SOS button (friend-prompt #13):** the framework's minimalism protocol (§7: "before any button, ask
  if a button is needed") and "no unnecessary screens" rule (§11), if applied uniformly, would tend to
  cut or bury exactly the kind of always-present, single-purpose, low-frequency-but-critical control the
  SOS button has to be. The document needs an explicit exception: SOS is protected above L1, exempt from
  the minimalism reduction pass, and — unlike other state-changing actions — should use a **short
  hold-to-arm gesture instead of a confirmation modal**, because a modal costs seconds an emergency can't
  spare; this is a deliberate, stated exception to the framework's own confirmation-by-default rule, not
  an oversight.
- **Map / GPS breadcrumb trail with faulty-machine correlation (friend-prompt #5):** the framework's own
  worked example of its navigation set (§10: "Home, Current Task, Safety, Training, History") **omits
  Map entirely**. Applied literally, "no unnecessary screens" (§11) could be read as license to cut a
  feature the teammate explicitly asked for. Map needs to be named as a first-class nav item, not
  something to fold into an existing screen.
- **Simulation game (friend-prompt #7, #14):** the "motion is restrained" rule (§4: avoid bouncing,
  particles, exaggerated transitions) is correct for the operational cockpit but is in direct tension
  with what makes a decision-training game legible and motivating (visible right/wrong feedback, score
  reveals, pacing). The document needs an explicit carve-out: the Training/Simulation surface may use a
  materially larger motion budget than L1-L4 operational screens, as long as it never bleeds into the
  cockpit, safety or alert surfaces.
- **Voice/TTS (friend-prompt #12) and Twilio/Telegram escalation (friend-prompt #8, #13):** neither
  appears in the document at all — see gap 1 above and the alert-tier proposal in §3.

### Proposed information architecture

**Persistent/global elements (present on every screen, survive navigation and modals):**
- **SOS control** — fixed bottom-corner, thumb-reachable one-handed, icon **and** the word "SOS" in the
  active language, hold-to-arm (not tap-then-modal), red, exempt from the minimalism reduction pass.
- **Safety-state chip** — colour + icon + word, tied 1:1 to the hero card's safety value, header area.
- **Connectivity chip** — "Live" vs. "Offline — synced HH:MM", next to the safety chip; never hidden.
- **Language switch** — one tap from anywhere (not buried in Settings), native-script label.
- **Bottom nav (operator, 5 items max, icon+label always paired):** Home · Task · Safety · Map ·
  Training.

**Screens:**
1. **Language & Role picker** (first launch only) — native-script names, voice-narrated, then role
   (Operator / Supervisor), then minimal setup (machine ID pairing).
2. **Home / Cockpit** — the signature hero card (machine state, safety, ETA) + today's task list
   (Daily Task Dashboard) + current environmental/working-condition chip (heat/cold/pressure per
   friend-prompt #6). Satisfies L1-L3 in one screen, per the framework's own "no unnecessary screens"
   rule (§11).
3. **Current Task** — progress, ETA, weather, machine state, Start/Pause/Complete, task-time estimate
   with a confidence range (feeds problem-statement feature 5).
4. **Safety** — seatbelt/PPE/proximity state, active-alert queue with the Tier 1-4 escalation pattern
   from §3, hash-stamped incident log and "Log Incident" flow.
5. **Map** — GPS breadcrumb trail (Strava-style), nearby-machine overlay colour-coded by health/fault
   state, a "what to do" card when a fault machine is within the operator's logged radius.
6. **Training Hub** — e-learning video list, instructor booking, and the simulation-game entry point
   (game itself is a separate motion-budget surface, per the carve-out above).
7. **History / Analytics** — past tasks vs. estimate, idling trend, mostly supervisor-weighted, shown in
   `core`-only form to operators.
8. **Settings** — language, Simple/Detailed mode, voice on/off, offline sync detail, PPE sensor pairing.

**Supervisor navigation (same component library, role- and mode-flagged, not a second app):**
Fleet Map (all operators' trails + fault correlation across the crew) · Alerts Inbox (SOS calls,
unusual-behaviour flags with location and the Twilio/Telegram dispatch log) · Analytics (task-time vs.
environment/skill/weather) · Incident Ledger (hash-verified). Reached by the same role gate that flips
default mode to Detailed — this is the concrete implementation of the two-mode mechanism from §5.

### 2-3 UI direction options (words only; anti-AI-look rules respected throughout: no gradients, no
glassmorphism, no glowing/floating elements, no stock-AI iconography — real industrial reference points
only)

**Direction A — "Site Signage" (recommended default).** Typography: one heavy, robust grotesk for
numerals and state words (large, e.g. the hero card's state word set materially larger than any other
text on screen), paired with each language's Noto Sans UI variant at matching weight. Colour: a warm,
slightly off-white/light-grey base (not pure white — cuts glare) with near-black text, and the three
ANSI/ISO safety colours (yellow/orange/red) reserved *exclusively* for state — never used decoratively
elsewhere in the UI — plus one accent hue for primary actions only. Layout: modeled on physical safety
signage and stencil plates — thick rules, sharp/near-zero corner radius, boxed modules, real machine
photography or flat line-art icons only (no illustration style). This direction is the strongest match
for "industrial, calm, trustworthy" and for outdoor sunlight legibility.

**Direction B — "Field Notebook."** Typography: a slightly warmer humanist sans (still paired with
Indic Noto variants), mixed-weight hierarchy, a subtle rule-line motif referencing a paper site
logbook/checklist — a familiar mental model for operators who already keep physical logs. Colour: warm
paper-white base, ink-navy text, safety states shown as filled circular "stamp" badges (dot + word)
rather than banners. Layout: single-column, checklist-first, large left-aligned icon+word rows, generous
line-height tuned per script. Best fit for the most literacy- and smartphone-novice segment of the
operator base, since it leans on a pre-digital mental model rather than a "tech product" one.

**Direction C — "Console" (optional dark variant, not the default).** Typography: tabular/condensed
numerals for stats (ETA, %, readouts) against a wide, highly legible sans for words — closer to a
physical instrument cluster. Colour: true dark background with high-contrast white/amber text, same
red/amber/green safety triad, flat colour blocks and real strokes (no glow, no blur) to stay anti-AI.
Layout: denser instrument-style clusters, a circular/gauge progress ring as an alternate rendering of the
signature hero card. Recommended only as an explicit night-shift/underground-mining mode (Odisha/
Jharkhand/Chhattisgarh coal contexts, per friend-prompt #6's low-light/extreme-condition cases), switched
deliberately or by ambient-light sensor — not the app's default face, given the sunlight-readability
research in §2 favors a light theme for daytime outdoor cab use.

**Recommendation:** ship Direction A as the primary/default direction (it best serves the largest
population — daytime outdoor operation, first-time/low-literacy users, glove/glare conditions) with
Direction C available as a deliberate dark mode for night/underground contexts; keep Direction B in
reserve as the alternative to pitch if Shlok wants a warmer, less "product-y" feel for the demo.

---

## Sources (deduplicated)

- [Designing mobile interfaces for novice and low-literacy users, ACM TOCHI](https://dl.acm.org/doi/10.1145/1959022.1959024)
- [UIs for Low-Literate Users, Microsoft Research](https://www.microsoft.com/en-us/research/project/uis-low-literate-users/)
- [Actionable UI Design Guidelines for Smartphone Applications Inclusive of Low-Literate Users, ACM 2021](https://dl.acm.org/doi/10.1145/3449210)
- [Designing User Interfaces for Illiterate and Semi-Literate Users: A Systematic Review, SAGE 2023](https://journals.sagepub.com/doi/full/10.1177/21582440231172741)
- [Designing Accessible UIs for Illiterate Populations in Rural Africa, Zenodo](https://zenodo.org/records/18805638)
- [Google Pay to introduce AI-powered voice payments in India](https://ibsintelligence.com/ibsi-news/google-pay-to-introduce-ai-powered-voice-payments-in-india/)
- [Google Pay voice-activated UPI payments, India TV News](https://www.indiatvnews.com/technology/apps/google-pay-to-support-voice-activated-upi-payments-with-new-ai-integration-2025-02-16-976504)
- [UMANG 3-year anniversary release, PIB](https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=1675131&reg=3&lang=2)
- [UMANG overview, IMPRI](https://www.impriindia.com/insights/umang-unified-mobile-application/)
- [Reimagining Maternal Health Record Keeping for ASHA Workers](https://medium.com/@surbhisardana/reimagining-maternal-health-record-keeping-for-asha-workers-1113551866b0)
- [Designing mobile computational support for low-literate community health workers, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S107158191830048X)
- [What Indian Startups Get Right About Product UX (Meesho)](https://procreator.design/blog/indian-startups-get-right-about-product-ux/)
- [Meesho marketing strategy 2026, IIDE](https://iide.co/case-studies/marketing-strategy-of-meesho/)
- [Indian Journal of Agricultural Sciences readability study (Kisan Suvidha, Plantix, Apni Kheti)](https://epubs.icar.org.in/index.php/IJAgS/article/download/120831/46308/332675)
- [UI/UX Guide to Agriculture App Design, Gapsy](https://gapsystudio.com/blog/agriculture-app-design/)
- [UX Traffic Light Colours](https://uxmag.com/articles/ux-traffic-light-colours)
- [Dashboards: Save Red, Yellow and Green for Traffic Lights](https://www.dbkay.com/measures/red-yellow-and-green)
- [Touch Targets on Touchscreens, NN/G](https://www.nngroup.com/articles/touch-target-size/)
- [ISO 9241 overview, Fiveable](https://fiveable.me/introduction-industrial-engineering/key-terms/iso-9241)
- [Touch Target Sizing Law in UX Design](https://uxuiprinciples.com/en/principles/touch-target-sizing)
- [UX design for military field applications: gloved operation, sunlight, stress](https://corvusintell.com/blog/field-apps/ruggedized-ux-military-operators/)
- [Sunlight Readability for Outdoor Displays](https://www.suntunesignage.com/post/sunlight-readability-for-outdoor-displays-the-science-behind-clear-viewing-in-direct-sunlight)
- [Industrial UX: Sunlight Susceptible Screens](https://medium.com/@callumjcoe/industrial-ux-sunlight-susceptible-screens-2e52b1d9706b)
- [Dark Mode Design: A Practical Guide](https://www.uxdesigninstitute.com/blog/dark-mode-design-practical-guide/)
- [CPWR: Quieter Excavators](https://www.cpwrconstructionsolutions.org/heavy_equipment/solution/815/quieter-excavators.html)
- [OSHA Occupational Noise Exposure standards](https://www.osha.gov/noise/standards)
- [How do haptic feedback wearables reduce notification fatigue?](https://elitacwearables.com/how-do-haptic-feedback-wearables-reduce-notification-fatigue/)
- [Whole Body Vibration Exposure Transmitted to Drivers of Heavy Equipment Vehicles, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9102739/)
- [How Komatsu Leveraged RAM Mounts for Onboard 3D Machine Guidance](https://rammount.com/blogs/case-study/how-komatsu-leveraged-ram%C2%AE-mounts-for-onboard-3d-machine-guidance)
- [Design for glanceable interfaces](https://medium.com/design-bootcamp/design-for-glanceable-interfaces-how-preattentive-vision-shapes-intuitive-interactions-d2042b119280)
- [Automotive HMI Design & Development Guide](https://www.apriorit.com/dev-blog/how-to-design-automotive-hmi-system)
- [Actuate: Alarm Fatigue causes, costs, fixes](https://actuate.ai/alarm-fatigue/)
- [Alarm System Standards IEC 62682, ISA 18.2, EEMUA 191](https://industrialmonitordirect.com/blogs/knowledgebase/industrial-alarm-system-standards-iec-62682-isa-182-and-eemua-191)
- [EEMUA Alarm Priority glossary](https://www.eemua.org/Glossary/A/Alarm-Priority.aspx)
- [ANSI Z535.1-2022: Safety Colors](https://blog.ansi.org/ansi/ansi-z535-1-2022-safety-colors-standard/)
- [ANSI Z535.3-2022: Designing Effective Safety Symbols](https://blog.ansi.org/ansi/ansi-z535-3-2022-criteria-safety-symbols/)
- [Fire Safety Symbol Color Coding Guide: ISO 3864, ANSI Z535](https://evacplangenerator.com/articles/fire-safety-symbol-color-coding-guide)
- [IEC 62682, Wikipedia](https://en.wikipedia.org/wiki/IEC_62682)
- [Implementing Alarm Management per IEC-62682, Yokogawa](https://blog.yokogawa.com/blog/implementing-alarm-management-per-iec-62682-standard)
- [List of languages by number of native speakers in India, Wikipedia](https://en.wikipedia.org/wiki/List_of_languages_by_number_of_native_speakers_in_India)
- [India's 2011 Census Indic Language Data, Reverie](https://reverieinc.com/blog/2011-census-indic-language-data-localisation/)
- [Jharsuguda district, Wikipedia](https://en.wikipedia.org/wiki/Jharsuguda_district)
- [next-intl official docs](https://next-intl.dev/docs/getting-started/app-router)
- [next-intl: The Complete Next.js i18n Guide 2026](https://stacknotice.com/blog/nextjs-i18n-next-intl-guide-2026)
- [Expo Localization docs](https://docs.expo.dev/guides/localization/)
- [A Comprehensive Guide to React Native Localization, Phrase](https://phrase.com/blog/posts/react-native-i18n-with-expo-and-i18next-part-1/)
- [Noto Sans Devanagari UI](https://notofonts.github.io/noto-docs/specimen/NotoSansDevanagariUI/)
- [Noto Sans Tamil UI](https://notofonts.github.io/noto-docs/specimen/NotoSansTamilUI/)
- [Noto Sans Telugu](https://fonts.google.com/noto/specimen/Noto+Sans+Telugu)
- [Text Expansion by Language: The Cheat Sheet for Designers](https://localeproof.com/blog/text-expansion-by-language/)
- [Text Expansion Is Breaking Your UI, Translated.com](https://translated.com/resources/text-expansion-ui-translation)
- [Mobile App Onboarding: 11 Best Practices, DesignStudioUIUX](https://www.designstudiouiux.com/blog/mobile-app-onboarding-best-practices/)
- [Designing A Perfect Language Selector UX, Smashing Magazine](https://www.smashingmagazine.com/2022/05/designing-better-language-selector/)
- [Language selector best practices, SimpleLocalize](https://simplelocalize.io/blog/posts/language-selector-best-practices/)
- [UI Practicum: How to Present Advanced Options Without Overwhelming the User](https://uibreakfast.com/practicum-02-optimize-common-scenarios-scheduling/)
- [GUIs are killing Expert Users](https://medium.com/@neilpfeiffer/guis-are-killing-expert-users-2655f095992a)
