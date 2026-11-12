# Landing v3, implementer B report (page, engine, copy)

Branch `lane/l2-landing-v3-b`, A (`origin/lane/l2-landing-v3-a`, e29e014) merged in. Audits run on a production build with A merged.

## Audit results (spec §12.1, §12.2)

| Run | Frames | Dead / thin / flat |
|---|---|---|
| 1440 x 900, step 450, tape counted as chrome | 30 | 0 |
| 375 x 812, step 406, tape counted as chrome | 25 | 0 |
| 1440, `CHROME` plus `.l-tape` (tape excluded) | 30 | 0 |
| 375, `CHROME` plus `.l-tape` (tape excluded) | 25 | 0 |

Reports and contact sheets: `docs/design/qa/landing-v3/B-1440/` and `B-375/` (frames deleted). The tape-excluded runs were not saved (same counts).
Lowest word counts at 375: frames 20-21 (14 and 12 words, the phone proof blocks), still above the 10 threshold.

## Checks

typecheck, lint, `pnpm --filter web test` (556 tests, 53 files, including the new `shift-tape.test.ts` with 11 tests and 1 added `ledger-demo` test) and `pnpm --filter web build` are green on the merged branch.

## §12 checklist

1. Audit 0/0 at both sizes: done (above).
2. Tape excluded 0/0: done.
3. Reduced motion and no JS: reduced motion emulated, screenshots `docs/design/qa/landing-v3/reduced-1440.png` and `reduced-375.png` (stack of stills, each with copy, readout and a static tape strip; S6 end state; S7 stack). No-JS uses the same rules through the `<noscript>` block (not screenshotted separately).
4. Sync check, run in `next dev`: `?still=4:0.45&ui=1` gives state Warning, nearest 12.0 m, tape 10:44, tick 4 stamped, "10:44 · LEDGER ENTRY 4". `?still=5:0.3&ui=1` gives clock 10:51 with Replay mode. See deviation 1 for the `&ui=1`.
5. Keyboard: tab walk confirmed the §10 order (skip link, language, hero actions, six tape ticks, three role links, footer links), a 3 px outline on each stop, no focus inside hidden stage blocks (they are `visibility:hidden`). **axe was not run**: there is no axe dependency and none was allowed.
6. Contrast: all pairs are the §4 tokens. hi at 375 was only checked through the audit (no clipped text seen in the contact sheet); no separate hi pass.
7. Build green, three.js stays a dynamic import (unchanged). LCP element not measured separately.
8. No calls, SMS, Telegram or SOS; the captures were made by navigation and screenshot only.

## Deviations and decisions

1. **`?still=` posters vs the sync check.** Posters must be clean scenes, so `?still=s:p` still hides all page UI. The §12.4 sync check needs the tape and readouts, so it uses `?still=s:p&ui=1` (non-production only).
2. **Tape rounds to whole minutes.** The frozen `shiftClock` gives 643.5 at S4 p .45; `tapeState` rounds, so that frame reads 10:44 with entry 4 stamped (a unit test covers it).
3. **Tape position in the DOM.** It is `position:fixed` and sits after the scene in DOM order so the tab order matches §10.
4. **Proof captures** were recaptured from the local production build after the brand fix (`capture-proof.sh`). They are cropped (rail removed; on /op the yellow status band is removed too) so no large caution-yellow surface is in frame. Sizes: desktop 1320 x 825, phone 390 x 520, all at most 90 KB. Hi screens: not captured; `LOCALIZED_CAPTURES` in `proof.tsx` is empty, so hi reuses the en captures (Q3 rule: the app screens were not checked for English fallbacks). The script supports a locale argument.
5. **Footer legend** says "Bench contours, every 1.6 m (3.2 m on steep faces)" in en and hi, per the lead.
6. **Added keys** (en and hi): `ro.trail`, `ro.pending`, `s6.sevLabel`, `s7.*.alt` rewritten for the new crops (no figures that the fixtures could change). The auditor row says it opens the ledger check in the fleet view (Q2). Dead keys removed: `scrollHint`, `s1b`, `rail.*`.
7. **Phone S6 and S7** show their end state (no per-row IntersectionObserver stamping): rows are simply static.
8. **Settled values** (reduced motion, no scene): boom 34, stick 61, bucket 22 degrees, labelled SIM; they are replaced by `getReadout()` when the scene provides it.
9. I did not edit `shift.ts` (A's copy is used) or `scene/**`.

## Open

- Hindi copy still needs Shlok's read (Q4).
- axe and a no-JS screenshot were not run.
