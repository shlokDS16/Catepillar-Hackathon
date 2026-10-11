---
name: website-frontend-build
description: Implement high-quality, responsive and accessible website interfaces with complete component states, real navigation, and integration against agreed backend contracts.
---

# Frontend Experience Build

Use when changing or implementing UI code. Read repo instructions, existing code and the actual framework docs first. Keep the current stack unless requirements justify a change. Do not assume Next.js, React, Tailwind, a component library or a particular version.

## 1. Establish the build plan

Read product brief, sitemap, page/component specs, design system, motion map and repo conventions. Inspect package manifests, routes, tests and running app. Agree file/module ownership with other agents. **Consult the backend/data contract owner for every interactive control before implementation**, including frontend-only menus, tabs, drag, filters and calculators; the owner records the rationale when no server/data service is appropriate. Resolve API/persistence-dependent contracts before building against them. If only reference evidence exists, convert it into new original components and content.

## 2. Implement in layers

1. App shell, semantic landmarks, fonts/tokens, routing, responsive grid and page frame.
2. Core components and primitive states (links, buttons, form fields, cards, dialogs, navigation).
3. Primary user journey from entry to successful/confirmed outcome.
4. Data/API integration against explicit contracts, including pending/error/empty/permission/offline states.
5. Remaining pages, content states, original media and secondary flows.
6. Motion and small craft refinements without changing task hierarchy.

Use the project's lint/build conventions. Keep components cohesive; avoid giant page components and premature abstractions. Use native semantic controls whenever possible. Every button is a button, every navigation action is a link, forms have labels, status changes are announced, dialogs manage focus and return focus. No `div`-button substitution without a reason.

## 3. Responsive and state behavior

- Design small screens deliberately. Set content priority, nav pattern, stacking order, image crop and persistent CTA offsets.
- Avoid accidental horizontal overflow and avoid hiding core information behind hover.
- Respect zoom, long text, localization, error messages and dynamic content.
- Use URL state for filters/details when sharing and browser back behavior matter.
- Load useful content progressively; reserve image/video space to prevent layout shifts; lazy-load below-fold heavy media.
- Show exact outcome after every interaction. Avoid no-op controls, fake save/send/payment states, console-only behavior, or hardcoded messages that contradict API results.
- Keep visual motion interruptible. Use transform/opacity when practical, and respect reduced-motion preferences.

## 4. Integrate with backend/data specialist

For each component, follow `../../references/component-contract.md` and the backend subskill contract. FE owns presentation, focus/keyboard, client state and honest feedback. BE owns data truth, validation, permissions, persistence and external side effects. Coordinate API schema, loading/empty/error/success, retries, idempotency, optimistic rollback, offline/stale rules and event naming. For frontend-only behavior, document the local scope and its reset/share/persistence behavior.

Never store service secrets in frontend code or commit them. Do not access real user data in a local demo. Keep test mode clear. If integration credentials are missing, use a typed mock adapter that is visibly simulated and doesn't resemble production success.

## 5. Browser review and handoff

Start the actual app preview when possible. Walk every route and core flow in browser at desktop and narrow mobile width. Test links, navigation, primary/secondary actions, input validation, errors, refresh/deep links, keyboard and touch. Inspect console/network errors. Fix observed defects before handoff. If unable to run, state precisely why and provide static code review findings separately from runtime claims.

Delegate implementation to a senior frontend engineer with exact route/component files and integration boundaries. Return changed files, routes, behavior implemented, contract mismatches, browser evidence, build/test status (only if run), remaining gaps and items for QA.
