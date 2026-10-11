---
name: website-backend-integration
description: Design trustworthy data, API, persistence and service behavior for website components; pair with frontend on every interactive component while avoiding unnecessary backend services for local UI state.
---

# Backend, Data, and Component Integration

This subskill is mandatory for any site with interactive UI: review each component's contract. It does not mean every component needs a server. The senior backend/data engineer makes and records that decision, then verifies the frontend behavior matches it.

## 1. Discover requirements and existing system

Inspect repository schema, auth, API routes, database migrations, service integrations and environment handling before proposing changes. Map required capabilities: durable/shared records, user identity, roles, uploads, admin, AI/API, notifications, payment, audit, analytics, external events. Separate required capabilities from speculative features.

## 2. Decide client vs server per component

Usually client-only: open/close menu, tabs over loaded content, hover/motion, local sort/filter on small static records, ephemeral calculator, drag inside a local visual canvas. Server usually needed for account persistence, shared data, authorization, trusted price/validation, concurrency, payment, upload, messaging, operations, private AI/API key, audit trail or cross-device state.

Use `../../references/component-contract.md` for every interactive component. Fill its schema with FE owner. Include source of truth, persistence scope, input/output, authorization, validation, all states, idempotency/retry, stale/offline rules, privacy/analytics and acceptance scenarios. For local-only decisions write the rationale and reset behavior.

## 3. Design data and API boundaries

- Model domain concepts and lifecycle states (e.g. draft → pending → confirmed → cancelled/failed) rather than storing presentation labels as truth.
- Define request/response schemas, units, time zones, pagination, errors, authorization, rate limits and versioning.
- Validate on trusted server boundaries; client validation is for UX only.
- Make side-effecting operations idempotent or safely deduplicated; decide transaction/rollback semantics.
- For third-party services, map timeouts, provider error/status, webhooks, signature validation, reconciliation and retry policies.
- Keep least privilege, secrets in protected config, and personal data minimized with retention/deletion plan.
- Use mocks clearly isolated from production adapters and labeled in UI.

## 4. Pair with frontend by component

Schedule short FE/BE contract review for each interactive feature before integration. Define what the user sees for pending, success, error, empty, offline, forbidden, timeout and duplicate states. Agree whether optimistic update is safe and how rollback/focus/announcement works. After integration, jointly run success and failure scenarios in the rendered app; verify state and data agree.

Examples:

- Filter over a small local list: no API, but empty state, URL/reset semantics and keyboard behavior still required.
- Contact form: server endpoint/provider, validation, spam limits, safe logs and only-confirm-after-accepted semantics.
- Dashboard: source timestamp, units, freshness, access scope, no-data/error state, text alternative.
- Payment: provider-hosted/tokenized flow, server-owned amount and payment state, duplicate prevention and reconciliation; test mode first.
- SOS/safety: domain/safety authority, precise trigger/cancel semantics, recipients, offline queue/acknowledgment and audit; prototype only until real setup is authorized.

## 5. Tool/provider setup

Select a provider only after the contract shows the need. Discover available MCP/connectors and existing infrastructure. Verify provider docs and current SDK/API. Give exact setup instructions if access is missing: dashboard/project, required service, redirect domains, roles, sandbox mode, safe config path. Never ask for secret values in chat or log them. Do not create external production resources or send/charge users without authorization.

## 6. Expert assignment and delivery

Assign a senior backend/data engineer with named modules/schema/API ownership and acceptance criteria. Avoid shared edits with frontend agent. Output a component contract matrix, schemas/services implemented or explicitly deferred, auth/security/privacy decisions, mock-vs-live status, failure scenarios, integration steps and open blockers. QA tests contracts; security expert reviews high-risk data/action flows.

**Gate:** no frontend action promises a result without a defined source of truth and failure behavior; no fake persistence/payment/email; every component has FE and backend/data review; any “no backend” decision is explicitly justified.
