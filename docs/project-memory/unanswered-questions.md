# Unanswered Questions

Open questions that should become future work items. Append only.
Move to the timeline with an answer when resolved. Do not delete.

Format: **[date]** - the question, why it matters, what would answer it.

**[2026-09-23]** - Exact event: name, portal (CDC / Unstop / HackerEarth / Beamery), dates, round structure, team size. Drives the whole timeline. Answer: Shlok's registration email.
**[2026-09-23]** - Judging criteria and deliverables per round (PPT template? prototype? live demo? interview?). Answer: official brief.
**[2026-09-23]** - Is the build round time-boxed (e.g. 24 h on site) or multi-day remote? Decides how much we pre-build (boilerplate, design system, deploy pipeline) before the statement drops.
**[2026-09-23]** - Are problem statements department-gated (the 2025 edition was)? Decides which statements we may pick.
**[2026-09-23]** - Solo or team; if team, members' skills and who presents. Decides task split and pitch roles.
**[2026-09-23]** - Is the "first review" (≈24 h) a demo, a code review, or a pitch? Decides whether we polish the demo path or breadth.
**[2026-09-23]** - Does Shlok have an Expo account, and which Apple ID/team is used for TestFlight? Needed before the first EAS build.

**[2026-09-23, session 2 triage]** - Resolved and logged in the timeline: team, department gating, time box, first-review format (partly). Still open: event portal and exact dates; the judging rubric per round (review 1 = deck + demo, rubric unknown); Expo account + Apple ID for TestFlight (after review 1 per D4).

**[2026-09-23]** - Date and time of the final demo / next review. Matters now: Supabase realtime partitions were created only through 26 Sep (Track B B4), and Twilio trial credit must last until then. Answer: Shlok / organiser schedule.

**[2026-11-12, F10]** - Contract asks (additive): `ppe.override_granted` should carry `valid_until` and the granting supervisor name; the Task screen now derives expiry as event sim time + 15 min and says "your supervisor". Also open: the task snapshot carries no ETA model version, so the Detailed Task view has no model-version row (screens.md L4).

## 2026-11-12 (lead session 3) — Supabase public sign-up is enabled (for Shlok)
- Read-only check by the live-path lane: hosted auth has disable_signup=false (email confirmation required, anonymous
  sign-in off). A stranger can create an account, but it gets no profile, so RLS gives it no data. The lead left it
  unchanged (auth settings are Shlok's call). Option: turn sign-up off in the Supabase dashboard (Authentication >
  Sign In / Providers), since the demo users are created by scripts/seed-demo-users.ts with the service key.

## 2026-11-12 (lead session 4) — Production deploys stopped for main (for Shlok, blocking the demo URL)
- https://spotter-five-brown.vercel.app serves 5bb9474. No Vercel deployment of any state exists for main pushes
  6668dd1, 17aac73, 0389806, d02084e, a720218, 4205ddd, eecea75, f47f124 (or later); lane branch previews keep building
  READY. Project prj_ljiSOnCM7DZOnSmphRmRleDKpjfQ was updated 20 s after the 6668dd1 push, so a setting may have
  changed then. Agents may not trigger production deploys (auto-mode refused it). Action: Vercel > spotter >
  Deployments > Redeploy or Create Deployment from main; check Settings > Git (production branch = main, Ignored
  Build Step empty). Until then the newest preview (behind Vercel SSO) is spotter-q2zs93bg5-shlok-goenkas-projects.vercel.app.
- RESOLVED 2026-11-12 (session 4): the next main push (e23dcfa) deployed to production READY, and later merges
  deployed too. Cause unknown; if it recurs, Shlok redeploys main from the Vercel dashboard.
