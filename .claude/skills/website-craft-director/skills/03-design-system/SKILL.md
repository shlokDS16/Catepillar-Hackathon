---
name: website-design-system
description: Create an original, cohesive visual direction and responsive design system for a website from product requirements, content and evidence-backed references.
---

# Visual Design System and Art Direction

Use this subskill after initial product framing. It converts the product's distinctive insight into repeatable visual rules, not a set of unrelated attractive screens.

## 1. Research and direction

- Read the project brief, sitemap, component list and reference evidence. Consult relevant entries in `../../references/aayushvisuals-reference-catalog.md`; use it as evidence, not a template.
- If UI/UX Pro Max is installed, locate and read its current skill instructions. For a new product use its complete design-system recommendation; use focused domain search for a specific UX/style/typography/chart question; use stack guidance for the actual framework. Verify installed command/flags. If unavailable, perform the same reasoning manually.
- Consider audience, content, domain, tone, density, accessibility and device before selecting visual style.
- Generate 2–3 distinct visual directions only if user requested exploration or decision is material. Otherwise pick one direction and explain the evidence behind it.
- Avoid generic default styling, arbitrary gradients, glass everywhere, overused bento cards, fake AI motifs and decorative motion with no product purpose.

## 2. Write the visual thesis

One concise principle links problem → visual hierarchy → art direction. Then describe:

- Base/secondary/accent semantic palette, contrast pairs and light/dark behavior.
- Display/heading/body/utility typography, scale, weights, line lengths and fallback.
- Grid, max width, margins, spacing and responsive breakpoints.
- Surface, border, radius, shadow/elevation and z-index rules.
- Icon language, image treatment, crops/aspect ratios, illustration, texture and asset provenance.
- Component variants and which component owns each interaction state.
- Motion principles: what may move, why, trigger, reduced-motion alternative, performance risk.
- Content voice, metadata style, number/date formats and source/credit display.
- Anti-patterns for this product (e.g. fragile event dates, chart without provenance, unreadable art overlays).

## 3. Create durable design artifacts

Write `design-system/MASTER.md` as the source of truth. Add `design-system/pages/<route>.md` only for justified page-specific overrides; page overrides inherit master rules and state what they change. If there is a Figma project, map tokens/variables/components to it; if not, keep a framework-neutral token table and implementation names. Never pretend Figma is connected when it is not.

For each key page, include an annotated composition: section hierarchy, target viewport, image/copy slots, CTA, important responsive changes, state variants and expected scroll/motion. Identify the hero/art assets that are truly necessary. Prefer original/user-owned assets. Use image generation for art direction or visual assets, not brand logos, legible UI text or false evidence.

## 4. Review against implementation

Review running implementation against the master system at real viewport sizes. Check typography loading, content fit, contrast, imagery crop, section rhythm, focus state, hover/pressed state, sticky offsets, mobile nav and motion. Return concrete component/route findings to the frontend owner, not aesthetic adjectives alone.

## 5. Expert assignment and gate

Delegate to a senior visual design director/design-systems specialist with ownership of the master tokens, page compositions and rationale. Avoid parallel agents editing the same design-system files. Handoff goes to UX (flows/components), frontend (tokens/components) and motion (motion intent). Gate: design system is specific enough to build, every page inherits consistent rules, principal assets have source/provenance and accessibility constraints are explicit.
