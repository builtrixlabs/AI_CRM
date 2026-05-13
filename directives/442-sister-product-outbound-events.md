# Directive 442 — Outbound event emissions for sister products

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/442-sister-product-outbound-events` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 2.3](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)

## 1. Problem

D-208 (V3) + D-311 (V3 part 2) shipped the *transport* for outbound webhooks — `webhook_endpoints` table, per-org delivery worker with HMAC signing, dead-letter queue. `emitEvent(org_id, kind, payload)` is defined but **never called**. PSCRM, lead-sources, and Legal Auditor need to subscribe to AI_CRM events — but there's no canonical list of event kinds, no typed helpers, no payload validation.

D-442 lays the **producer-side contract** so future dispatcher work (lead state transitions, deal stage transitions, site-visit lifecycle, contact mutations) emits the right kinds with the right shapes, validated against a single source of truth.

## 2. Scope (in)

1. **`src/lib/integrations/sister-products/event-kinds.ts`** — canonical enum + zod payload schemas for every event kind sister products subscribe to:
   - Deal lifecycle: `deal.created`, `deal.qualified`, `deal.booked`, `deal.lost`, `deal.stage_transitioned`
   - Lead lifecycle: `lead.created`, `lead.qualified`, `lead.lost`
   - Site visit lifecycle: `site_visit.scheduled`, `site_visit.completed`, `site_visit.cancelled`
   - Contact: `contact.created`, `contact.updated`
2. **`src/lib/integrations/sister-products/emit-helpers.ts`** — typed wrapper per event kind. Each helper takes `(client, organization_id, payload)`, validates the payload against the schema, then calls `emitEvent`. Per-org by signature; no leakage between orgs is possible.
3. **`src/lib/webhooks/emit.ts`** — extend with a non-fatal `unknown_event_kind` warning when an emit slips in with a kind outside the canonical enum. Keeps additive emits working but flags drift.
4. **Tests:**
   - `tests/lib/integrations/sister-products/event-kinds.test.ts` — every kind has a schema; each schema accepts a representative happy payload and rejects an obviously malformed one.
   - `tests/lib/integrations/sister-products/emit-helpers.test.ts` — happy path calls `emitEvent` with the right (org, kind, payload); invalid payload throws before `emitEvent` is touched; org id passes through unchanged.

## 3. Out of scope (lands in follow-up dispatcher directives)

- **Mutation-seam wiring** — calling `emitDealStageTransitioned()` from `transition_stage` RPC return path, calling `emitLeadCreated()` from the lead-creation server action, etc. Each is a small, isolated patch best landed alongside the surface that *triggers* it (so test coverage stays local). D-442 ships the helpers; future patches just import them.
- Outbound delivery retries beyond what D-311 already does.
- Per-event-kind ACL on which orgs can emit which kinds (every org emits its own).
- Event replay / backfill for sister products that came online late.

## 4. Per-org integration model — locked

Every emit helper takes `organization_id` as the first scoping arg. There is no global emit path. Each org's `webhook_endpoints` subscriptions (set up by its `org_admin` via `/admin/webhooks` — D-208 surface) determine which sister products receive that org's events; no cross-tenant leakage is possible because the delivery worker scopes by `organization_id` end-to-end.

## 5. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** every file in §2.
2. **Tested:** new vitest green.
3. **Typechecked:** clean for changed files.
4. **Migrations:** N/A.
5. **Pushed:** PR opened against v5.
6. **Vercel preview green.**
7. **UI verified on live preview:** N/A (no UI surface).
8. **PR merged to v5.**
9. **Post-merge v5 build green.**
10. **Status logged in V5_STATUS.md.**
