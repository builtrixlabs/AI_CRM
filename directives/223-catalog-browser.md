# Directive 223 — `/admin/catalog` property + unit browser

**Kind:** feature (V2 / Phase C — real-estate showcase)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §5 D-223
**Authority:** Constitution II (tenant isolation), III (provenance)
**Builds on:** D-001 (RLS), D-002 (graph nodes), D-220 (RERA polish — surfaces RERA on property cards)

---

## Problem

Property + unit catalog is what every real-estate CRM lives or dies on. Today rows exist in `nodes` (`node_type='property'` and `node_type='unit'`) but there's no operator-facing surface to browse them. Customers asking "show me the inventory" are routed to the lead canvas — not the answer.

D-223 ships read-only `/admin/catalog`: properties grid + per-property unit table. Editing lands V3.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New library `src/lib/catalog/queries.ts`: `listProperties(org_id, filters?)` returns property rows + per-property unit count + per-state unit counts.
- [ ] **AC-2** Companion `getPropertyDetail(org_id, property_id)` returns property + its units (max 200, sorted by unit_no).
- [ ] **AC-3** Page `/admin/catalog/page.tsx` (Server Component): grid of property cards. Each card shows name, city, RERA badge, total units, status pills (available / held / booked / sold counts).
- [ ] **AC-4** Page `/admin/catalog/[id]/page.tsx`: property header (name, city, RERA, address) + unit table (unit_no, BHK, floor, price ₹, carpet area, status badge).
- [ ] **AC-5** RBAC: gates on org_admin via base_role check; redirects non-admins to `/admin`. (No new permission — uses base_role gating consistent with existing /admin pages.)
- [ ] **AC-6** Filters on the index page: `?city=` and `?status=available|held|booked|sold` query params. Server-rendered filter form.
- [ ] **AC-7** Empty state: "No properties yet" links to V3 catalog import.
- [ ] **AC-8** Cmd+K palette gains a "Catalog" entry (tied to `/admin/catalog`).
- [ ] **AC-9** Admin layout left-nav adds a "Catalog" link.

## Tests

- [ ] **AC-10** Unit tests for `listProperties`: filters apply correctly; per-state unit tally correct; cross-tenant isolation.
- [ ] **AC-11** Unit tests for `getPropertyDetail`: returns null for cross-tenant property_id; sorts units.
- [ ] **AC-12** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Editing properties / units — V3 (existing perms `properties:create|edit|hold|release` cover the path; UI lands later).
- Bulk import (CSV / RERA fetch) — V3.
- Channel-partner-visible catalog view — V3 (CP submission portal D-221 already gives the interaction surface they need).
- Lead-to-unit matching — D-012 PRD reference; landing as own directive in V3.

## Stack

shadcn Card / Badge / Table / Input + existing graph reads. No new schema, no new migration.
