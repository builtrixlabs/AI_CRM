# Directive 413 — Custom views engine (L2)

**Kind:** feature (V4 / PRD v3.0 D-113)
**Status:** AUTHORIZED — operator approved 2026-05-11 (revised Phase A)
**Branch target:** `v4`
**Source:** `docs/PRD-v3.0.md` §3 P8 + §4 D-113; `docs/plans/v4-plan-v1.md` Phase A
**Builds on:** D-020 (custom field definitions), D-007 (lead canvas + states), D-018 (profiles + permissions)

---

## Problem

Reps and managers can open a single lead canvas via Cmd+K (D-009 bounded), but there's no list page where you can scan / filter / sort all leads. PRD v3.0 §3 P8 makes `lead` (and later `deal`, `contact`, `unit`) first-class list-able entities. Without a list surface, "view selector on list pages" (PRD D-113) has nowhere to live.

D-413 ships:

1. A `custom_views` table — per-org per-entity-type saved view definitions (filters + columns + sort), with `scope='org'` (shared) or `scope='user'` (private).
2. Profile-level `view_defaults jsonb` so each user has a default view per entity-type.
3. A filter compiler that translates a view's `filters` JSONB into a Supabase query.
4. A lead list page at `/dashboard/leads` — the host surface for the views engine on the lead entity. Default view: "All leads, newest first".
5. A view selector dropdown on the list page (org-shared views + own private views + ad-hoc URL filters).
6. An admin page at `/admin/views` to manage org-shared views per entity-type.
7. Custom field columns from D-020 are first-class options in the column picker and filter builder.

Other entity-type list pages (deals, contacts, units) reuse this engine when their directives land.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Migration `<ts>_custom_views.sql`: `custom_views(id, organization_id, entity_type, scope, owner_id, name, slug, filters jsonb, columns jsonb, sort jsonb, full provenance)`. `entity_type` CHECK constraint matches D-020's set (`lead | deal | contact | project | tower | unit | site_visit | document | activity | note | call`). `scope IN ('org','user')`. CHECK that `scope='user' XOR owner_id IS NULL` (org views must have NULL owner; user views must have non-NULL). Two partial UNIQUE indexes on `(organization_id, entity_type, slug)` for org scope and `(organization_id, entity_type, owner_id, slug)` for user scope, both `WHERE deleted_at IS NULL`.

- [ ] **AC-2** Same migration adds `profiles.view_defaults jsonb NOT NULL DEFAULT '{}'::jsonb`. Shape: `{ "lead": "<view-uuid>", "deal": "<view-uuid>", ... }`. RPC `set_view_default(view_id uuid)` writes the entry for the caller's profile after asserting the view is readable to the caller.

- [ ] **AC-3** RLS:
  - SELECT: same-org AND (`scope='org'` OR `owner_id = app_profile_id()`); super-admin bypass.
  - INSERT: same-org; `scope='org'` requires `views:customize`; `scope='user'` requires `owner_id = app_profile_id()`.
  - UPDATE/DELETE: same. Scope/owner-id are immutable once set (CHECK in trigger).

- [ ] **AC-4** New permission `views:customize` added to the permission catalog, granted to `org_admin` (and `super_admin` implicitly).

- [ ] **AC-5** `src/lib/views/` library:
  - `listViewsForType(org_id, entity_type, profile_id, client?)` — returns org-scoped + caller's user-scoped views, sort_order: org then user, alphabetical within.
  - `getViewById(view_id, profile_id)` — readable to caller per RLS.
  - `createView`, `updateView`, `deleteView` — each writes one `audit_log` row.
  - `setDefaultView(view_id, profile_id)` — calls RPC.
  - `compileFilters(view, customFieldDefs)` — translates `filters` JSONB into a Supabase `.eq/.ilike/.gte/.lte/.in/...` chain. Pure function, tested independently.
  - `compileColumns(view, customFieldDefs)` — returns the projection list, merging built-ins with custom field keys.

- [ ] **AC-6** Filter operators per kind:
  - `string | email | phone`: `eq`, `contains`, `starts_with`, `is_empty`, `is_not_empty`
  - `number`: `eq`, `neq`, `lt`, `gt`, `between`, `is_empty`
  - `date`: `today`, `this_week`, `this_month`, `last_n_days`, `before`, `after`, `between`
  - `boolean`: `is_true`, `is_false`
  - `select`: `in`, `not_in`
  - Built-in lead `state` enum uses `in`/`not_in` from a fixed catalog.

- [ ] **AC-7** Single dispatcher `viewsAction(formData)` with intents `create | update | delete | set_default`. Permission-gated; cross-tenant filtered; audit-logged.

- [ ] **AC-8** Lead list page at `src/app/(dashboard)/dashboard/leads/page.tsx`:
  - Reads URL query: `?view=<slug>` (resolves view by slug + caller scope) **or** `?filter[...]=...&sort=...&page=...` (ad-hoc).
  - When no `view` and no ad-hoc filters, applies user's `view_defaults.lead` if set; else applies the system default "all-leads".
  - Renders columns from the resolved view's `columns` (merged with custom-field defs).
  - Pagination: 50 / page, `?page=<n>`.
  - View selector dropdown above the table (own private + org-shared + "Manage views…" link to `/admin/views`).
  - "Save current as view" button visible when an ad-hoc filter/sort differs from the resolved view.

- [ ] **AC-9** Admin page at `src/app/(admin)/admin/views/page.tsx` lists org-scoped views grouped by `entity_type`. Each group has "+ Add view" trigger + per-row edit/delete. Permission-gated by `views:customize`.

- [ ] **AC-10** Custom-field columns: when rendering the column picker, custom fields from D-020 for the entity_type are listed alongside built-ins; selected custom field columns render via the same FieldRow registry used on canvas.

- [ ] **AC-11** URL state is the source of truth. Saving an ad-hoc URL state as a view writes the same `filters`/`columns`/`sort` JSONB.

- [ ] **AC-12** Every mutation writes one `audit_log` row (`view_created | view_updated | view_deleted | view_default_set`).

- [ ] **AC-13** Tests:
  - `tests/lib/views/admin.test.ts` — CRUD + RLS scope + duplicate-slug rejection + cross-tenant guard.
  - `tests/lib/views/compile-filters.test.ts` — every operator × every kind, plus edge cases (empty, missing field, malformed JSONB).
  - `tests/lib/views/compile-columns.test.ts` — built-in + custom mix; ordering; missing field def.
  - `tests/actions/views-action.test.ts` — dispatcher branches with mocked `getCurrentUser`.
  - `tests/app/dashboard-leads-page.test.tsx` — RTL: list renders, view selector switches, ad-hoc filter updates URL, "Save as view" appears.
  - `tests/e2e/leads-list.spec.ts` — `@smoke` Playwright: rep loads `/dashboard/leads`, switches to a saved view, sees filtered rows.

- [ ] **AC-14** Coverage on touched files: ≥80% lines / ≥90% branches.

- [ ] **AC-15** CRITICAL security findings = 0 after `security-scanner` (Gate 4).

---

## Non-goals (deferred)

- **Multi-sort** — V2 (V1 supports one sort dim).
- **Drag-drop column reorder UI** — V2 (V1 uses select dropdown with up/down buttons).
- **View scheduling / digest email** — V2 (folds into D-414 scheduled-reports work).
- **Group-by / pivot in list views** — D-414 reporting territory, not views.
- **Cross-entity views** ("leads + their deals") — V2.
- **Operator catalog beyond built-ins above** (regex, fuzzy match, etc.) — V2.
- **Deal / Contact / Unit list pages** — own directives (D-410-delta) will land them and consume this engine.
- **Public / share-by-link views** — V2.

---

## Stack

- New: `src/lib/views/{admin,types,compile-filters,compile-columns}.ts`, `src/app/api/views/action.ts`, `src/components/views/view-selector.tsx`, `src/components/views/views-manager.tsx`, `src/app/(dashboard)/dashboard/leads/page.tsx`, `src/app/(admin)/admin/views/page.tsx`, `src/app/(admin)/admin/views/new-view-dialog.tsx`.
- shadcn: `select`, `popover`, `button`, `dialog`, `input`, `label`, `table` (probable additions if missing — install via `bash scripts/v5/install-shadcn.sh <comp>`).
- Migration: `supabase/migrations/20260511120000_custom_views.sql`.
- Reuses: `lib/auth/getCurrentUser`, `lib/auth/permissions`, `lib/customfields/admin.listFieldsForType`, `components/canvas/field-renderers`.

---

## Authority

- Constitution II — Tenant isolation (`organization_id` on every row + RLS).
- Constitution III — Provenance (every mutation has `created_by`, `updated_by`, `audit_log` row).
- Constitution VII — Stack discipline (Next.js + Supabase + shadcn; no external query-builder lib).
- Constitution IX — Intelligent Canvas Is The Interface (list page links back to canvas via `[id]` route).

---

## Operator follow-ups (post-merge)

- [ ] Apply migration; seed one org-shared view "Hot Meta leads (this month)" for the demo org.
- [ ] Smoke: rep visits `/dashboard/leads`, sees system-default view; org_admin visits `/admin/views`, creates "My team's stale leads", switches to it on the list; UI persists across reload via URL.
- [ ] Telemetry: emit `view.applied` event with `entity_type`, `view_id`, `is_default`, `is_org_scope` so we can measure PRD §4 V1 acceptance "≥ 80% of active org admins use the reporting layer" (proxy: views adoption).
- [ ] When D-410-delta (deal/contact/unit list pages) lands, those pages reuse `listViewsForType` + `compileFilters` from this directive.

---

## Risks & decisions

- **Filter JSON shape stability:** the filters JSONB grammar is locked at AC-6. Future operator additions are additive (extra cases in a discriminated union). Will land in baseline 119 (reporting engine contract) when D-414 starts.
- **`view_defaults` on profile vs separate table:** going with JSONB on `profiles` for fewer joins; each entity-type maps to a UUID. Acceptable cardinality (≤ 11 entity types × 1 UUID each).
- **Slug collisions across scope:** partial unique indexes split org-scope vs user-scope namespaces. An org-shared "stale" and a user's private "stale" coexist.
- **D-020 deletion edge case:** when a custom field def is soft-deleted, views referencing it surface "field unavailable" rather than 500. `compileColumns` filters out deleted refs; `compileFilters` returns a typed `unavailableField` warning.
