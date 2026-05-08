# Spec — 011-doe-workflow-engine

## Goal

Ship the DOE Workflow Engine: a tier-bounded, audit-logged,
event-triggered runtime that executes actions on behalf of
configured directives, with 15 platform-default directives seeded
for V0.

## Functional surface

### Schema
- `directives` (per-org or platform-default)
- `directive_invocations` (append-only ledger)

### Library
- `dispatchDirective({trigger, payload, organization_id, deps?})`
- `loadActiveDirectives(trigger_kind, organization_id)`
- `evaluateCondition(directive, payload)`
- 5 action handlers under `src/lib/doe/actions/`
- 10 trigger adapters under `src/lib/doe/triggers/`

### Wiring
- `createLead` already emits `lead.created`. Add a thin Inngest
  function that, on `lead.created`, calls
  `dispatchDirective({trigger:'lead.created', ...})`.
- WhatsApp inbound (D-010) doesn't emit Inngest; D-011 reads
  Postgres CHANGES via a periodic cron sweep instead.

## Non-functional

- p95 dispatch latency < 100ms for in-memory matching, before
  the action handler runs.
- Idempotency window: 24 hours per (directive_id, subject_node_id,
  trigger_id).
- Rate limit: 100 fires per directive per org per 24h.

## Out of scope

- The org-admin authoring UI.
- Real outbound message send (templated send writes an activity
  node only).
- T3 per-action approval queue UI.
