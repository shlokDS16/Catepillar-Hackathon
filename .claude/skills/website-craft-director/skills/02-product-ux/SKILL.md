---
name: website-product-ux
description: Convert a natural-language website idea and research into a clear product brief, audience journeys, information architecture, content plan and complete UI component/state inventory.
---

# Product Strategy and UX Architecture

Use this subskill before designing a new site/product, changing navigation or adding an interactive flow. For a narrow visual-only change, use only the relevant portions.

## 1. Frame the product

Extract and separate:

- User problem, user groups/roles, context, device, frequency and constraints.
- Primary action / conversion, supporting goals and measurable acceptance conditions.
- Content, source of truth, content owner, update cadence, language and lifecycle.
- Current technologies/data, authentication, integrations, privacy and safety requirements.
- Supplied reference evidence and requested tone, must-have elements and exclusions.

Write known facts, assumptions and open questions. Ask only questions that materially affect user/task, information architecture, risk, brand ownership or integrations. Otherwise pick a reversible default and keep moving.

## 2. Define the information architecture

Create a sitemap and page brief for every route:

```text
Route / page name:
Audience and purpose:
Entry source:
Main user question:
Primary action / secondary action:
Content blocks in narrative order:
Data/API needs:
Empty/error/permission states:
Exit/next path:
```

Keep a short route to the primary outcome. Build navigation around user tasks, not internal departments. For long editorial or event sites, design both “I’m exploring” and “I know what I need” paths. For multi-role products, give each role the minimum needed interface while sharing the same source-of-truth model.

## 3. Map journeys and states

For each high-value task write: start condition → action → system response → decision → completion → recovery. Cover first-time and returning use. Add realistic exception scenarios such as no results, closed event, unavailable product, poor network, denied permission, invalid data, stale data, duplicate submission, cancellation, unauthorized access and timeout.

Create a component inventory. For each interactive element note purpose, trigger, resulting state, keyboard/touch path, mobile layout, empty/loading/error/success/disabled state and data dependency. Pass these to the backend integration skill for the joint contract. Do not leave “functional” undefined.

## 4. Content and trust

- Inventory verified content, owner, source, freshness and required attribution.
- Mark missing facts and prohibited claims; never invent social proof, case metrics, pricing, endorsements or event dates.
- Define copy for actions, validation, progress, confirmation, error, empty and permission-denied states.
- Make CTA wording predict the next step; include price/commitment/permission consequences before submission.
- For dates/events/reports, define expiration, archive or version behavior.

## 5. Prepare the handoff

Deliver `product/brief.md`, `product/sitemap.md`, `product/flows.md` and `product/components.md` at a depth appropriate to scope. Include acceptance scenarios in Given/When/Then form. Assign a UX/product specialist agent with explicit artifact ownership. Coordinate API-dependent journeys with the backend engineer before finalizing flows.

**Gate before visual design/build:** the primary user journey, audience, content order, page set and interaction semantics are clear; material risks and assumptions are visible; every control has a purpose; flows have an exit/recovery path.
