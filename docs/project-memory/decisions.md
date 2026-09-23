# Decision Index

One line per significant decision, newest last. Full reasoning lives in the ADR.

| Date | Decision | ADR | Status |
|---|---|---|---|

## 2026-09-23 — D1: Orchestration model
- Files STATE.md / CHECKLIST.md / RESUME.md + docs/project-memory are the source of truth across sessions; no /compact.
- Phase gates: validator agent (opus) + Shlok approval before each next phase.
- Coding model: Fable 5.1 (`claude-fable-5-1`); everything else Opus 5.5.
- Default repo shape: single Next.js app (+ optional FastAPI ML service; Expo only if mobile required). Monorepo tooling only if web+mobile share code. Rejected: Turborepo/Nx by default (overhead judges never see).

## 2026-09-23 — D2: Deliverables and sequencing (Shlok)
- Build a website AND a mobile app. Website first, then replicate as an app.
- Mobile shown on real phones via iOS TestFlight + Android build; no store publishing.
- ~24 h to first review: target = website complete by then.
- UI follows Shlok's ChatGPT-derived UI framework (docs/design/ui-framework.md, pending), written by the `ui-ux-lead` agent.
- Backend orchestrated by `backend-lead`, validated by `backend-reviewer`; all code supervised by `code-reviewer`.
- Supersedes D1's repo default: web + mobile share code → pnpm workspace justified (final shape after doc 07).
