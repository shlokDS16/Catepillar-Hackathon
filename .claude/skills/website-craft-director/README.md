# Website Craft Director

A reusable agent skill for taking a natural-language website idea through product framing, research, visual direction, expert orchestration, UI/backend contracts, implementation, verification and handoff.

## Use it

1. Copy the **entire** `website-craft-director/` folder into your agent's skills directory. Preserve `SKILL.md`, `skills/`, `references/`, `manifest.json` and `README.md`; the main skill loads subskills from their relative paths.
2. Invoke it with a prompt such as: “Use the Website Craft Director skill to build a bold editorial website for [product]. The audience is [audience], the primary action is [goal], and the references are [URLs].”
3. The skill inspects your repository and available tools, fills gaps with stated assumptions, and asks only about choices that materially alter direction or require your account/access.
4. For a substantial build, the lead delegates scoped tasks to the expert roles in `references/agent-orchestration.md`. The frontend and backend/data specialists pair on every interactive component's contract.

## Package map

- `SKILL.md` — trigger, workflow, subagent orchestration requirements and quality gates.
- `references/aayushvisuals-reference-catalog.md` — detailed portfolio audit plus evidence and build translations for all 19 project references and nine linked live destinations.
- `references/agent-orchestration.md` — specialist role contracts and handoffs.
- `references/component-contract.md` — frontend/backend behavior contract.
- `references/tools-and-setup.md` — conditional tool selection and exact setup guidance.
- `references/website-archetypes.md` — project-family patterns grounded in the Aayush Visuals audit.
- `skills/` — eight focused subskills; the main orchestrator reads and routes to them by phase.

## Subskills

| Step | Skill | Purpose |
|---:|---|---|
| 01 | `skills/01-reference-research/SKILL.md` | Top-to-bottom website/reference audit and evidence ledger |
| 02 | `skills/02-product-ux/SKILL.md` | Requirements, routes, journeys, content, component inventory |
| 03 | `skills/03-design-system/SKILL.md` | Visual direction, design tokens, pages and system |
| 04 | `skills/04-frontend-build/SKILL.md` | Semantic/responsive UI implementation |
| 05 | `skills/05-backend-integration/SKILL.md` | Backend/data pairing for every interactive component |
| 06 | `skills/06-motion-assets/SKILL.md` | Cursor, motion, 3D, media and original asset workflow |
| 07 | `skills/07-quality-verification/SKILL.md` | Browser, responsive, accessibility, state and risk review |
| 08 | `skills/08-release-handoff/SKILL.md` | Preview/deployment setup and verified handoff |

The orchestrator explicitly tells the agent when to read each subskill. Preserve the folder tree when installing; the bundle does not rely on a separate runtime or remote service. If the target assistant supports only one active skill at a time, install the main skill and keep the subskills alongside it; it will load each `SKILL.md` by its relative path.

This is a detailed skill package prepared for installation. Install/extract the entire folder into the desired agent skills directory to make it discoverable on future tasks; this output folder itself is not automatically registered as a Codex skill.

## Design reference

The workflow borrows the useful structure of UI/UX Pro Max—requirement extraction, design-system-first recommendations, focused domain searches, stack-specific guidance and pre-delivery validation—while adding product research, multi-agent orchestration, component-level backend contracts and evidence-based browser review. See [the upstream repository](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill). Its tools and data evolve; check the current installation's instructions and supported commands rather than assuming a version or flag.
