# Directive 320 — Catalog editing

**Kind:** feature (V3 / Phase C — real-estate daily-use; opens Phase C)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v2` (per-directive PR cadence — separate branch off v2)
**Source:** `docs/plans/v3-plan-v1.md` §5 D-320
**Builds on:** D-223 (read-only catalog browser), D-002 (graph node model), D-007 (state-machine pattern)

---

## Problem

D-223 ships `/admin/catalog` as a **read-only** browser. Sales reps can't update unit availability, hold a unit, mark it sold, or fix typos in property addresses without bothering an admin to do it via SQL. For real-estate teams the catalog is the daily-driver — read-only is a hard MVP gap.

D-320 lands editing:

- **Unit edit** (`/admin/catalog/[id]/units/[unitId]/edit`) — status, price, BHK, floor, carpet area, unit number.
- **Property edit** (`/admin/catalog/[id]/edit`) — name, city, address, RERA number.
- **Status state machine** — `available → held → booked → sold` is one-way; backward transitions require a new `catalog:admin_override` permission.
- **Optimistic locking** via `updated_at` comparison — two reps editing the same unit don't silently clobber each other.
- **Audit log** captures the field-level diff of every save.

## Success criteria (production target 80/90)

### State machine

- [ ] **AC-1** New module `src/lib/catalog/transitions.ts`:
  - `STATUS_ORDER: readonly UnitStatus[]` = `["available", "held", "booked", "sold"]`.
  - `isForwardTransition(from, to)` — returns true iff `to` index > `from` index (or `from === to`).
  - `isOverrideRequired(from, to)` — true iff backward transition.
  - `assertTransitionAllowed(from, to, has_override)` — throws `IllegalUnitTransitionError` (typed) if rule violated.

### Permission

- [ ] **AC-2** Add `catalog:admin_override` to `PERMISSIONS` in [src/lib/auth/rbac.ts](src/lib/auth/rbac.ts). Granted to `org_owner` and `org_admin`. Not to `sales_rep` or `manager`.

### Edit helpers

- [ ] **AC-3** New module `src/lib/catalog/api.ts`:
  - `updateUnit({ unit_id, organization_id, patch, expected_updated_at, caller_id, has_override })` — single SELECT to fetch current state, validate transition, single UPDATE with `WHERE id=? AND updated_at=?` for optimistic lock, audit_log row with diff. Returns `Result<{updated_at}>`.
  - `updateProperty({ property_id, organization_id, patch, expected_updated_at, caller_id })` — same shape; no state machine (properties don't have status).
  - Both helpers accept injected client for tests; production wires `getSupabaseAdmin`.
  - Patch fields are validated via Zod (existing `node-data-as-jsonb-with-zod-validation` pattern from D-002).

### Server actions + UI

- [ ] **AC-4** `/admin/catalog/[id]/edit/page.tsx` — form pre-populated from `getPropertyDetail`. Server action `savePropertyAction(formData)` calls `updateProperty`. Surface errors via discriminated-union return shape (existing pattern).
- [ ] **AC-5** `/admin/catalog/[id]/units/[unitId]/edit/page.tsx` — form pre-populated. Server action `saveUnitAction(formData)`. Status dropdown disables backward options unless `catalog:admin_override` is held.
- [ ] **AC-6** `/admin/catalog/[id]/page.tsx` (existing read-only) gains an "Edit property" link in the header (gated on `properties:edit`) and per-row "Edit" links on the units table (gated on `units:edit`).

### Tests

- [ ] **AC-7** `tests/lib/catalog/transitions.test.ts`:
  - All forward transitions from each state allowed without override.
  - All backward transitions rejected without override; allowed with override.
  - `from === to` is a no-op (allowed).
- [ ] **AC-8** `tests/lib/catalog/api.test.ts`:
  - `updateUnit` happy path: returns ok + new updated_at; SELECT + UPDATE called; audit row inserted.
  - Stale-write: when `expected_updated_at` doesn't match, returns `{ ok: false, error: "stale" }`.
  - Forward transition without override allowed.
  - Backward transition without override → `{ ok: false, error: "override_required" }`.
  - Backward transition with override allowed.
  - `updateProperty`: happy path, stale-write detection.
- [ ] **AC-9** Coverage on touched files: ≥80% lines / ≥90% branches.
- [ ] **AC-10** Gate-4 security scan: 0 CRITICAL/HIGH.

## Non-goals (deferred to V3.x)

- **Bulk import (CSV / RERA registry)** — single-row edits only.
- **Channel-partner-visible catalog** — internal only for v3 MVP.
- **Lead-to-unit matching surface** — V3.x.
- **Property image / brochure upload UI** — surfacing the existing storage hooks is V3.x.
- **Per-state-trigger workflows** (e.g. notify CP on `held`) — handler hooks defer to V3.x.

## Stack

- **No new runtime deps.** Reuses Zod for validation, existing shadcn form primitives.

## Authority

- Constitution VIII — **Bounded permission catalog** (`catalog:admin_override` is added explicitly, not silently widened).
- Supersedes: D-223 § non-goals "Editing properties / units (perms exist; UI is V3)".

## Operator follow-ups (post-merge)

- [ ] Confirm `catalog:admin_override` is reachable from `/settings/roles` (allow override) — should appear automatically since it's in the catalog.
- [ ] Smoke test: org_admin edits a unit's price, status forward (available → held). Sales rep tries backward (held → available) — denied. Org_admin opens the same page → backward enabled.
