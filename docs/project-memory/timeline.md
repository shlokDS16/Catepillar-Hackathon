# Project Timeline

Append-only chronology for Caterpillar Hackathon. Never rewrite an entry. When new information
contradicts an old entry, add a new entry that references the old one.

Entry template:

```
## YYYY-MM-DD - [short title]

**What happened:**
**Why:**
**Discovered:**   (facts learned, including surprises)
**Assumed:**      (flagged as assumption, not fact)
**Implications:** (what this constrains or unlocks later)
**Links:**        ADR-00N, session file
```

---

## 2026-09-23 - Project initialized

**What happened:** Project Operating System scaffolded via project-kickoff.
**Why:** Establish persistent standards and living memory from day one.
**Implications:** Every future session loads CLAUDE.md and follows the standards
in `claude/`. End-of-session routine runs before any session finishes.

## 2026-09-23 — Session 1: kickoff
- Scaffolded Project OS; added STATE.md, CHECKLIST.md, RESUME.md and operating rules in CLAUDE.md.
- Dispatched research: hackathon intel, tool inventory, persistence/folder structure.
- Waiting on: problem statement, PPT template.

## 2026-09-23 — Session 1 (cont.): plan approved, pre-work started
- Shlok approved master plan; gh 2.101 + uv 0.12.18 installed (gh not logged in; vercel token invalid).
- Briefing theme: operator novice→skilled, e-learning library, operator assistant, safety, sector/environment factors, offline.
- Defined project agents in .claude/agents: ui-ux-lead, backend-lead, backend-reviewer, code-reviewer, founder-validator, phase-validator, judge-simulator.
- Research 05 (Cat operator ecosystem), 06 (AI training SOTA), 07 (offline/mobile feasibility) dispatched.
- Research 05-07 done; founder-validator (08) corrected Cat AI Assistant facts (live, on-device, voice). Draft thesis written.
- Starter workspace committed (web builds, Expo doctor 21/21). Pitch skeleton for review 1 written.

## 2026-09-23 — T0: problem statement received
- "Smart Operator Assistant for CAT Machinery". Saved statement (01), requirements matrix R1-R31 (02), teammate prompt (03), Shlok directives (04), UI framework.
- Added program-architect agent. GitHub remote origin set. Research 10-14 dispatched.
- Research 10-14 done (12 final compile pending). Spec v1 "Spotter" written (docs/specs/idea.md). Three G1 reviews running.
- Shlok: gh login not needed (git push via credential manager); Supabase region = Mumbai.
- Env check (read-only, no values logged): Supabase project ACTIVE in ap-south-1, keys + access token valid, postgis/vector/pg_cron/pg_net available (not yet enabled). Groq x2 valid (needs User-Agent header; 11 models incl. gpt-oss-120b/20b, qwen3.8-27b, whisper-large-v3, llama-prompt-guard-2, gpt-oss-safeguard-20b). Pinecone valid (existing indexes ledgrai-faq, demo; spotter-kb not yet created). Voyage, LlamaCloud valid. Twilio trial active, $5.90 balance, from-number owned; demo phones NOT verified. Telegram @Spotter125Bot valid, supervisor chat reachable. Sarvam x2 present (not called). Filled SUPABASE_PROJECT_REF, TELEGRAM_WEBHOOK_SECRET, DEMO_DRIVER_SECRET; phone spaces removed.

## 2026-09-23 — Session 1 end: planning complete, build launched
- G1 (spec v3 + D10 simulation-first training) and G2 (backend rev 3+, frontend plan v2, build protocol) passed after 5 red-team/validator rounds; all findings dispositioned in ADR-001.
- H0: worktrees track-b/track-f, shared dependency commit (vitest, tsx, postgres, supabase-js, next-intl, maplibre-gl, @supabase/ssr), env copies incl. regenerated webhook + director secrets.
- Next: three sessions (A integrator Opus; B and F on Fable 5.1). Showable 1 at ≈ H3-4.

## 2026-09-23 — Session 2 (integrator) start
- D4 approved; D12 integrator location. Nothing to merge yet: track-b and track-f still at 1473244, both logs empty.
- Track B session started in an app-made worktree (claude/spotter-backend-track-b-a0d0a3, no .env); redirected to ../spotter-track-b via handoff message. No Track F session running yet.
- Open questions triaged against docs/brief and decisions (session 2):
  - Team: two people, one laptop (G1 answer 6, D6). Resolved.
  - Department-gated statements: moot; one problem statement received ("Smart Operator Assistant for CAT Machinery"). Resolved.
  - Time box: about 24 h to the first review; website complete by then (D2). Resolved.
  - First review format: the presentation round is done; review 1 = deck + demo script (CHECKLIST P2). Partly resolved: the exact judging rubric was never supplied.
  - Still open: event portal / exact dates, the judging rubric per round, and the Expo account + Apple ID (needed only after review 1, D4).
- F01 merged (4393f2c). Track F's LF-normalisation commit corrupted favicon.ico (one CR byte stripped) and broke next build; restored on main (73c6e58), build green, Track F told.
- F02 merged (a4324ba). Root typescript devDependency added (1522870) for Track B finding 6.
- Track B B0 done, commit pending its review: COMMIT probe PASS, Pinecone spotter-kb (1024-d, dotproduct) Ready, Vault + function secrets set (DRY_RUN=true), smoke 11/11. Open for Shlok: B0b Vercel link/deploy (Track B's CLI was blocked by the auto-mode classifier), .env CONNECTION_STRING is the IPv6 direct host (scripts rewrite to the session pooler), legacy service_role key in SUPABASE_SECRET_KEY, defenso guard_code down, Docker not running.
- B0 merged (455b317). B0b done by the integrator with Shlok's approval: `vercel link` created project spotter (team shlok-goenkas-projects) and connected the GitHub repo; framework nextjs + rootDirectory apps/web set via `vercel api` PATCH (the Vercel MCP connector got 403); 3 production env vars piped from .env; deployed by pushing main (git deploy uploads only committed files). Production: https://spotter-five-brown.vercel.app (/ 200, /haptics-test.html 200, /dev/kit 404 by design).
- Gotcha: in Git Bash, `vercel api /v9/...` needs `MSYS_NO_PATHCONV=1` or the path is rewritten to a Windows path.
- F03 merged; root @types/node added (Track B finding 6 complete). scripts/ and shared tsc green from the root.
- Review (Shlok, ~10 min notice): F05 merged and deployed at Track F's relayed request; KIT_PUBLIC=1 added to Vercel production so /dev/kit shows the alert takeovers (revert after the review). /, /op, /dev/kit, /haptics-test.html all 200.
- B1 merged locally (f9f4a3f): contracts-v1.0.0 frozen = integration point IP0. Not pushed during the review to avoid a mid-demo production redeploy.
- Shlok approved live SOS for the review only (AskUserQuestion): /api/sos-demo merged (090acbf), 6 Twilio/Telegram vars added as sensitive + SOS_LIVE=1, production redeployed. Risk noted: unauthenticated route, anyone with the URL can trigger calls while live; revert SOS_LIVE right after the review.
- sos-demo cooldown (1 live dispatch / 60 s, max 20 per instance) merged and deployed (9343372) while SOS_LIVE=1.
- B2 merged (56d7139), migrations 001/001b-d live on Supabase. Docs debt: data-model §2.1 stale in three places (see B2 log) for the next docs pass. Supabase MCP cannot see the Spotter project (Vercel-managed org), so advisor checks go through Track B's Management API scripts.
- Review 1 over (Shlok). SOS_LIVE and KIT_PUBLIC removed from Vercel production; main pushed (896ff53, includes B2); /api/sos-demo POST returns mode dry_run, /dev/kit 404.
- Track B resumed after the usage limit: migrations local = remote (7), nothing partial. B4 in review (sqltest 5/5, vitest 125). Realtime partitions were missing (broadcasts silently dropped); realtime-wake created 22-26 Sep; asked Track B to make it survive to the demo date.
