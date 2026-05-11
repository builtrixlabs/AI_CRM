# Directive 410 — Canvas + list delta (Contact canvas, Contacts list, Deals list)

**Kind:** feature (V4 / PRD v3.0 D-110-delta)
**Status:** AUTHORIZED — operator approved 2026-05-11 (revised Phase A, A2)
**Branch target:** `v4`
**Source:** `docs/PRD-v3.0.md` §3 P8 + §4 D-110; `docs/plans/v4-plan-v1.md` Phase A2
**Builds on:** D-002 (nodes schema), D-007 (LeadCanvas pattern), D-020 (custom fields), D-321 (deal canvas + transitions), D-413 (custom views engine)

---

## Problem

PRD v3.0 §3 P8 declares Lead, Deal, Contact, Project, Tower, Unit as first-class canvas entities. Current state on v4 (post PR #50):

| Entity | Canvas | List page |
|---|---|---|
| Lead | ✓ (V0 D-007) | ✓ (D-413) |
| Deal | ✓ (V3 D-321, read-only) | **missing** |
| Contact | **missing** | **missing** |
| Property | admin edit only | (admin only) |
| Unit | admin edit only | (admin only) |

The smallest unit of progress that strengthens the data model AND validates the D-413 engine on a 2nd / 3rd entity_type is:

D-410 ships:
1. **Contact canvas** at `/dashboard/contacts/[id]` — read-only, mirrors deal-canvas card layout (info, linked leads, linked deals, activity stream). Custom fields integrated via D-020 `CustomFieldsBlock` for `node_type='contact'`.
2. **Contacts list page** at `/dashboard/contacts` — uses the D-413 views engine on `entity_type='contact'`.
3. **Deals list page** at `/dashboard/deals` — uses the D-413 views engine on `entity_type='deal'`. Existing `/dashboard/deals/[id]` canvas unchanged.

Customer-facing **Property** and **Unit** canvases (PRD §3 P8) deferred to a follow-on directive — admin pages from D-320 already cover the management slice; the customer-rep-facing version needs design work distinct from this delta.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** No migration needed — contacts/deals already exist as `nodes` rows (`node_type='contact'|'deal'`, D-002). Reuse existing schema.

- [ ] **AC-2** New `src/lib/contacts/api.ts` mirroring `src/lib/leads/api.ts` shape:
  - `getContactCanvas(id, client?)` — returns `{ contact, linked_leads, linked_deals, activities }` filtered by org scope.
  - `listContacts(org_id, workspace_ids?, filter?, client?)` — used by list page helpers.
  - Cross-tenant guard: every read filters by `organization_id`.

- [ ] **AC-3** Contact canvas page at `src/app/(dashboard)/dashboard/contacts/[id]/page.tsx`:
  - Server component, `dynamic = "force-dynamic"`.
  - Renders: contact header (name, base info), Cards for info / linked leads / linked deals / activity stream / CustomFieldsBlock.
  - Permission: `contacts:view` gates; 403 redirect if absent.
  - `notFound()` when row doesn't exist or is cross-tenant.

- [ ] **AC-4** Contacts list page at `src/app/(dashboard)/dashboard/contacts/page.tsx`:
  - Uses `listViewsForType(org, 'contact', profile_id)` + `listNodesByView({entity_type: 'contact'})` from D-413.
  - Default columns: `label`, `created_at` (no `state` — contact is buyer-master, no state-machine).
  - Permission: `contacts:view`. `ViewSelector` dropdown; "Manage views" link for `views:customize`.
  - Identical structural shape to `/dashboard/leads` page; the only differences are columns + entity_type + permission key.

- [ ] **AC-5** Deals list page at `src/app/(dashboard)/dashboard/deals/page.tsx`:
  - Uses D-413 views engine with `entity_type='deal'`.
  - Default columns: `label`, `state`, `created_at`. (Deal `stage` is stored in `data->>stage` per D-321 — surfaced as a custom-key column.)
  - Permission: `deals:view`.

- [ ] **AC-6** No new permissions. Existing `contacts:view`, `contacts:create`, `contacts:edit`, `contacts:merge`, `deals:view` are already in the catalog (D-003) and granted via `READ_ONLY_OPERATIONAL` / `SALES_REP_OPERATIONAL`.

- [ ] **AC-7** Dashboard home (`/dashboard`) gets two new nav links: "Contacts" + "Deals" (added beside existing "View demo lead canvas" link). No design polish required at this stage — functional anchors only.

- [ ] **AC-8** D-413 `entity_type` set already includes `'deal'` and `'contact'` (mirror of D-002 CHECK). Views created with those entity_types resolve correctly on both new list pages.

- [ ] **AC-9** Tests:
  - `tests/lib/contacts/api.test.ts` — unit: `getContactCanvas` cross-tenant guard, `listContacts` org-scoping. Mocked supabase client following the customfields/views test pattern.
  - `tests/app/dashboard-contacts-list.test.tsx` — RTL render smoke: list renders, view selector visible, custom-field column shown when defined.
  - `tests/app/dashboard-deals-list.test.tsx` — RTL render smoke for deals list.

- [ ] **AC-10** Coverage on `src/lib/contacts/**` + new pages: ≥ 80% lines / ≥ 90% branches.

- [ ] **AC-11** All 10 V4 stopping-criteria gates pass (CLAUDE.md §STOPPING CRITERIA).

---

## Non-goals (deferred to follow-up directives)

- **Contact editing UI** — read-only V1; edit is in D-410-delta-2.
- **Contact merge UI** — `contacts:merge` perm exists but UI is deferred. Backend helper `mergeContacts(...)` may land if trivial.
- **Customer-facing Property / Unit canvases** — admin pages from D-320 cover the management slice; customer view is separate scope work.
- **Contact creation UI** — V0 D-007 ships lead-create; contact-create follows same pattern but is out of D-410's blast radius.
- **Real-time activity stream on contact canvas** — read-only at page load (matches deal canvas D-321).
- **Deal stage edit on canvas** — D-321 was read-only; promoting to edit is V3.x-deferred.
- **Cross-entity links (one contact → many leads/deals/site visits)** — show on canvas via `edges` table only if trivially achievable; no new schema for this directive.

---

## Stack

- New: `src/lib/contacts/{api,types,index}.ts`; `src/app/(dashboard)/dashboard/contacts/page.tsx` + `[id]/page.tsx`; `src/app/(dashboard)/dashboard/deals/page.tsx`.
- Modified: `src/app/(dashboard)/dashboard/page.tsx` (nav links).
- Reuses: `src/lib/canvas/api`, `src/lib/views/*`, `src/components/canvas/custom-fields-block`, `src/components/views/view-selector`, `src/components/ui/{card,table}`.
- No migrations.
- No new permissions.

---

## Authority

- Constitution II — tenant isolation (`organization_id` on every read).
- Constitution III — provenance (read paths preserve `created_by/at`).
- Constitution IX — Intelligent Canvas Is The Interface (every node-type entity has its own canvas).
- D-413 — list-page-as-engine-host pattern reused identically.

---

## Operator follow-ups (post-merge)

- [ ] Smoke: rep opens `/dashboard/contacts` → list renders. Clicks a contact → canvas opens. Linked leads/deals show up if seed data has the edges.
- [ ] Optional: seed an org-shared view "All buyers" on contact entity via `/admin/views`.
- [ ] Vercel preview env: the 500-on-preview issue (see PR #50 thread) blocks gate 7 verification. Fixing preview env vars unblocks live UI checks across V4 directives.

---

## Risks & decisions

- **Deal `stage` column vs nodes.state:** D-321 stores deal stage in `data->>stage`, not nodes.state. The list-page default columns reflect that — `state` shown for visibility (will be null for deals) and `stage` rendered as a custom-field-style column via D-413's `data->...->>` path. Cleaner long-term: a future migration moves deal stage to nodes.state, but that's a D-321 forward-port discussion, not D-410's scope.
- **Contact `state`:** contacts are buyer-master (no state machine). Default contact column set excludes `state`.
- **Activity stream on contact canvas:** reuses the `edges` + `activities` pattern from deal canvas. Where the contact has no inbound activity edges, the section renders "No activity recorded yet."
