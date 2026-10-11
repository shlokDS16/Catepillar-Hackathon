# Expert agent orchestration

The lead agent is the **Website Craft Director**. It owns the project brief, decision log, task graph, integration, evidence quality and user handoff. It is accountable for resolving contradictions and ensuring that specialist output forms one complete website.

## Roles and owned outcomes

| Expert role | Owns | Reports back with |
|---|---|---|
| Product/domain researcher | Audience, domain facts, comparable patterns, risks | Evidence-linked brief, assumptions, risky claims and unanswered questions |
| UX / information architect | Sitemap, page hierarchy, core journeys, content structure | Route map, flow diagrams, annotated wireframe, component/state inventory, acceptance scenarios |
| Visual design director / design-systems specialist | Original art direction and visual system | Design thesis, references, tokens, typography, page composition, component variants, image guidance, anti-patterns |
| Senior frontend experience engineer | Semantic/responsive frontend architecture and interaction | Route/component plan, implementation owner map, working states, browser behavior, integration gaps |
| Senior backend/data/integration engineer | Domain model, service/API contracts, persistence, auth and failure semantics | Schema/API proposal, component contract reviews, validation/permissions, failure modes, safe service setup |
| Motion / creative developer | Cursor, hover, scroll, transitions and animation implementation | Motion map with triggers, purpose, timing intent, fallback, reduced motion and performance notes |
| Content strategist/domain writer | Information narrative, headings, CTA, status/error/help copy | Page copy inventory, factual/source requirements, empty/loading/error/success text |
| Asset / art-direction producer | Original image/illustration/video, crops, source/license data | Asset manifest, generation/source notes, responsive sizes/crops and provenance |
| Accessibility / inclusive-design auditor | Independent operability, readability and assistive tech check | Severity-ranked findings for keyboard, screen reader, contrast, zoom/reflow, touch and motion |
| QA / browser automation engineer | Acceptance and regression checks in integrated experience | Routes/states exercised, reproducible evidence, severity and retest status |
| Performance / SEO engineer | Load/animation/rendering budgets and discoverability | Image/font/bundle findings, layout shift risks, metadata and measurable recommendations |
| Security / privacy reviewer | User data, identity, permissions, uploads, payments and third parties | Threat/risk review, data minimization, secrets handling, validation and release blockers |

## How many agents to use

- Small static landing page: lead + UX/visual review; frontend implementation; QA/accessibility review. Backend role reviews interactive controls and can document “none required.”
- Multi-page marketing/editorial site: product/UX, visual, frontend and QA; content/SEO as relevant; backend audit of forms and CMS behavior.
- Authenticated or data-backed product: required lead, UX, senior frontend, senior backend/data, QA/accessibility; add security, motion, performance and domain/content specialists as risk requires.
- High-stakes, payment, personal data, safety or operational workflow: add specialist security/privacy and domain review before implementing the critical behavior.

Do not inflate the team. Agents are experts only in their assigned discipline; the orchestrator must not tell the user that a specialist independently reviewed an area if no specialist was assigned or no review occurred.

## Work order and handoffs

1. **Parallel discovery:** product/domain research, reference walkthrough and repo/tool inventory. Each returns evidence and unknowns, not implementation changes.
2. **Parallel structure:** UX maps journeys/components; backend maps domain/data boundaries; visual direction creates design thesis. They reconcile at a design/contract review before code for complex product flows.
3. **Design handoff:** design director delivers master tokens and page composition; motion specialist specifies motion after hierarchy and component semantics are clear.
4. **Implementation:** frontend owns app shell/routes/components; backend owns explicitly named service/schema/API files. Use non-overlapping file ownership. Pair on every interactive feature. Content/assets fill agreed slots.
5. **Integration:** lead confirms the app runs and the core journey is stitched together; FE/BE pair checks component behavior against contracts.
6. **Independent review:** QA/accessibility walks the actual app; design director checks visual consistency; performance/security experts review relevant risks.
7. **Closure:** lead triages findings, assigns fixes to owners, verifies critical journeys after fixes, records residual issues and prepares reviewable delivery.

## Assignment template

```text
Role: [specific expert role]
Goal: [one outcome for this project]
Context/evidence: [brief, decisions, reference findings, existing implementation]
Owned deliverable or files: [exact scope; no shared editing if avoidable]
Inputs/dependencies: [what must be known first]
Acceptance criteria: [observable criteria]
Boundaries: [what not to change or claim]
Coordination: Other agents are working in this project. Preserve their edits. Do not revert unrelated work. Report conflicts before touching another owner's files.
Return: Summary; decisions/rationale; artifacts or file paths; acceptance evidence; assumptions; risks/blockers; handoff needed.
```

For design/research tasks, ask for recommendations or artifacts, not overlapping code changes. For code tasks, define file/module ownership and integration points. Keep reports concise and evidence-bearing.
