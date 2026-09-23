# Validator Gate P0: verdict and fix list

- **Date:** 2026-09-23
- **Validator:** Opus 5.5, fresh context. Two roles: verification auditor and software-services founder.
- **Scope:** docs/research/01, 02, 03; STATE.md, CHECKLIST.md, RESUME.md, CLAUDE.md
- **Method:** re-fetched the cited URLs (WebFetch, WebSearch), probed the CLIs on this machine and ran `claude mcp list`.

## Overall verdict: **PASS-WITH-FIXES**

The research is careful and well sourced. It has one strategic blind spot that matters more than everything else here. File 01 concludes that no Caterpillar hackathon is open right now, but Shlok is competing in one. The intel covers the wrong event. It profiles the pan-India Tech Challenge, which is a hardware-leaning event with a 5-month cycle. The live event is almost certainly a Caterpillar **campus or regional recruitment hackathon**, the same type as "VIT Hackathon 2024". Fix 1 must land before P1.

---

## A. Spot-check of 5 decision-critical claims in 01

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Tech Challenge 2026 has concluded (finales in Chennai, Tiruvallur, Bangalore; 8 categories) | **CONFIRMED** | constructiontimes.co.in article dated 10 Jul 2026 says the challenge "culminated in on-site grand finales" at those three sites, across 8 problem-statement categories. It does not mention a PPO. |
| 2 | 2025 problem statements PS1 depth estimation, PS2 defect vision, PS3 DEF tank, with winners PSG iTech, PSG Tech, IIT Madras | **CONFIRMED** (via secondary source) | The Beamery page is JS-rendered and returned empty to both WebFetch and agent-browser (timed out). equipmenttimes.in confirms all 3 titles and winners, and the funnel of 4,000+ teams → 185 → 70 → 38, with finales on 20 and 23 June. The search snippet of the Beamery page confirms the PS1 text. **Omission:** 01 leaves out that **VIT was a 2025 runner-up**. |
| 3 | No Caterpillar student hackathon is open or live on 23 Sep 2026 | **WRONG as framed** (contradicted by the user's own situation) | Nothing public turned up for Sep–Oct 2026 on Unstop, HackerEarth, Beamery or VIT portals. The absence is expected: campus hiring hackathons are run through the college placement office (CDC) and Beamery links, not listed publicly. |
| 4 | VIT-specific edition "VIT Hackathon 2024" was a recruitment event (reg. 29 Jul, on-campus final 9–11 Aug 2024) | **PARTIALLY CONFIRMED** | The page exists and is titled "VIT Hackathon 2024 - Caterpillar". Its body did not render. A search snippet confirms the digital-transformation framing (ML, IoT, autonomous vehicles, predictive analytics). The dates could not be re-verified. |
| 5 | CAC 2026 registration closed 14 Aug 2026; prize ₹3.5L + PPI | **CONFIRMED** (deadline) / **UNVERIFIABLE** (prize) | The search index shows "submit ... through Unstop before Aug 14th 2026". The Unstop page did not render. The prize and "internship interview" figures appear only on shareyaarnow. |

### What the live 1500+ participant event most likely is
A **Caterpillar campus hiring hackathon** of the 2024 type, run for VIT or for a small group of colleges. Evidence:
- A 2024 multi-campus Caterpillar hackathon ran across **PSG Tech, Thiagarajar (TCE) and VIT** with **1,100+ registrations, 2 problem statements, 3 winners and 6 runners-up** (LinkedIn, Tarush Agarwal, via search index).
- A participant reports a **24-hour hackathon followed by interviews of shortlisted candidates (72 h total), leading to a Caterpillar Digital internship** (same source).
- A 2024 Caterpillar hackathon problem statement was **"Predicting component failures based on history and usage data"**; the team built a random-forest model (LinkedIn, Sridhar Ravi).
- The public scale matches this type, not the Tech Challenge (13,000+ students): 1,100 registrations in 2024 against 1,500+ now. The PPT round followed by a website or app final also fits.

**Status:** UNVERIFIABLE publicly. Shlok's registration email or CDC notice is the only authoritative source. Primary sources were not directly fetchable: LinkedIn returns HTTP 999 and Scribd PS1 (doc 775740144) has no text layer.

---

## B. 02-tool-inventory: contradictions and wrong entries

1. **markitdown MCP is listed as available. This is wrong.** It sits in `~/.claude/.mcp.json`, which is not a file Claude Code loads, and `claude mcp list` does not show it. The global CLAUDE.md states markitdown is CLI-only (`markitdown.exe`). The phase map should say CLI.
2. **graphify invocation is vague.** The file says "invoke via its own entrypoint". The correct form, verified, is `python -m graphify <cmd>` (Python 3.14; `query`, `update`, `path`, `explain`, `hook install` all exist). RESUME.md has this right and 02 should match it.
3. **The phase numbering conflicts with CHECKLIST.md.** In 02, P1 = PPT, P2 = architecture, P3 = build, P4 = QA, P5 = demo. In CHECKLIST, P1 = problem understanding, P2 = PPT, P3 = architecture, P4 = build, P5 = quality, P6 = submission. A fresh session will mis-map tools to phases.
4. **Wrong skill namespace.** 02 says `superpowers:consolidate-memory/import-memory`. These skills are `anthropic-skills:consolidate-memory` and `anthropic-skills:import-memory`.
5. **uv is missing and not flagged.** 03's FastAPI plan depends on `uv`, which is not installed (`uv: command not found`). pnpm 10.33.0 is installed but not listed. turbo is not installed; npx covers it, but the table should say so.
6. **The auth status is stale or incomplete.**
   - claude.ai **Canva is connected**; only the local `canva` entry needs auth.
   - claude.ai **Vercel is connected**; the plugin copy needs auth.
   - The GitHub plugin fails with "Authorization header is badly formatted", not merely "needs auth".
   - **Expo MCP needs auth** and is not listed.
7. **Useful connected tools are omitted:** draw.io, Excalidraw and Mermaid Chart (all connected). They are the fastest route to the architecture and flow diagrams for the PPT round.

## C. 03: Turborepo + pnpm, FastAPI outside the JS graph

- **Verdict: sound principle, overbuilt default.** Keeping FastAPI out of the JS graph is correct. Setting up Turborepo, generated OpenAPI clients, `packages/ui` and `packages/config` before the problem statement arrives is premature. Every extra layer costs agent tokens and creates Windows symlink and Metro-resolver risk; Expo in a pnpm monorepo needs `node-linker=hoisted` or Metro config, and 03 does not mention this.
- **Would a judge care? No.** Caterpillar judges score the problem fit, the working demo, the data and ML credibility, and the answers in the interview. Nobody opens `turbo.json`. Monorepo work pays off only if both a web app and a mobile app actually ship.
- **Recommendation for ADR-001 in P3:** default to a single Next.js app (with API routes) plus a Python `services/ml` for model serving if ML is needed. Add Expo and Turborepo only if the brief explicitly requires an app. If both web and mobile are required, 03's tree is fine.
- **Conflict with the existing scaffold:** 03 proposes `docs/HANDOFF.md`, `PROGRESS_LEDGER.md` and `docs/decisions/`. The project already uses STATE.md, `docs/project-memory/timeline.md` and `decisions.md`, while `claude/routines.md` puts ADRs in `docs/architecture/`. That makes three names for the same thing. Pick one set; the recommendation is to keep the existing scaffold and reject 03's file set.

## D. Orchestration files: resume readiness

A fresh session can find its bearings, but some ambiguity remains:
1. **STATE.md is stale.** It says P0.3–P0.5 are "in flight", but all three files exist. "Next action" does not mention that the validator gate (this file) must be recorded first.
2. **CHECKLIST.md is stale.** P0.3–P0.5 are still `[~]`, and the Gate P0 verdict is not recorded.
3. **The ADR location is ambiguous.** `docs/architecture/` (routines.md) and `docs/project-memory/decisions.md` (index) could both be right, but neither file says the index points to `docs/architecture/ADR-*.md`.
4. **The git repo has zero commits.** RESUME's checklist says "git commit", but nothing is committed, so no recovery point exists.
5. **`unanswered-questions.md` is empty.** It should at least hold: event identity (campus hiring hackathon or other), round dates, team size, the PPT template, judging criteria, whether the final is a website, an app or both, and whether interviews follow.
6. **Key event facts are missing from STATE.md:** the deadline for round 1, the team composition, and the event's official name and portal. A resuming session cannot plan without them.
7. **The model policy says "Fable 5.1".** The model version could not be verified from here. Confirm the exact model name before P4.
8. RESUME.md's prompt and load order are otherwise good: it forces a read before any action and waits for a go-ahead.

## E. Founder lens: 3 strategic insights

1. **This is a hiring filter wearing hackathon clothes. Optimise for the interview, not the trophy.** Past Caterpillar campus hackathons fed directly into interviews and Caterpillar Digital internships. Judges are Cat Digital engineers asking "would I hire this person?" Every design choice must be one Shlok can defend line by line with no AI hand-waving. Most of the 1,500 teams will ship agent-generated code they cannot explain; depth of understanding is the moat.
2. **Win on Caterpillar's real data story, not generic "AI dashboards".** Every verified problem statement is grounded in a Cat product line: Cat Detect collision mitigation, weld and paint QA, DEF quality, and component-failure prediction from usage history (the VisionLink/PSE predictive-maintenance world). Most teams will build a pretty CRUD app with an LLM chatbot bolted on. The winning pitch speaks Cat's language:
   - Measurable downtime or cost saved per machine.
   - An explicit ML metric (precision/recall at an operating threshold, lead time before failure).
   - A dealer, technician or operator workflow.
   - A clear fit with Helios/VisionLink-style telematics.
3. **Round 1 is a PPT, and most teams will pitch a feature list.** The round is a screening funnel (2025 Tech Challenge: 4,000+ teams → 185, under 5%). Screeners skim. The deck that survives:
   - Opens with a quantified problem.
   - Shows one sharp architecture diagram.
   - Shows a live-looking UI mock.
   - Gives a feasibility plan with data sources.
   - Includes a slide on "why this works on a Cat machine in the field": offline or edge use, safety, cost.

   Prove feasibility early. A small working model or clickable prototype screenshot in round 1 beats promises, and most teams will have neither.

---

## Numbered fix list (apply before Gate P0 closes)

1. **01:** add a section on the live event. Record Shlok's event name, portal, dates, rounds, team size and interview linkage from his registration email. Reframe §6 flag 1 from "none open" to "the live event is a non-public campus hiring hackathon". Add the 2024 PSG/TCE/VIT multi-campus data point, the "component failure prediction" problem statement and the 24 h + interview format.
2. **01:** note that VIT was a 2025 Tech Challenge runner-up (equipmenttimes.in).
3. **02:** mark markitdown as CLI-only, not MCP (`~/.claude/.mcp.json` is not loaded).
4. **02:** replace "graphifyy via its own entrypoint" with `python -m graphify` (query, update, hook install).
5. **02:** renumber the phase map to match CHECKLIST.md (P1–P6).
6. **02:** fix the skill namespace: `anthropic-skills:consolidate-memory` / `import-memory`.
7. **02:** add uv (missing; `winget install astral-sh.uv` or `pip install uv`), pnpm 10.33.0 (installed) and turbo (via npx).
8. **02:** correct the auth rows (claude.ai Canva and Vercel connected; the GitHub plugin has a malformed auth header; Expo MCP needs auth). Add draw.io, Excalidraw and Mermaid for PPT diagrams.
9. **03:** downgrade the monorepo from default to conditional: a single Next.js app plus an optional Python ML service unless both web and mobile are required. Add the Expo + pnpm hoisting/Metro caveat.
10. **03 vs scaffold:** state that the existing STATE / timeline / decisions / `docs/architecture/ADR-*` set is authoritative and that 03's HANDOFF / PROGRESS_LEDGER / `docs/decisions` set is rejected. Log this in decisions.md.
11. **STATE.md and CHECKLIST.md:** mark P0.3–P0.5 `[x]`, record this Gate P0 verdict, and set the next action to "apply fixes 1–10, then present the master plan".
12. **unanswered-questions.md:** add event identity, round-1 deadline, PPT template, judging criteria, website vs app, team members, and interview format.
13. **git:** make the first commit of the scaffold and research so a recovery point exists.
14. **CLAUDE.md:** confirm the exact coding-model name before P4.

## Sources checked
- https://constructiontimes.co.in/Caterpillar-celebrates-winners-of-Tech-Challenge-2026 (fetched)
- https://equipmenttimes.in/Caterpillar-empowers-India%E2%80%99s-next-gen-innovators-through-Tech-Challenge-2025 (fetched)
- https://pages.beamery.com/caterpillarinc/page/tech-a-thon-25-problem-statements-0c5cyvlog_ (JS-rendered, empty; search snippet only)
- https://pages.beamery.com/caterpillarinc/page/vit-hackathon-2024-ssolrrnmrj (JS-rendered, empty; search snippet only)
- https://www.linkedin.com/posts/sridhar-r-_hackathon-caterpillar-innovation-activity-7215745524526669827-zs9n (fetched)
- https://www.linkedin.com/in/tarush10000/ (HTTP 999; content via search index only)
- https://www.scribd.com/document/775740144/Problem-statement-1-CAT-Hackathon (no text layer)
- https://unstop.com/competitions/caterpillar-autonomy-challenge-iit-madras-1495082 (did not render)
- Local probes: `python -m graphify --help`, `pnpm --version`, `uv --version`, `claude mcp list`, `~/.claude/.mcp.json`
