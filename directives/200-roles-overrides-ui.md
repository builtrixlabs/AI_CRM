# Directive 200 — `/settings/roles` permission overrides UI

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-200
**Builds on:** D-003 (role_permission_overrides table, RLS, DB-trigger guard).

---

## Problem

The `role_permission_overrides` schema is in place from D-003 with full RLS + a DB trigger that rejects platform-only permissions on org roles. There's no operator-facing UI — `/settings/roles` doesn't exist. Org admins can't tune their role catalog.

D-200 ships the UI: per-role × per-permission allow / deny toggles with a reason field.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New library `src/lib/auth/role-overrides.ts`: `listOverrides(org_id)`, `setOverride({org_id, role, permission, mode, reason, actor})`, `clearOverride({org_id, role, permission, actor})`. Audit-logged.
- [ ] **AC-2** New page `/settings/roles/page.tsx` (Server Component, `settings:manage_roles` gate). Default view shows the role picker + the picked role's permissions.
- [ ] **AC-3** Permission rows grouped by category (Leads, Deals, Site visits, Channel partner, Org account plane, etc. — derived from the comments in `rbac.ts`).
- [ ] **AC-4** Per-row state derived from BASE_ROLE_PERMS + bridge + overrides:
  - Default (set by base role) — neutral toggle, "default: granted/denied"
  - Allow override — green badge "allow"
  - Deny override — red badge "deny"
  - Platform-only — grey, locked, tooltip "platform-only — cannot grant to org roles"
- [ ] **AC-5** Click a permission row → side dialog to allow / deny / reset, with reason field (required).
- [ ] **AC-6** Server actions: setOverrideAction, clearOverrideAction. Both audit-logged + `revalidatePath`.
- [ ] **AC-7** Cross-tenant guard: every read/write filters by caller's `organization_id`.

## Tests

- [ ] **AC-8** Unit tests for `setOverride` (allow / deny / reason required / platform-only refusal happens at trigger but lib should pre-validate to give a friendlier error).
- [ ] **AC-9** Unit tests for `listOverrides` (returns only own-org rows, latest-wins on duplicate (role, permission)).
- [ ] **AC-10** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Cross-org bulk override import — V3.
- Audit replay UI for "who changed permission X for role Y" — V3 (the audit_log is queryable from `/platform/audit`).

## Stack

shadcn Card / Dialog / Badge + existing rbac.ts catalog + existing role_permission_overrides table.
