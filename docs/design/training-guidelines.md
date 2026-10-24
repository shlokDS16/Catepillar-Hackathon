# Training guidelines: how a Spotter practice is authored and judged

- Status: v1 (ui-ux-lead, 2026-10-13), written alongside the "How practice works" guide on
  `/op/training`. It describes the practice we actually built and scored, not an aspiration.
- Governs: Replay content (`replay_templates` → `replay_scenarios`), micro-lesson content
  (`lessons.content`) and the operator-facing copy of both.
- Grounded in: `packages/shared/src/contracts/replay.ts`, `contracts/lesson.ts`,
  `contracts/events.ts` (`ReplayScores`), `contracts/rpc.ts` (`ReplaySubmitIn`),
  `docs/architecture/data-model.md` §2.8 (the scoring formula and the template columns),
  `docs/architecture/api-contracts.md` §5, `docs/design/screens.md` S5a/S5b,
  `docs/design/visual-language.md` §5.1, `docs/specs/idea.md` §3 (honesty rules), decision D10.
- Where this document and `visual-language.md` disagree, `visual-language.md` wins.

## 0. What a practice is, in one paragraph

A Replay is the operator's **own recorded safety event**, rebuilt as a four-phase simulation:
**Brief → Investigate → Decide → Debrief**. `private.build_replay(event_id)` fills an authored
template (`replay_templates`, one row per `event_type`) with the real numbers of that event and the
frames around it, and stores the result as a `ReplayScenario`. The operator is scored on **which
evidence they opened, in what order, and what they decided** — not on how fast they read. The
answer key never leaves the server before `replay_submit`.

A practice is therefore two things at once: a **teaching object** (it must leave one rule in the
operator's head) and a **measurement** (three numbers out of 100). Author both deliberately. If a
step teaches nothing, cut it. If a step cannot be scored fairly, do not score it.

## 1. Who the practice is for

Heavy-equipment operators: novice to skilled, outdoors, in sunlight, in gloves, on patchy network,
reading Hindi or English, with varied literacy and often no habit of reading screens. Everything
below follows from that. A practice that needs a paragraph of reading is a failed practice.

## 2. The Brief: what the operator must know before deciding

The Brief exists to remove every excuse except judgement. It is **untimed** (D11 decision 2: the
"10 s" in the spec is the target length of the *content*, not a clock), and its one audio line is
read aloud once per attempt.

Contract (`ReplayScenario.brief`): `title`, `situation`, `goal`, `time_budget_s`, `audio_id`.

A good Brief:

- **`title` is the event in one line**, with the three facts that locate it: what, which machine,
  when. "Seatbelt off on a 17° slope · EXC-007 · 10:42". No adjectives.
- **`situation` is two sentences at most** and says only what the operator could have known at the
  time. It must not contain the answer, the rule, or a judgement ("you should have…").
- **`goal` is the same sentence in every scenario**: find what matters, then decide what to do.
  Operators should stop reading it after the second practice; that is the point.
- **`time_budget_s` is honest**: it is the Investigate budget and nothing else, and the UI says so
  in words ("You have 90 s to look at the evidence"). It is not a scoring axis on its own.
- **Every number in the Brief comes from the event**, never from the template. If a number cannot
  be filled from the event record, the sentence is rewritten so it is not needed.
- **It is labelled simulated.** The frame carries "Practice rebuilt from your recorded event ·
  simulated" on every phase, and the Brief does not contradict it.

Anti-patterns: a Brief that names the hazard ("the slope is unsafe") — that is the operator's job;
a Brief that lists the evidence cards; a Brief longer than the audio clip; dramatic language.

## 3. Investigate: what belongs on a card, and what makes one relevant

Contract: `ReplayScenario.investigate.cards` — **3 to 7** `EvidenceCard`s and an optional
`max_open`. Card types are fixed by the union: `telemetry_trend`, `wind`, `map_snapshot`,
`fault_code`, `protocol_card`, `weather`, `shift_hours`. Each card's `relevant` flag and its `why`
text live in the template (`evidence_spec`) and **stay server-side** until the debrief.

### 3.1 The set

- **Build the set from the event, not from the card types.** Ask "what would a good operator have
  checked before acting here?", then find the card type that carries it. Never add a card because
  a type exists and is unused.
- **At least one relevant card must be decisive** — the one a reviewer would call "the reason".
  For the seatbelt-on-a-slope P0 scenario that is the `telemetry_trend` showing pitch and the
  seatbelt state together.
- **At least one card is a distractor**, or the order score measures nothing. A distractor is a
  card that is *true and irrelevant*, not a card that is wrong. `fault_code` is the natural home
  for one: a real active code that has nothing to do with this hazard.
- **Three cards is the floor and seven the ceiling.** Below three there is no choice to score;
  above seven a gloved operator cannot scan them inside the budget.
- **Set `max_open` when the lesson is about restraint.** The server scores only the first
  `max_open` ids (UI-20), and the UI must say "3 of 4 opened" while they choose. Leave it null
  when the lesson is about thoroughness.

### 3.2 Relevant vs distractor

A card is **relevant** when the decision in Decide changes if the operator has not seen it.
That is the whole test, and it is checkable: for each card, read the Decide steps and ask whether
a reasonable operator could still pick the best choice without it. If yes, it is a distractor.

A card is a **fair distractor** when all of these hold:

1. it is factually true of that moment (it comes from the same frames as the rest);
2. it is plausible to check — it is the kind of thing an anxious operator *would* open;
3. it is not a near-duplicate of a relevant card (two trends of the same metric is a trick, not a
   distractor);
4. its `why` text can explain the distinction in one plain sentence, because that sentence is what
   the operator reads in the debrief.

Every card, relevant or not, needs a `why` written for the debrief. "Not relevant" is not a `why`.

### 3.3 Rendering rules that constrain authoring

All cards are ink on paper. **Hazards inside a replay are drawn as outlines; filled safety colour
always means a live state** (visual-language §1.1). So do not author a card whose meaning depends
on something being red. A card must read in one glance: a trend is a line, wind is an arrow and
two numbers, shift hours is a figure and a word.

## 4. How the order is scored, and why

`replay_submit` receives `p_open_order`: the evidence card ids **in the order the operator opened
them**. The procedure score combines (data-model §2.8):

- the share of **relevant cards opened**, minus the irrelevant ones opened; and
- the **order agreement with `ideal_open_order`**, the template's authored ideal sequence.

Order is scored because in the cab, order *is* the skill. A seatbelt breach on a slope is resolved
by checking the slope and the restraint before the fault codes and the weather; an operator who
eventually opens the right card after four wrong ones did not read the situation, they exhausted
it. Scoring only the set would give both operators the same number, and the debrief's central
artifact — "your process next to the ideal process" — would have nothing to show.

Authoring rules for `ideal_open_order`:

- **It must be defensible out loud**, in one sentence per position: "slope first because it decides
  whether the machine should move at all". If a position cannot be justified, the two cards are
  interchangeable and the ideal order is arbitrary — reorder the set so it is not.
- **Only relevant cards appear in it.** An ideal order that includes a distractor is a bug.
- **Keep it short.** Three or four positions. A seven-deep ideal order punishes noise, not
  judgement.
- **Ties are a smell.** If two cards are genuinely order-independent, prefer merging them into one
  card over asking the scorer to pick.

## 5. Decide: how a step is written, and what a timeout means

Contract: `ReplayScenario.decide.steps` — **3 to 4** `DecideStep`s, each with `step`, `prompt`,
`audio_id`, `time_limit_s`, `kind` (`single` or `order`) and **2 to 5** `choices`
(id, `label`, `pictogram`). The template additionally holds, server-side, `correct_choice`,
`weight` and `score_axis` ∈ safety / procedure / efficiency.

- **One decision per step, phrased as an action.** "What do you do first?" not "What is the risk?".
  The operator is practising acting, not naming.
- **Every choice is a thing a real operator does.** No joke options, no obviously illegal option.
  A choice set where one option is visibly absurd tests reading, not judgement.
- **Two to five choices, each with a pictogram and a word.** Colour never distinguishes choices
  (visual-language §0 rule 2), and the plates are ≥ 80 px.
- **`kind: "order"`** is for protocol sequences only, scored against `correct_protocol_order` with
  a Kendall-style share of correctly ordered pairs. Use it where the protocol genuinely has an
  order; do not use it to make a `single` step harder.
- **`time_limit_s` is per step**, and it is the only clock in Decide. Set it from how long the
  decision takes in the cab, with reading time added for an operator who is slow to read — not
  from how long it takes you.
- **`score_axis` must match the step.** A step about restraint and slope is safety. A step about
  the order of a shutdown is procedure. Efficiency is not an axis you author into a step: it is
  computed from whether steps were answered inside their countdowns.

**A timeout is a miss, and the operator is told so before it can happen.** When a step's countdown
expires, the UI omits that step from `p_choices`; the server counts it as **wrong on its axis and
not within its countdown** (UI-18). That is harsh, so it must never be a surprise: the guide's
Decide step says "a step with no answer counts as missed" before the operator's first practice, and
the countdown bar is visible for the whole step. A step whose time limit is tight enough that a
competent operator times out is a badly authored step, not a strict one.

**The clock stops for safety.** A live Warning or Critical alert pauses every replay timer and
takes over the screen (visual-language §5.1), and the run resumes exactly where it stopped. Author
time limits on the assumption that the clock only runs while the operator is actually practising.

## 6. Debrief: what it must always contain

Contract: `ReplayDebriefResult` — `scores`, `process_trace` (`opened`, `ideal`, `relevant[]` with
each card's `why`), `review[]` (per step: `chosen`, `best`, `why`), `rule` (`card_id`, `text`,
`audio_id`) and `lesson_code`. Order on screen (screens.md S5b): what happened → how you did → how
you investigated → your decisions → the one rule → next.

Four things are **mandatory**, and a practice that cannot produce all four is not shippable:

1. **The score.** Three figures out of 100 — safety, procedure, efficiency — with ink bars, counted
   up over at most 1.2 s. `training.replay_completed` must carry the identical `ReplayScores`
   object (UI-19); a score that differs between the screen and the event stream is a defect.
2. **The trace against the ideal.** Two chip rows, "You" over "Ideal". An irrelevant card that was
   opened gets an outlined ✕; a relevant card that was missed gets a dashed "missed" chip. Tapping
   a chip shows that card's `why`. This is the part the operator remembers; it is never optional,
   never collapsed by default, and never replaced by a single number.
3. **The rule, quoted.** `rule.text` is **quoted from the fixed `protocol_card`**
   (`replay_templates.protocol_card_id`) and is never generated. It sits in a 3 px ink plate above
   the actions, so it is the last thing read, and it has a [Listen] button.
4. **The re-enactment.** The operator's own event played back on the site plan: the trail drawing
   itself, the machine moving with its heading, the wind arrow, the readouts, and the ⏱ marker for
   `real_response_ms`. It autoplays once, never loops, is user-controlled (play / pause / scrub),
   and is captioned "Re-enactment from your recorded data · simulated". Under reduced motion it
   does not autoplay; scrubbing still works, because the user drives it.

Plus, per decision step, "You: …" / "Safer: …" / `why` from `review[]`. A `why` that just restates
the choice is not a `why`; it must name the consequence.

## 7. Honesty rules for generated content (idea.md §3)

A practice is built from real organiser data, assumed sensor fields and synthetic frames mixed
together. The operator must always be able to tell which is which.

- **Every screen in a practice is labelled `simulated`.** The replay frame carries it on all four
  phases. The re-enactment repeats it in its caption.
- **Assumed sensor values carry the "assumed" tag** wherever they are shown (`FIELD_PROVENANCE` in
  `contracts/assumed.ts` is the authority — `pitch_deg`, `speed_kmh`, `hydraulic_temp_c` and the
  rest are assumed; `seatbelt_fastened` and `load_cycles` are organiser data).
- **Weather is a forecast, phrased as one.** "Peak 44 °C forecast by 14:00", never "it is 44 °C".
- **The rule is quoted, not written by a model.** Only `protocol_cards` rows are quoted as rules.
  If a scenario has no protocol card, it has no rule, and it is not ready to ship.
- **No invented consequence.** The debrief may say what the protocol says; it may not say "this
  would have caused an injury".
- **Nothing is called certified.** "Informed by ISO 21815-3/-4; not a certified collision-warning
  system." "Aligned with Cat Operator Level I categories; instructor sign-off required."
- **Scores are not evidence about a person.** Training records are non-punitive: the fleet manager
  sees only aggregates through `evidence_metrics`, never an operator's attempt (data-model §2.8
  RLS). The operator-facing copy says so in plain words, and the guide says it before the first
  practice. Any future screen that shows one operator's practice score to a manager breaks this
  rule and needs a decision in `decisions.md`, not a pull request.

## 8. Language: en/hi parity and plain words

- **`I18nText` is `{ en, hi?, ta? }`.** `en` is required; a practice ships with `hi` filled. Tamil
  falls back to English by design (`COMPLETE_LOCALES` in `src/i18n/locales.ts`) and the UI says so.
- **Every user-visible string is a message or an `I18nText` field.** No string is assembled in
  code from fragments: a sentence with a number in it is one ICU message with a placeholder. This
  is a hard rule — concatenation produces ungrammatical Hindi and strays like a dangling "·".
- **Write the Hindi first when you can.** Copy translated from compact English tends to be 30-40 %
  longer in Devanagari and to break the layout; the Decide choice labels and the button words are
  where this bites. Budget for it: a label that only just fits in English will not fit in Hindi.
- **Plain words, short sentences.** One clause per sentence in operator copy. Prefer the word an
  operator uses on site over the word a manual uses.
- **No idioms, no metaphors, no humour.** "Keep an eye on", "play it safe", "down the line" and
  "red flag" have no Hindi equivalent that survives a literal translation. Say the thing.
- **No English-only abbreviations** in operator copy (PPE is allowed because it appears on the
  vest; WBGT is always shown with its number and a plain gloss).
- **Numbers are formatted by `Intl`, with Latin digits** in all three locales, 24-hour times, and
  Indian grouping for rupees (visual-language §2.2). Never hand-format a number into a string.
- **Uppercase is for Latin chip and state words only.** Devanagari and Tamil have no case, and
  `:lang(hi), :lang(ta) { letter-spacing: 0 }` — tracking breaks the headstroke and the conjuncts.
- **Audio parity.** If a `prompt` or `situation` has an `audio_id`, the clip must exist in the
  locale the operator is reading, or the [Listen] control is not shown. A dead [Listen] over a 404
  is a lie about the product (caught once already at Showable 1).

## 9. Micro-lessons (the short form)

Contract: `LessonContent` — a `code`, `duration_s` ≤ 120, **3 to 5** `LessonCard`s
(`kind` ∈ rule / why / how / example / check) and **exactly 3** `QuizQuestion`s.

- The card kinds are a spine, in that order: the rule, why it exists, how to do it, one example,
  one check. Do not ship five cards of the same kind.
- **`correct_id` is sent to the client on purpose**: a lesson is practice, not assessment. Feedback
  is instant (a ✓/✕ reveal in 240 ms, in ink, never green or red).
- A lesson's `source_refs` must name real sources. An empty `source_refs` on a safety lesson is a
  blocker.
- A lesson is assigned by the loop from an event (`because_event_id`), so its rule must be the same
  rule the replay quoted. One event, one rule, two forms.

## 10. The author's checklist

A practice is ready when every line is true:

- [ ] Brief: one-line title with machine and time; ≤ 2 sentences of situation; no answer in it.
- [ ] Brief is untimed in the UI and the budget line names the Investigate budget only.
- [ ] 3-7 evidence cards; at least one decisive relevant card; at least one fair distractor.
- [ ] Every card has a `why` that reads as a sentence, distractors included.
- [ ] `ideal_open_order` contains only relevant cards and every position can be justified aloud.
- [ ] 3-4 Decide steps; one action per step; 2-5 real choices, each with a pictogram and a word.
- [ ] Every step has a `score_axis` that matches what it tests, and a `time_limit_s` a slow reader
      can meet.
- [ ] The debrief produces all four mandatory parts, and `rule.text` is quoted from a real
      `protocol_card`.
- [ ] `hi` is filled for every `I18nText`; no string is concatenated; nothing relies on an idiom.
- [ ] Every screen says `simulated`; assumed fields carry the "assumed" tag.
- [ ] Nothing in the copy implies the score can be used against the operator.
- [ ] Walked at 375 px in both languages, with reduced motion on, with the SOS plate in place.
