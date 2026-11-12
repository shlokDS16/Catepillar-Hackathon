# Final judge review: simulated Caterpillar Digital panel

Date: 2026-11-12. Build: https://spotter-five-brown.vercel.app (fixture mode, header "FIXTURE 09:40 x10").
Method: one walk at 1440 x 900 in a fresh browser context, then a 375 x 812 layout and overflow pass over 12 routes. To reach the Replay, the hidden `/director` page played Beats 2 and 4 (local BroadcastChannel only). Calls, SMS and Telegram requests were blocked at the network layer. SOS, Beat 3 and `/api/sos-demo` were never touched.
Ask Spotter ("Coming in a later task", F19) is in flight and is not scored.
Screenshots are in `.claude/worktrees/hungry-mclean-7c0f94/.playwright-mcp/J01-*.png` to `J17-*.png`.

## Scores

| Judge | Score |
|---|---|
| Engineering manager, Cat Digital | 7 / 10 |
| Product owner, operator and dealer solutions | 7 / 10 |
| Data-science lead | 6 / 10 |
| Hiring manager | 7 / 10 |
| **Average** | **6.75 / 10** |

**Engineering manager (7).** The core flows work end to end on the live URL with no console errors:
- the Replay (Brief, then a 60 s Investigate, then a timed three-step Decide, then a Debrief with a re-enactment, you-vs-safest and per-decision review);
- the four-card lesson with its quiz;
- the hash-chained ledger;
- the inbox, sorted by tier and then age.

At 375 px no route scrolls sideways, and the tables scroll inside their own containers. Hindi switches live. Three things cost points. First, the fixture state lives only in memory: a full reload wipes every beat, so `/op/training` goes back to "Nothing assigned". Second, after Beat 2 the Warning takeover blocks the rail and the director has no beat to clear it, so the operator UI is stuck until a reload, which loses the state. Third, a wrong-content bug in the Replay: the evidence card titled "Seatbelt on slopes" opens the "Hydraulic fault nearby" protocol. A judge who opens that card in front of the panel will catch it.

**Product owner (7).** The pain is real and specific:
- seatbelt off on a 17 degree slope at 6 km/h;
- WBGT heat;
- a faulty machine 64 m from a person on foot;
- near-misses reported non-punitively;
- a motion lock while the machine moves ("Stop the machine to use Spotter").

All of this fits the gap next to VisionLink and Cat Detect. Hindi and Tamil are first-class. The adoption story breaks on a cold visit, though. Someone who opens Practice sees "Nothing assigned. Well done.", so the thesis (Replay of *your* event) can't be reached without the hidden director page. The screens also contradict each other:
- Safety lists "Vest: not on", and the FM inbox raises "PPE missing";
- yet the operator header says CLEAR and Home says READY, and Safety says "Nothing needs you right now".

The map is a city street grid (a roundabout and roads) with the label "Bench 3". No screen in the product shows how Spotter connects to VisionLink or Cat Detect; only the deck does.

**Data-science lead (6).** The labelling discipline is good. Pages say "Simulated demo data, n = 152", "synthetic cohort", "No interval yet, so this is not a significance claim", P50 against the organiser estimate per task type, and P90 coverage of 89 %. But the numbers don't reconcile on one page:
- the banner says MAE 4.1 vs 6.9 (Hot, groups of 10 or more, n = 128);
- the evidence card says 4.7 vs 8.6, with P90 coverage on n = 190;
- the table gives per-type values.

None of them names its population. Precision and recall (idle 91/84, overheat 88/79) come with no threshold, no baseline (for example a fixed rule) and no row for hydraulic drift, which is the anomaly the demo uses. The repeat-rate bars (12 % assigned against 27 % control) look like a result even with the "how we would measure impact" caption. The ETA explanation counts heat twice: Heat +17 % and Weather +11 % sit side by side. Home's "Why" shows weather and novice but leaves out the largest factor. Excavation and Trenching both show 77 min (up to 92), which reads as a constant, not a model.

**Hiring manager (7).** I'd hire on the evidence of ownership and an honesty culture. I see "simulated" tags on almost every screen, "Tamper-evident, not tamper-proof", "Photos are not available in this demo yet", and a student-project disclaimer. The scope is large and coherent. The risk comes under questioning: about five cross-screen contradictions (listed below) would each force a "that's fixture data" answer, and three of those in a row erode the credibility the labels built.

## The 5 hardest questions this panel would ask

1. "The inbox says CRITICAL, Ledger changed, Telegram sent. The ledger page says 213 verified, chain checked. Which one is true?"
2. "Your ETA adds Heat +17 % and Weather +11 %. Isn't that the same signal counted twice? And why do Excavation and Trenching have the same 77 min estimate?"
3. "Your three MAE figures disagree (4.1, 4.7 and per type). Which population is each one, and what is the baseline for 91 % precision?"
4. "Where do 12 % and 27 % repeat rates come from if no cohort exists yet?"
5. "If I reload the operator page mid-shift, where did the Replay go?"

## Weakest moment

In the Replay, the operator opens the "Seatbelt on slopes" card and reads "Hydraulic fault nearby: stay clear, move upwind, radio your supervisor". This happens during the product's flagship flow, on the exact event the pitch is built around.

## One change that raises the total most

Make the baseline fixture state consistent and self-starting:
- seed the 09:40 seatbelt Replay as assigned;
- keep the vest on;
- show no "Ledger changed" alert until Beat 5;
- persist the state in sessionStorage.

All four judges stop finding contradictions on a cold walk, and the thesis is one click from Practice.

## Ten most valuable fixes before the final demo (ranked)

### A. Honesty and credibility risks

| # | Route | What a judge sees | Why it costs points | Smallest concrete fix | Size |
|---|---|---|---|---|---|
| 1 | `/op/training/replay/[id]`, Investigate | The card "Seatbelt on slopes" opens the "Hydraulic fault nearby" protocol (stay clear, move upwind, radio supervisor). | Wrong content inside the flagship flow; reads as "the AI picks random cards". | Render the protocol by the evidence card's `card_id` (`seatbelt_slopes`, from `packages/shared/src/fixtures/index.ts:136`), not the single `hydraulic_fault` fixture card. | S |
| 2 | `/fm` vs `/fm/ledger` | On a fresh load the inbox's top item is CRITICAL "Ledger changed ... Telegram: sent", while the ledger page says "213 verified, 1 sealed, chain checked". | A direct contradiction on the security story; the "Telegram: sent" claim has no simulated tag. | Remove the ledger-changed alert from the baseline fixture and emit it only in Beat 5; tag "Telegram: sent (simulated)". | S |
| 3 | `/op/training` (cold visit) | "Nothing assigned. Well done."; only the lesson is open. Replay needs the hidden `/director` page (Beat 4). | The thesis can't be reached by a judge clicking around alone. | Seed the 09:40 replay assignment in the baseline fixture, or add a "Replay of 09:40, seatbelt on slope" card under "Open any time". | S |
| 4 | `/op`, `/op/safety`, `/fm` | Safety lists "Vest: not on" and the FM inbox has "PPE missing", but the header says CLEAR, Home says READY, and Safety says "Nothing needs you right now". The map also shows "You, EXC-007: Moving" while Home is idle. | Inconsistent state undermines the safety claims. | Make the baseline vest "on" (Beat 1 already restores it), or show the PPE caution and block Start as spec beat 1 says; derive the "Moving" label from the same motion state. | S |
| 5 | `/op` (any reload), `/director` | A full reload wipes all beats. After Beat 2 the Warning takeover blocks the rail permanently, and no beat clears it. | A demo-day reload or a judge's refresh breaks the run; the panel sees a stuck orange screen. | Persist FixtureAdapter state to sessionStorage; add a Director beat "seatbelt fastened, machine stopped" that clears the takeover. | M |
| 6 | `/fm/analytics` | The page shows MAE 4.1 vs 6.9 (banner), 4.7 vs 8.6 (evidence card), and per-type values; n = 152 vs n = 190. The impact bars read 12 % vs 27 %. | The data-science lead finds unreconciled numbers in 30 s; the impact bars read as a result. | Add one population line under each figure (filter, n, period). Draw the impact panel as empty axes or tag the numbers "illustrative, not measured". | S |
| 7 | `/fm/analytics` Evidence | Precision and recall for idle and overheat only, with no threshold and no baseline; the demo's hydraulic drift (EWMA) is missing. | "Is the AI real and measured?" is answered only halfway. | Add a hydraulic_temp_drift row, a fixed-threshold baseline column, and the alarm threshold used. | M |
| 8 | `/op/task`, `/op` | The Task page shows Heat +17 % and Weather +11 % (a likely double count). Home's "Why" omits Heat. Both tasks show 77 min, up to 92. The WBGT card has a bare "ETA 11 %" line. | The ETA model looks hand-tuned or constant. | Merge heat into weather, or caption the difference. Show the top two factors by size on Home. Give each task type its own base duration. Rewrite "ETA 11 %" as "adds 11 % to ETA". | S |
| 9 | `/fm/ledger` | Operator "22222220", machine "33333330", dated 2026-09-23 with cycling types at 1-minute steps, and no simulated tag. | Visibly generated test data in the record the pitch calls human-verifiable. | Map the IDs to display names (Ravi, EXC-007); add the "simulated" tag; vary types and times in the seed. | S |

### B. Polish

| # | Route | What a judge sees | Why it costs points | Smallest concrete fix | Size |
|---|---|---|---|---|---|
| 10 | All app screens, `/op/map` | The header jargon "FIXTURE 09:40 x10". The map is a city street grid with a roundabout labelled as Bench 3. | Developer jargon, and a "mine" that is plainly a town. | Rename the chip to "Simulated shift, 09:40, 10x speed". Move the fixture coordinates onto an open-cast pit, or use a plain site plan. | S (chip), M (map) |

Other polish, lower value:
- Warning takeover at 1440: home content and a hazard stripe leak into the strip under the rail (x < 120).
- Debrief re-enactment: the "BENCH 3" label overlaps the flag.
- Debrief: "You responded after 8 s" doesn't say whether it means the recorded event or this attempt.
- Lesson: the Next/Back buttons sit below the fold at 900 px height.
- Hindi uses "नकली डेटा" ("fake data"); prefer "सिम्युलेटेड डेटा". "Open-Meteo archive ... (scenario forecast)" stays in English.
- The Practice card and the Lesson card share the same title. Name the first one "Replay".
- Landing: "Replay hand-off: the next operator learns from this shift" contradicts the thesis, where the Replay rehearses the operator's own event.
