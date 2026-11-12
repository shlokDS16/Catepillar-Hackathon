# F19 Ask Spotter review: lane/l2-f19-ask @ 04f6532 vs main

Reviewer: code-reviewer (read-only), 2026-11-12.

Checks run on 04f6532: web `tsc --noEmit` no errors; `eslint` clean; web vitest 420/420; shared vitest 144/144, shared tsc clean.

What passes: the shared change is additive only (new `fixtures/ask.ts` plus one export line), and every fixture parses with `AskResponse`. All 7 `refusal_reason` values map to the A17 copy through an exhaustive switch. The model never writes and severity is left null for the operator. Ask is hidden inside a replay (`/op/training/replay/*`) and in motion lock. The en/hi `ask.*` keys match (44/44). No object URLs are created, and a non-image is rejected by `createImageBitmap`. There is no `/start` route yet, so no first-launch gate is possible (follow-up for F09).

## Findings

1. **High.** The Hindi suggested questions all refuse (`packages/shared/src/fixtures/ask.ts:102-109`). The routing regexes are English-only. Run through `pickAskFixture`, all three hi suggestions return `refused no_evidence`, so the Hindi demo shows "no answer" on every suggestion. Fix: add Devanagari keywords (रिसाव, गर्मी, शुरू/जाँच), plus a test that loops over each locale's `ask.suggested`.
2. **Medium.** The prefilled A13 is unmounted by motion lock (`components/chrome/ask-chip.tsx:33`). The early `return null` drops the draft. A send already in flight finishes unseen, which invites a duplicate report. Fix: hide only the chip and the Ask sheet when locked, and keep the IncidentSheet mounted.
3. **Medium.** Closing the A13 opened from Ask leaves focus on `<body>` (`ask-chip.tsx:62`). The sheet is unmounted instead of closed, so `Sheet` never returns focus to the opener. Fix: keep it mounted with `open={incidentOpen}`.
4. **Medium.** The A13 opened from Ask stays on "Recording…" (`ask-chip.tsx:62`). `ledgerSeq={null}` means "Recorded #N" never appears. Fix: read `ledgerSeqByCause[incident.eventId]` as the Safety screen does.
5. **Medium.** Two primary buttons show when an answer has `proposed_action` (`ask-sheet.tsx:275` and `:135`). This breaks "at most one per view" (`ui/button.tsx:42`), and screens.md puts Review and log at L4. Fix: make Review a secondary button.
6. **Medium (honesty, unverified).** The fixture rule is presented as a verbatim quote from "OSHA 3120, page 4" (`fixtures/ask.ts:18`). The text is probably not in that publication. The quote was inherited from main's `askResponse`. Fix: verify the quote, or retitle it as a site document.
7. **Low.** A second A13 instance duplicates the Safety `submit` (`ask-chip.tsx:39`). It also renders a second `id="incident-note"` on /op/safety, which axe flags as a duplicate id.
8. **Low.** The steps are not capped at 3 for operators (`ask-sheet.tsx:217`; screens.md S6 L2). Fix: `slice(0, 3)`.
9. **Low.** The compressed photo is computed and then thrown away (`ask-sheet.tsx:64`), and there is no size cap before decoding (`ask/ask.ts:82`). Fix: keep the Blob for the upload, and reject files over about 15 MB.
10. **Low.** `/override/` routes "Can I override the PPE check?" to `policy_violation`, although a PPE override is a real app action (`fixtures/ask.ts:105`).
11. **Low.** An unknown `incident_type` is preselected as "manual" (`ask/ask.ts:60`). Fix: leave the kind null so the operator chooses.
12. **Low.** The tests do not check that SIM appears on refusal or degraded fixtures, do not render injection or policy copy, and do not test the AskChip A18 wiring.
13. **Low.** The degraded fixture has `provider_served: "groq_b"` but `fallback_used: "gemini"`, which contradict each other (`fixtures/ask.ts:82`).

## Verdict

CHANGES REQUIRED. Fix 1-5 and decide on 6.

## Re-review: 04f6532..2af4fce (c0ee50d, 2af4fce)

Checks run on 2af4fce: web `tsc --noEmit` no errors; `eslint` clean; web vitest 425/425; shared vitest 144/144, shared tsc exit 0.

| # | Status | Evidence |
|---|---|---|
| 1 High | Resolved | `ASK_SUGGESTIONS` routes the en/hi suggestions by exact text first, and Devanagari keywords route typed questions (`fixtures/ask.ts:100-118`). `ask.test.ts` covers the en and hi suggestion lists, checks that the message files agree with the table, and tests 3 typed Hindi questions. |
| 2 Medium | Resolved | Lock and replay now hide only the chip and the Ask sheet. The IncidentSheet stays mounted (`ask-chip.tsx:53-83`), so a draft or a send in flight survives the lock. |
| 3 Medium | Resolved | The sheet is now closed instead of unmounted, so `Sheet` returns focus to the chip. |
| 4 Medium | Resolved | `ledgerSeq` is read from `ledgerSeqByCause[eventId]`. |
| 5 Medium | Resolved | Review and log is secondary; Ask is the only primary button. |
| 6 Medium | Resolved | The citations are retitled "(demo)", and the OSHA attribution is gone from the F19 fixtures. main's older `askResponse` fixture still cites OSHA 3120, but it is not rendered by S6. |

The Lows are also fixed: steps are capped at 3, the photo Blob is kept with a 15 MB cap, an unknown type leaves the kind null, `/override/` is no longer a policy refusal, the degraded fixture is consistent, `idPrefix` removes the duplicate ids, and the SIM caption plus the injection and policy copy are tested.

New-problem check: the radio `name`s are shared by the two A13 instances, but each sits in its own `<form>`, so the groups do not clash. The Safety screen is unchanged: `idPrefix` defaults to "incident".

Still open (Low, none blocking):
- R1. The `requestAnimationFrame` focus call in `closeIncident` (`ask-chip.tsx:42`) is now redundant, because `Sheet` restores focus itself. Remove it so the code is easier to explain.
- R2. The `pickAskFixture` JSDoc now sits above `ASK_SUGGESTIONS` (`fixtures/ask.ts:94-100`). Move it back to the function.
- R3. There is no test of the AskChip A18 wiring (no DOM test environment). Cover it in the F21 browser QA.

Verdict: APPROVE.
