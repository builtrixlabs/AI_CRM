# Directive 020 — Custom fields engine

**Kind:** feature (V1)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch)
**Created:** 2026-05-09
**Builds on:** D-002 (`data.custom` JSONB slot reserved on every node), D-006 (canvas FieldRow renderer registry)

## Problem

`/admin/tables` is a placeholder. The `data.custom` JSONB slot has been reserved on every node since baseline 110, but org_admins can't define which keys live there or render them on the canvas. Today the slot is unused.

D-020 ships:
1. A `custom_field_definitions` table per (organization_id, node_type, field_key)
2. A management surface at `/admin/tables` to define / edit / delete fields per node_type
3. Canvas integration: lead canvas reads definitions for `node_type='lead'`, renders custom field rows under the existing FieldBlock

## Success criteria

- [ ] **AC-1** New table `custom_field_definitions` keyed by `(organization_id, node_type, field_key)` UNIQUE. Cols: label, kind (string/number/email/phone/date/boolean/select), required (bool), options jsonb (for select), sort_order, full provenance.
- [ ] **AC-2** RLS: SELECT same-org; INSERT/UPDATE/DELETE gated by `tables:customize` permission (already in catalog, granted to org_admin).
- [ ] **AC-3** Page at `/admin/tables` lists definitions grouped by node_type. Each group has "+ Add field" trigger + per-row edit/delete.
- [ ] **AC-4** Single dispatcher `customFieldsAction(formData)` with intents `create | update | delete`.
- [ ] **AC-5** Canvas integration: a new `CustomFieldsBlock` Server Component fetches `listFieldsForType(org_id, "lead")` and renders rows from `lead.data.custom` using the same FieldRow primitive.
- [ ] **AC-6** Field kinds map to FieldKind values; `select` falls back to `string` rendering with the chosen value.
- [ ] **AC-7** Every mutation writes one `audit_log` row.
- [ ] **AC-8** Cross-tenant guard: every read/write filters by caller's `organization_id`.

## Tests

- [ ] Unit tests for lib helpers (create, update, delete, list, cross-tenant).
- [ ] Action tests with mocked `getCurrentUser`.
- [ ] RTL test for the page renders sections.

## Non-goals

- Validation enforcement on lead/deal save (V2 — wire definitions into Zod schemas).
- Field-level RLS or per-role visibility (V2).
- Full-text search across custom fields (V2).
- Date pickers / boolean toggles in the EditLeadForm (V2 — for now custom fields are read-only on canvas; edit happens via Cmd+K free-form note for V1).

## Stack

Migration + lib + actions + page + new canvas component. shadcn Select/Input/Switch via form-submit pattern.
