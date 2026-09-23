# G1 — Founder-validator review of the Spotter spec (docs/specs/idea.md v1)

Reviewer persona: founder-validator (`.claude/agents/founder-validator.md`). Date: 2026-09-23.
Inputs: docs/specs/idea.md; docs/brief/01, 03, 04; docs/research/05 (§1.2, §3, §4.1, §6, §7), 08 (all),
10 (§1, §2, §5), 11 (§7), 13 (§2, §3.1, §6). Live checks listed at the end.
Note: the spec cites `docs/research/12` for the .env list. **That file does not exist.**

## Verdict: PROMISING

The spec covers all five problem-statement features and all 15 of the teammate's points. That is
also its weakness. It lists 11 modules and about 45 P0 items, and the one idea that could win (the
Spotter Loop) is built as a recommendation engine that assigns pre-made lessons. A judge will see a
very complete dashboard. They will not see a leap. Fix the Loop, cut the P0 list, and remove four
overclaims before anyone from Caterpillar reads the deck.

---

## 1. Truth: what is unsupported or wrong

| Spec claim | Problem | Fix |
|---|---|---|
| §2 "tamper-**proof** record" | A hash chain inside a database the admin controls is tamper-**evident**, and only against non-admins. An admin can rewrite a row and recompute every later hash. | Say "tamper-evident". Anchor the chain head outside the database: post each new head hash (or a daily Merkle root) to the supervisor's Telegram channel. That costs nothing and gives an outside witness. The demo verifier then compares against the anchored hash. |
| M2 "three-zone model … **ISO 21815 style**" | ISO 21815 covers machine-mounted collision warning and avoidance systems (CWAS): detection, operator warning, speed reduction or motion inhibit (research 10 §2). The three zones are our design, not the standard's. A phone app cannot inhibit motion. Saying "ISO 21815" to a Cat Detect engineer invites a question we lose. | "Graded risk zones, informed by the risk-area concept in ISO 21815-3/-4. Spotter is not a CWAS. It consumes proximity events from one, such as Cat Detect or UWB tags." |
| M7 Skill Passport "**mapped to Cat Operator Levels I-III**" | Cat Level I ("Competent Operator") is a certificate issued by Caterpillar Certified Instructors (research 05 §1.2). We map 4 tiers onto 3 and imply equivalence. That is a certification claim Cat's own training team will reject. | "Competency categories aligned with Cat Level I (pre-op inspection, safe technique, hazard recognition). Level-up requires instructor sign-off. Spotter issues no Cat certification." |
| §2 "**Nothing in Cat's stack closes this loop today**" | This is too absolute. Cat says Operator Coaching lets managers "focus training on areas specific to the operator's needs", and positions the AI Assistant to "coach inexperienced operators". | "No public evidence that Cat turns a coaching event into an assigned lesson and then measures whether the event recurs." |
| M5 "Cat's own baseline of 25 % average" idle | Research 11 §7.1 says idle figures conflict, and the 40/50 % thresholds are our synthesis. | Cite the 25 % to its Cat source on the slide and label the thresholds "configurable, our defaults". |
| M2 "Designed against alarm fatigue (EEMUA 191)" | Acceptable, but "designed against" implies a formal assessment. | Say "follows EEMUA 191 / IEC 62682 principles". |
| §6 step 4 "**Ravi's phone rings**" while he is near a faulty machine | A cab above 90 dB (research 14 §2), gloves, and a ringing phone during operation is itself a distraction hazard. A Cat safety judge will notice. | Place the call only when the operator is on foot or the machine is parked (GPS speed or telemetry). In the cab, use the full-screen Critical alert plus TTS. Stage the demo during the walk-around, with Ravi on foot. |

The spec does **not** mention the two datasets supplied with the problem statement. Judges will look
for their columns: Timestamp, Machine ID, Operator ID, Engine hours, Fuel used, Load cycles, Idling
time, Seatbelt status, Safety alerts; and Task ID, Task type, Weather, Operator skill, Machine age,
Estimated time, Actual time. The fabricated schema must contain them *verbatim* as a subset. The
demo should load the organisers' CSV without errors. The ETA model should report its error against
their `Estimated time` column. "Our P50 is X % closer to actual than the provided estimate" is the
most honest number in the deck.

## 2. Buyer and KPI

This is unchanged from research 08 and still right. Three buyers: the Cat dealer's training head
(training revenue, operators certified), the fleet HSE and L&D heads (time-to-proficiency, incidents
per 1,000 h) and the Cat Digital owner of VisionLink or the AI Assistant (attach rate). The spec's
**repeat-event rate** is the right north star. But the spec never shows it moving. A KPI named on the
closing slide and never demonstrated reads as a wish.

## 3. Differentiation (question b): is the Spotter Loop real?

**Partly.** Re-verified live today:
1. **VisionLink Operator Coaching** (Cat, July 2024) tracks Operating Efficiency and Machine Health
   tips. The operator gets an onboard notification, and managers review the triggered tips off-board
   to "focus training". → Detection plus a manager report already exists. **The event half of our
   loop is Cat's.**
2. **Cat AI Assistant** runs at the edge on NVIDIA Jetson Thor. The in-cab version is meant to "coach
   inexperienced operators", set alerts and adjust settings. The announcement said in-cab was in
   "final stages of validation". I found no general-availability notice by September 2026. →
   **In-the-moment coaching is Cat's.**

What neither does, as far as public sources show: (a) turn a specific event into an assigned
practice task, (b) re-measure whether the same event recurs for that operator, and (c) reach the
operator off the machine, on non-Cat or older machines without Jetson Thor. That is a real gap. But
as specified, the Loop is "event → pick a lesson from a library", which Cat could add to VisionLink
in a sprint. It becomes a differentiator only if (i) the practice is **generated from the event
itself** and (ii) the KPI is **shown dropping** (see §4).

Cat Detect is sensor hardware that warns and inhibits motion. It does not coach (research 05 §3.1).
Spotter should present itself as a consumer of Detect events, never as a proximity system.

## 4. Step change (question d): what still looks generic, and the one change

**Generic. At least 1,000 of the 1,500 teams will have these:** a KPI dashboard, a map with coloured
machine pins, a chatbot (Ask Spotter, RAG), a video library with quizzes, a booking form, an alert
inbox, an ETA number with a feature-importance bar, and an isolation forest. Ask Spotter in particular
contradicts §8 ("we cut our own in-cab voice assistant"). A voice Q&A in Hindi *is* that assistant,
and it invites a head-to-head with "Hey Cat". Demote it to a cited-SOP panel inside the lesson and
the incident flow. Drop demo step 8.

**Not generic:** the hash chain with a live tamper, the Hindi phone call, PPE gating Start, and the
airplane-mode moment. Keep all four. They are cheap and memorable.

**The one change that makes it unforgettable: "Replay" — the operator's own near-miss becomes the
simulation.** When the Guardian or seatbelt event fires, Spotter builds the scenario from *that
event's data*: the real site map, Ravi's actual GPS trail, EXC-014's position and fault, the wind
direction from the conditions chip, and the seconds he took to acknowledge. Then it stages the
decision points on it ("which way do you move?", "what do you tell the supervisor?"). He replays his
own two minutes, scored on outcome and process, with the SOP cited at each step. The demo shows the
Guardian alert in step 4, and in step 5 the same map, trail and machine come back as the rehearsal.
Close with a synthetic 90-day cohort chart: operators who got Replay against those who got the
generic lesson only, with repeat-event rate for each (labelled as synthetic). This is research 08's
"the training writes itself around you", made visible. It reuses M4, M7 and the ledger, so it adds
little build. And it is the one thing a Cat Digital VP cannot say VisionLink already does.

## 5. Feasibility: what to cut from P0

About 45 P0 items is not a review-1 build for 1-2 people, even with AI assistance. Move these to P1
or the roadmap:
- 6 languages → **2 fully done** (Hindi, English), plus 1 to show the script switch (Telugu or
  Tamil). The others become JSON stubs on the roadmap slide.
- Micro-lesson videos: **2** generated, not a library "organised by machine × skill × condition".
- Simulation 1 "Spot the Hazard" → P1. Simulation 2 becomes Replay (above).
- Instructor booking → P1 (minimal, low wow).
- Statistical EWMA layer: keep. Isolation Forest stays P1, as specified.
- Ask Spotter chat and voice → P1, reduced to the cited-SOP panel.
- Working-condition safety: build heat and cold end to end. Show the others as taxonomy rows.
- Telemetry at 5-minute resolution (518K rows) → fine offline. For the demo, generate 90 days
  but load 14 into the app.

## 6. Kill list

1. "ISO 21815 style", "tamper-proof", "mapped to Cat Operator Levels I-III" (overclaims, §1).
2. Ask Spotter as a headline or demo step (it duplicates Cat AI Assistant).
3. The lesson library as a feature (Cat has 40+ courses). Present Spotter as the layer that
   *assigns and measures*.
4. Phone calls to an operator who is driving.
5. Any KPI on the close that the demo never showed moving.

## 7. Name (question a)

**Verdict: keep "Spotter". Do not switch to Datum or Plumb.**
- For: it is an instantly legible site role (the person who watches blind spots and shouts early).
  It is not cringe, and the tagline "Every operator deserves a spotter" is strong.
- Conflicts found live:
  - **Caterpillar itself publishes "Cat® Spotters Guide"** (Cat Digital; iOS/Android; v2.0, Feb
    2025), a dealer app that identifies OEM machines with Cat engines. It is a different purpose,
    but some Cat judges will know the word from their own portfolio. Never write "Cat Spotter", and
    be ready to say "not related to the Spotters Guide".
  - **Spotter.ai** (New York, founded 2019) sells trucking fleet software, including **"Sentinel by
    Spotter.ai", a fleet-safety platform**. The class is adjacent (fleet safety software), so
    commercial trademark registration would be contested. "Spotter" is also descriptive of a safety
    role, which makes it a weak mark to register.
  - For a hackathon this is acceptable, and Cat would rebrand any acquired product anyway. Put one
    line in the appendix acknowledging it.
- **Datum** is abstract and sounds like "data". A low-literacy operator will not know the word, and
  it has no safety meaning. **Plumb** reads as "plumbing", and it collides with the "Plumb
  Construction Calculator" app and Apex Tool Group's Plumb hand tools (sold under that name since
  1888). Both are weaker than Spotter.

## Top 5 changes

1. **Build "Replay"**: generate the simulation from the operator's own event (map, trail, faulty
   machine, response time) and show repeat-event rate falling in a labelled synthetic cohort. This is
   the one unforgettable thing.
2. **Remove the overclaims**: tamper-evident, with the chain head anchored to Telegram; "informed by
   ISO 21815-3/-4, not a CWAS"; "aligned with Cat Level I categories, instructor sign-off, no Cat
   certification"; "no public evidence Cat closes the loop".
3. **Use the organisers' datasets verbatim**: their columns as a strict subset of our schema, their
   CSV loading live, and the ETA error measured against their `Estimated time`.
4. **Cut P0 to a buildable core**: 2 full languages plus 1 script demo, 2 videos, Replay as the only
   P0 simulation, booking and Ask Spotter to P1, heat and cold as the only end-to-end conditions.
5. **Fix the call safety logic**: Twilio calls only when the operator is on foot or parked; in the
   cab, use the Critical alert with TTS. Stage the demo during the walk-around. Also create the
   missing `docs/research/12` (.env list) before G2.

## Live sources checked (2026-09-23)
- Cat® Spotters Guide, App Store (Caterpillar Inc., v2.0.0, 26 Feb 2025): https://apps.apple.com/us/app/cat-spotters-guide/id1598449155
- Cat® Spotters Guide, Google Play (package com.cat.catdigital.mobile.spottersguide): https://play.google.com/store/apps/details?id=com.cat.catdigital.mobile.spottersguide
- Spotter.ai and Sentinel fleet-safety platform: https://spotter.ai/ , https://sentinel.spotter.ai/ , https://highways.today/2026/09/04/spotter-ai-trucking-operations/
- VisionLink Productivity Operator Coaching: https://www.cat.com/en_GB/news/machine-press-releases/caterpillar-launches-three-new-features-for-visionlink-productivity.html , https://www.equipmentworld.com/technology/article/15679598/cat-adds-new-features-to-visionlink-productivity-platform
- Cat AI Assistant (Jetson Thor at the edge, in-cab "final stages of validation"): https://www.caterpillar.com/en/news/corporate-press-releases/h/cat-ai-assistant.html , https://www.mobilityengineeringtech.com/component/content/article/54478-ces-2026-caterpillar-launches-ai-assistant-for-jobsites-and-machines
- Plumb app and tools: https://play.google.com/store/apps/details?id=com.madewithbestpractice.plumb , https://en.wikipedia.org/wiki/Plumb_(tools)
- Not reachable (timeout or 403): the cat.com CONEXPO 2026 release; Pit & Quarry's CONEXPO demo article.
