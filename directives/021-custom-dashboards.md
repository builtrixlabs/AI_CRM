# Directive 021 — Custom dashboards

**Kind:** feature (V1)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch)
**Created:** 2026-05-09
**Builds on:** D-001 (audit_log), D-007 (leads + states), D-011 (directive_invocations), D-018 (profiles), D-019 (agent_org_configs), D-020 (custom field schema)

## Problem

`/admin/dashboards` is a placeholder. Org admins want at-a-glance views of "what's happening in this org right now" without writing SQL. D-021 ships a bounded dashboard builder reading from existing tables.

## Success criteria

- [ ] **AC-1** New table `dashboard_definitions(organization_id, name, layout jsonb)` with provenance + RLS gated by `dashboards:customize` (mutations) and `dashboards:view_org_wide` (reads).
- [ ] **AC-2** `layout.widgets` is an array of `{ type: WidgetType, title?: string }`, where WidgetType is one of `lead_count_by_state | directive_fires_24h | active_users_count | recent_leads | agent_status`.
- [ ] **AC-3** Page at `/admin/dashboards` lists own-org dashboards with "+ New dashboard" trigger.
- [ ] **AC-4** Page at `/admin/dashboards/[id]` renders the widgets.
- [ ] **AC-5** Server-side widget data fetchers query existing tables; results are passed through to widget components for rendering.
- [ ] **AC-6** Single dispatcher `dashboardsAction(formData)` with intents `create | update_layout | delete`.
- [ ] **AC-7** Every mutation writes one `audit_log` row.
- [ ] **AC-8** Cross-tenant guard: every read/write filters by caller's `organization_id`.

## Tests

- [ ] Unit tests for lib helpers (CRUD + cross-tenant).
- [ ] Action tests with mocked `getCurrentUser`.
- [ ] Widget data-fetcher tests with mocked client.

## Non-goals

- Drag-and-drop layout builder (V2 — V1 is checkbox-based widget selection).
- Per-widget filters / parameters (V2).
- Public / shared dashboards (V2).
- Cross-org platform-level dashboards (super_admin surface, separate flow).

## Stack

Migration + lib + actions + page + widget components. shadcn Card/Badge/Button.
