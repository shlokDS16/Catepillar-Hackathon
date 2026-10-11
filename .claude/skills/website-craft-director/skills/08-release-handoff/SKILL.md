---
name: website-release-handoff
description: Prepare a reviewable website preview, identify required service setup, plan safe deployment, and provide a complete evidence-based user handoff without publishing or affecting production without authorization.
---

# Release Preparation and Handoff

Use after implementation and verification when the user requests a delivery, deployment plan, setup or closeout. This subskill prepares concrete, reviewable work. Do not publish, merge, send external messages or modify production accounts without user authorization.

## 1. Discover release context

Inspect repo instructions, package scripts, current branch/status, deployment config, domains, environment variables and existing CI. Do not print secrets or include them in logs. Identify desired target (local preview, team preview, staging, production) from user intent; if ambiguous, prepare preview only.

## 2. Produce a reviewable preview

Prefer local running preview or provider preview deployment. Verify build output and required environment configuration. If Vercel/Git preview is appropriate, explain its preview/production branch behavior based on current official docs and actual project config. Confirm preview protection for sensitive projects. Do not use `--prod` or merge to production on assumption.

If hosting is unavailable, give exact steps: provider URL, repository import/connect, framework preset, root directory, build/output settings, preview environment variables in dashboard, deployment action, resulting preview URL to share. Secrets belong in provider secret settings, never chat.

## 3. Integration readiness

List each service and status: connected, sandbox/test, mocked, blocked, not needed. Confirm redirect domains/callbacks, test credentials, access roles, webhook status, provider limitations and owner. If auth/payment/email/analytics is mocked, label it in the UI and handoff. Explain exact user action to enable it using verified provider docs, requesting only non-secret details needed.

## 4. Release checklist

- Content dates, availability, contact details, legal/privacy text and link destinations verified.
- Environment variables configured per environment; no secret committed or exposed.
- Error monitoring/log retention/privacy configured when applicable.
- Domain/HTTPS/redirect/robots/sitemap/metadata requirements checked.
- Forms, checkout, auth, email, uploads and webhooks tested in sandbox/staging.
- Accessibility, mobile/keyboard, performance and core route QA evidence reviewed.
- Rollback/backup, deployment owner and content-update path documented.
- Explicit user approval for production publish or other consequential operation is obtained after preview is reviewable.

## 5. Final handoff

Summarize: product problem and design decisions, routes/components delivered, expert reviewers and their work, exact preview/repository/artifact links, tool/provider setup, verification coverage, unresolved assumptions/bugs and concrete next action requiring the user. Do not provide generic recommendation dumps. Do not call work “complete” while required integration, review or approval remains.

Assign the release/DevOps expert when deployment complexity warrants. The lead remains accountable and verifies the report matches actual state.
