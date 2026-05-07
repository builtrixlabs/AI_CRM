# Directive 003 — RBAC Engine

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §4 D-003 + docs/PRD.md §9
**Authority:** memory/constitution.md (Principles I tier-bounded authority, II tenant isolation, IV audit, VIII single source of truth)

---

## Problem

D-001 shipped a minimal RBAC resolver that covers routing only. D-002 added node mutations that need permission gates (`leads:create`, `leads:edit`, `agents:approve_T3`, etc.). D-004 super_admin surfaces and D-005 org_admin cockpit will check permissions on every action.

D-003 ships:

1. The full ~120-permission catalog per PRD §9.3, organized by domain (leads, deals, contacts, properties, activities, calls, campaigns, customization, agents, directives, audit, billing, support, templates).
2. The `role_permission_overrides` table per PRD §9.2 with full provenance — per-org allow/deny on (role × permission), `mode` enum, `reason` required, audited.
3. Hardening of the three-layer resolver — base UNION bridge UNION allow EXCEPT deny — with deny-wins precedence and silent filtering of PLATFORM_ONLY permissions on non-super_admin.
4. Server-action helpers (`requirePermission`, `hasPermission`, `requireAnyOf`, typed `PermissionDenied` error) used by every server action that mutates state.
5. PLATFORM_ONLY_PERMISSIONS expanded to cover every platform-tier permission (not just `platform:manage`).

`src/lib/auth/rbac.ts` is the **single authoritative source** for the catalog (Constitution VIII). Adding a permission is a TS-literal change. Adding a role is an enum migration on `base_role`.

## Success criteria

- [ ] `rbac.ts` exports a typed `Permission` union of all ~120 strings (no more `string` placeholder).
- [ ] Per-base-role base permission map covers each of the 9 roles per PRD §9.4 matrix; sampled cells verified by unit tests.
- [ ] PLATFORM_ONLY_PERMISSIONS contains every platform-tier permission; verified that an allow override granting any of them to a non-super_admin role is silently dropped.
- [ ] `role_permission_overrides` table exists with provenance fields; RLS scopes by `public.app_org_id()`; insertion of a PLATFORM_ONLY permission row is rejected by a Postgres CHECK / before-insert trigger.
- [ ] Three-layer resolver test matrix covers: deny-wins, allow grants previously-denied, allow override of PLATFORM_ONLY filtered, bridge UNION across multiple workspaces, super_admin retains platform perms regardless of override input.
- [ ] `requirePermission(user, perm)` throws `PermissionDenied` if the user lacks the permission; `hasPermission` returns boolean. Both consult `effectivePermissions` once and cache per-request.
- [ ] Server actions in subsequent directives (D-004+) call `requirePermission` BEFORE any mutation — D-003 does NOT modify D-004+ code, but the helpers are ready.
- [ ] Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/auth/`.
- [ ] All untagged tests pass; D-001 + D-002 suites still green.

## Constraints

- **Stack** (Constitution VII): no new deps. Pure TypeScript + existing Supabase admin client for the override table.
- **Migration**: additive only, soft-delete only.
- **Audit**: every override INSERT / UPDATE / soft-delete writes one `audit_log` row (Constitution IV).
- **Constitutional binding**: `PLATFORM_ONLY_PERMISSIONS` is a compile-time set whose membership is locked. Removing a perm requires an amendment directive.
- **No new UI**: D-003 ships library + DB only. Override authoring UI is in D-005.
- **TDD** (V5 D-06): each task = RED test → minimal impl → REFACTOR.

## Out of scope (explicit non-goals)

- Override authoring UI for org_admin (D-005)
- Auto-suggest permission templates ("workspace_admin + leads:bulk_import") (V2)
- Permission delegation (workspace_admin granting custom perms to a manager) — V2
- Audit log surfacing of override changes via UI (D-004)
- Feature-flag-style permission rollouts (post-V1)
- Cross-workspace permission inheritance (PRD §9.1 says workspace-scoped; cross-WS happens via bridge with `workspace_id NULL`)

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md`:

- **tenant-isolation-via-jwt-claim** — `role_permission_overrides` RLS scoped by `public.app_org_id()`.
- **provenance-as-not-null-columns** — `role_permission_overrides` inherits the standard provenance set.
- **append-only-via-trigger** — overrides themselves are CRUD (admins edit them via D-005); but every change writes to `audit_log` which is append-only.
- **postgrest-notify-after-ddl** — migration ends with `NOTIFY pgrst, 'reload schema'` so the new table is reachable from the JS client.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/003-rbac-engine/`.
- Estimate: **M** (~120 string literals, 1 migration, ~10 unit tests, ~3 integration tests, 2-3 working sessions).
- The PERMISSION catalog itself is the trickiest decision: every perm shipped here becomes a hard contract for every later directive. Reviewer must walk PRD §9.3 + §9.4 against the proposed catalog.
- D-003 does NOT add per-permission audit; granular tracking ("user X tried perm Y") is in D-004 super_admin audit drill-down. The `audit_log` row this directive writes is for *override changes*, not check failures.
