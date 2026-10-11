---
name: website-quality-verification
description: Verify a built website against actual user journeys, component contracts, responsive layouts, accessibility, motion, content and security/performance criteria; report evidence without overstating test coverage.
---

# Website Quality and Browser Verification

Use before delivery, after substantial interaction changes, or when reviewing an existing experience. Follow project instructions. Do not install or run tests unless the user or repository workflow requests/authorizes it; browser/manual review and read-only inspection are distinct and should be reported accurately.

## 1. Build a coverage matrix

List route × viewport × user role × primary flow × important state. Cover at least:

- initial/load and delayed content;
- core success journey;
- error, empty, validation, forbidden, offline/stale, timeout and retry states that apply;
- refresh/deep link/back navigation;
- desktop and narrow/mobile viewport;
- keyboard-only/focus, screen-reader semantics and touch alternatives;
- reduced motion and no-hover operation;
- date/edition closed or expired states for campaign/event sites.

Use actual acceptance scenarios and frontend/backend contracts. If an external environment is blocked, document it as unverified rather than omitting it.

## 2. Browser walkthrough

When browser tooling exists, open actual preview and proceed page by page from top to footer. Capture expected visual states, inspect semantic/accessibility tree where available, and exercise interactive behavior. Use safe mock/sandbox data. No live charges, real emails, account changes or third-party form submission.

Check:

- nav links, scroll targets, menu open/close/escape/focus return;
- all buttons/actions, filters/search/reset, CTA and external handoff;
- form labels, invalid input, duplicate submit, progress, response and failure;
- all component contract states, API payload/data truth, permission denial and offline behavior;
- hover, focus, pressed, selected, disabled and cursor-specific effects;
- responsive overflow, sticky/fixed occlusion, image crop, long text, portrait/landscape and safe areas;
- console/runtime/network errors, image/font failure and refresh/deep links.

Never claim visual/browser checks when you only read source. If no browser, inspect source and say runtime behavior remains unverified.

## 3. Accessibility/inclusive review

Use appropriate WCAG version/target from project requirements and current official references. Check semantic landmarks/headings, accessible names/labels, error association, keyboard order, focus visibility, dialog focus, live announcements, contrast, zoom/reflow, image alt, chart text alternative, touch target, color-only states, language/locale and reduced motion. Include people using touch-only and keyboard-only paths. Report issue location, user impact, severity, reproduction and suggested fix.

## 4. Visual/performance/content review

- Compare build against design-system master and reference principles; no disconnected styles or default-template residue.
- Confirm responsive rhythm, readable type, image quality/provenance, proper hierarchy and no clipped UI.
- Check image dimensions/lazy loading, font strategy, layout shifts, third-party weight and heavy animation fallback.
- Confirm content accuracy, dates, prices, units, source notes, status and CTA claims. Remove invented metrics/testimonials.
- Verify meta title/description, canonical/robots/structured data only as appropriate to the product.
- Ask security reviewer to inspect forms/auth/payments/uploads/PII/third-party script when in scope.

## 5. Findings and retest

Prioritize blockers, critical, major, moderate, minor. Report evidence with route, viewport, role/state, exact steps, expected/actual and screenshot/log when possible. Assign each to the owning FE/BE/design agent. After correction retest the defect and impacted primary journey. Keep evidence of passed/failed/not-run separate.

## 6. Expert assignment and delivery gate

Assign independent QA/browser automation and accessibility experts for multi-page/app work. The implementation author should not be the only reviewer. Output coverage matrix, findings, exact checks run and remaining blocked states. Gate: all core user journeys work, contracts match behavior, blocker/critical defects resolved, and limitations are explicit.
