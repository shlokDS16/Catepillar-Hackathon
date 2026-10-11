# Interactive component contract

The frontend and backend/data engineers jointly complete this contract for **every interactive component**, before implementation where behavior is product-critical. The backend engineer must assess each component and record either the server/data mechanism or a reasoned “frontend-only” decision. The contract prevents mock controls from masquerading as product behavior.

## Contract template

```yaml
component: "[feature + route]"
purpose: "[user outcome]"
owner_frontend: "[role/name]"
owner_backend_data: "[role/name; may conclude local-only]"
trigger: "[click, tap, key, submit, drag, timer, route, or server event]"
inputs: "[fields, data, permissions, validated constraints]"
outputs: "[user-visible result and emitted event]"
state_owner: "[component, URL, session, local storage, account, server]"
source_of_truth: "[static content, browser state, service, or external provider]"
persistence: "none | current view | session | device | account | server"
api_or_action: "[contract/schema or none + rationale]"
authorization: "[public / role / owner / permission / not applicable]"
validation: "[client and authoritative server checks]"
states:
  idle: "[visible rendering]"
  pending: "[progress feedback and interaction policy]"
  empty: "[no data/no results behavior]"
  success: "[confirmation and resulting state]"
  error: "[inline explanation and recovery]"
  offline_or_stale: "[degradation and sync behavior]"
  disabled_or_forbidden: "[why and safe next action]"
failure_policy: "[retry, timeout, rollback, duplicate protection, idempotency]"
accessibility: "[label, role, keyboard, focus return, live announcement, touch]"
motion: "[feedback and reduced-motion alternative]"
privacy_analytics: "[collected fields/events, purpose, retention or none]"
acceptance_scenarios:
  - "Given [context], when [action], then [observable outcome]."
mock_policy: "[real service / isolated fake adapter labeled as simulated]"
```

## When to use a backend

Use backend/server work when the requirement includes durable or shared records, identity, role/permission checks, trusted validation, cross-device state, concurrent edits, payments, email/SMS, uploads, AI/API calls with secrets, admin workflows, audit history, reliable reporting or operational alerts.

Keep behavior in the frontend when it is purely presentational or ephemeral: menu open/close, accordion, tab with already-loaded static content, hover, animation, drag within a local decorative canvas, local sorting/filtering of a small static list, or a non-persistent calculator. Do not add a database/API merely because a component changes appearance. The backend engineer reviews and records this scope.

## Examples

### Search/filter on a static portfolio

Client-side query + category filter; URL query parameters only if shareable state is needed; no server. Contract must still define empty/no-results state, keyboard input, clear-filter affordance and mobile controls.

### Contact form

Frontend labels, validates and presents pending/success/error. Backend decides email provider or CRM, validates again server-side, rate-limits, handles spam/abuse, avoids leaking secrets, and confirms only after delivery is accepted. Contract says what data is retained and for how long.

### Checkout

Backend/provider owns prices, inventory, payment intent and final payment status. Frontend reflects pending/declined/confirmed/cancelled states and prevents duplicate submits. Use test/sandbox mode during development; never simulate a paid success in a real checkout path.

### Safety alert/SOS

Do not wire a decorative control to a false promise. Domain and safety experts define trigger duration, cancellation, connectivity fallback, recipients, acknowledgement, audit and legal requirements. Keep prototype mode labeled and do not dispatch real alerts unless the user explicitly authorizes setup and real-world action.

### Dashboard chart

Define data source, timestamp/freshness, permissions, aggregation and empty/error states; show units and comparison basis; provide a text summary or accessible table. Never invent operational telemetry to make the graph look complete.
