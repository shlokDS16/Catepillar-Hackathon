# Decision Index

One line per significant decision, newest last. Full reasoning lives in the ADR.

| Date | Decision | ADR | Status |
|---|---|---|---|

## 2026-09-23 — D1: Orchestration model
- Files STATE.md / CHECKLIST.md / RESUME.md + docs/project-memory are the source of truth across sessions; no /compact.
- Phase gates: validator agent (opus) + Shlok approval before each next phase.
- Coding model: Fable 5.1 (`claude-fable-5-1`); everything else Opus 5.5.
- Default repo shape: single Next.js app (+ optional FastAPI ML service; Expo only if mobile required). Monorepo tooling only if web+mobile share code. Rejected: Turborepo/Nx by default (overhead judges never see).
