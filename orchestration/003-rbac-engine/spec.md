# Spec — 003-rbac-engine

## Acceptance criteria

### Permission catalog (`src/lib/auth/rbac.ts`)

- [ ] **AC-1** `Permission` is a literal union of ~120 strings (no longer a bare `string` alias).
- [ ] **AC-2** `BASE_ROLE_PERMS` covers all 9 base roles. Every role's set is a subset of the catalog.
- [ ] **AC-3** `PLATFORM_ONLY_PERMISSIONS` includes every platform-tier permission (10 total per PRD §4.2).
- [ ] **AC-4** Type-level: passing a non-catalog string to `effectivePermissions` is a TS error at compile time. (Verified via a `@ts-expect-error` test fixture.)

### Role × permission matrix (sampled, 25 cells from PRD §9.4)

For each (role, permission) tuple in the matrix below, `effectivePermissions({ base_role: role, ...empty })` reflects the expected presence:

| Role | Has | Doesn't have |
|---|---|---|
| `super_admin` | platform:manage, organizations:create, audit:view | leads:create, deals:close_won |
| `org_owner` | organizations:edit, billing:view, audit:view | platform:manage, leads:create |
| `org_admin` | dashboards:customize, agents:provision, directives:author | platform:manage, leads:bulk_import (without bridge) |
| `workspace_admin` | leads:assign, agents:approve_T2, agents:approve_T3 | platform:manage, dashboards:customize |
| `manager` | leads:edit, leads:assign | agents:approve_T3 (per matrix; manager approves with workspace_admin escalation), dashboards:customize |
| `sales_rep` | leads:view, leads:create, deals:view | agents:approve_T2, leads:bulk_import |
| `read_only` | leads:view, deals:view | leads:create, leads:edit |
| `channel_partner` | leads:create | leads:view (other CPs'), deals:view |
| `service_account` | (empty — set per agent at provisioning) | * |

### Resolver semantics

- [ ] **AC-5** `effectivePermissions` returns base + bridge UNION + allow EXCEPT deny.
- [ ] **AC-6** Deny wins: same permission in both allow and deny → not granted.
- [ ] **AC-7** Allow override of a PLATFORM_ONLY permission to a non-super_admin role is silently filtered (the perm is not in the result).
- [ ] **AC-8** super_admin retains every PLATFORM_ONLY perm regardless of allow/deny override input.
- [ ] **AC-9** Bridge with `workspace_id NULL` UNIONs the bridge role's permissions into the result; non-NULL workspace_id is informational here (resolver doesn't filter by workspace; that's the caller's RLS responsibility).

### `role_permission_overrides` table

- [ ] **AC-10** Table exists with columns `(id, organization_id, role text, permission text, mode 'allow'|'deny', reason text NOT NULL, ...provenance)`.
- [ ] **AC-11** UNIQUE constraint on `(organization_id, role, permission, mode) WHERE deleted_at IS NULL` — same (role, permission, mode) triple cannot appear twice for an org.
- [ ] **AC-12** A BEFORE INSERT / UPDATE trigger rejects inserting a row with `mode='allow'` and `permission ∈ PLATFORM_ONLY_PERMISSIONS`. Returns SQLSTATE `42501` with message `'PLATFORM_ONLY permission cannot be granted via override'`.
- [ ] **AC-13** RLS: select/insert/update scoped by `organization_id = public.app_org_id()`. super_admin sees zero rows.
- [ ] **AC-14** Every INSERT / UPDATE / soft-delete writes one `audit_log` row via the API helper.

### Server-action helpers (`src/lib/auth/permissions.ts`)

- [ ] **AC-15** `hasPermission(user, perm)` returns boolean using cached `effectivePermissions(user)` for the call.
- [ ] **AC-16** `requirePermission(user, perm)` throws `PermissionDenied` (with `user_id`, `perm` fields) if the user lacks it.
- [ ] **AC-17** `requireAnyOf(user, perms[])` returns the first matched perm or throws.
- [ ] **AC-18** Each helper accepts an optional pre-resolved `Set<Permission>` to avoid re-running the resolver inside a request.

### Quality gates

- [ ] All untagged tests pass; D-001 + D-002 suites still green.
- [ ] Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/auth/`.
- [ ] CRITICAL security findings = 0.

---

## Permission catalog (proposed — Plan Mode reviewer must walk this list)

```ts
// Platform (super_admin only)
"platform:manage",
"organizations:view", "organizations:create", "organizations:edit", "organizations:delete",
"organizations:manage_admins", "organizations:manage_subscriptions",
"platform_analytics:view", "platform_tickets:view", "platform_tickets:respond",

// Org-account plane (org_owner / org_admin)
"settings:manage_users", "settings:manage_roles", "settings:manage_integrations",
"subscriptions:view", "subscriptions:manage", "billing:view",
"templates:view", "templates:create", "templates:activate", "templates:approve_outbound",
"apps:manage",
"dashboards:customize", "dashboards:view_org_wide",
"tables:customize",
"agents:provision", "agents:approve_T2", "agents:approve_T3", "agents:suspend", "agents:view_activity",
"directives:author", "directives:approve", "directives:view_org_wide",
"support:create", "support:view",
"audit:view",

// Leads
"leads:view", "leads:create", "leads:edit", "leads:delete", "leads:assign",
"leads:bulk_import", "leads:export",

// Deals
"deals:view", "deals:create", "deals:edit", "deals:close_won", "deals:close_lost",

// Contacts
"contacts:view", "contacts:create", "contacts:edit", "contacts:merge",

// Properties / units
"properties:view", "properties:create", "properties:edit",
"properties:hold", "properties:release",
"units:view", "units:create", "units:edit",

// Activities / calls / campaigns
"activities:view", "activities:create", "activities:edit",
"calls:view", "calls:listen", "calls:export",
"campaigns:view", "campaigns:create", "campaigns:execute",

// Site visits
"site_visits:view", "site_visits:create", "site_visits:edit", "site_visits:cancel",

// Documents / notes
"documents:view", "documents:upload", "documents:verify", "documents:sign",
"notes:view", "notes:create", "notes:edit",

// Channel partner-specific
"cp:submit_lead", "cp:view_own_submissions", "cp:view_commissions",
```

Approximately 70 permissions in the explicit list above; PRD §9 cited "~120" — the remaining ~50 are reserved for D-004 (super_admin actions on tickets / costs / per-org analytics) and D-005 (org_admin cockpit cards), which add their own perms when shipping. D-003 lands the **stable core**; later directives extend.

---

## Data model

### Migration `20260507140000_role_permission_overrides.sql`

```sql
CREATE TABLE role_permission_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role            text NOT NULL CHECK (role IN
                  ('org_owner','org_admin','workspace_admin','manager',
                   'sales_rep','read_only','channel_partner')),
  permission      text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('allow','deny')),
  reason          text NOT NULL,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL,
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

CREATE UNIQUE INDEX role_permission_overrides_uniq
  ON role_permission_overrides (organization_id, role, permission, mode)
  WHERE deleted_at IS NULL;
```

### Migration `20260507140100_role_permission_overrides_guard.sql`

```sql
-- Reject INSERT/UPDATE that grants a PLATFORM_ONLY permission via allow override.
-- The list is duplicated here intentionally — TypeScript constant + DB constraint
-- are belt-and-suspenders defense per Constitution II.
CREATE OR REPLACE FUNCTION public.role_permission_overrides_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mode = 'allow' AND NEW.permission IN (
    'platform:manage',
    'organizations:create',
    'organizations:delete',
    'organizations:manage_admins',
    'organizations:manage_subscriptions',
    'platform_analytics:view',
    'platform_tickets:view',
    'platform_tickets:respond',
    'organizations:edit',
    'organizations:view'
  ) THEN
    RAISE EXCEPTION 'PLATFORM_ONLY permission cannot be granted via override: %',
      NEW.permission USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER role_permission_overrides_guard_trigger
  BEFORE INSERT OR UPDATE ON role_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.role_permission_overrides_guard();
```

### Migration `20260507140200_role_permission_overrides_rls.sql`

```sql
ALTER TABLE role_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY rpo_select_org ON role_permission_overrides
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY rpo_insert_org ON role_permission_overrides
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY rpo_update_org ON role_permission_overrides
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
```

---

## API contracts

### `src/lib/auth/rbac.ts` (expanded)

```ts
export type Permission = "platform:manage" | "organizations:view" | ... ;
export const PERMISSIONS: ReadonlyArray<Permission>;
export const PLATFORM_ONLY_PERMISSIONS: ReadonlySet<Permission>;
export const BASE_ROLE_PERMS: Record<BaseRole, ReadonlySet<Permission>>;
export const APP_ROLE_PERMS: Record<AppRole, ReadonlySet<Permission>>;

export function effectivePermissions(args: EffectivePermissionsArgs): Set<Permission>;
```

### `src/lib/auth/permissions.ts` (new)

```ts
export class PermissionDenied extends Error {
  constructor(public user_id: string, public perm: Permission, public org_id: string | null) { ... }
}

export function hasPermission(
  user: CurrentUser,
  perm: Permission,
  cached?: Set<Permission>
): boolean;

export function requirePermission(
  user: CurrentUser,
  perm: Permission,
  cached?: Set<Permission>
): void; // throws PermissionDenied

export function requireAnyOf(
  user: CurrentUser,
  perms: Permission[],
  cached?: Set<Permission>
): Permission; // returns first matched, throws otherwise
```

### `src/lib/auth/overrides.ts` (new — service-role helpers)

```ts
export async function listOverrides(orgId: string): Promise<Override[]>;
export async function upsertOverride(
  input: { org_id: string; role: AppRole; permission: Permission; mode: "allow"|"deny"; reason: string; actor: string }
): Promise<{ id: string }>;
export async function softDeleteOverride(id: string, actor: string, reason: string): Promise<void>;
```

Each helper writes one `audit_log` row.

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | Catalog drift between PRD §9.3, baseline 110, and `rbac.ts`. | rbac.ts is the single source (Constitution VIII). Plan-Mode reviewer confirms every PRD permission appears; future PRD edits reference rbac.ts. |
| RQ-2 | DB-side PLATFORM_ONLY list duplicates the TypeScript constant. | Document as belt-and-suspenders; add a CI script (D-014) that fails the build if the two lists drift. |
| RQ-3 | The `Permission` literal-union is large; TypeScript compile times may slow. | Acceptable today; if observable later, refactor to branded string. |
| RQ-4 | `effectivePermissions` becomes a hot path (every server action calls it). | Cache the resolved Set per request; helpers accept an optional pre-resolved set. |
| RQ-5 | Override creation could be exploited by org_admin to escalate. | DB trigger rejects PLATFORM_ONLY allow at write time (defense-in-depth on top of resolver-time silent filter). |
| RQ-6 | super_admin sees zero override rows due to RLS. Is that correct, or should super_admin see them for audit purposes? | Yes correct: super_admin reads override history via the platform-wide audit_log surface (D-004). Override table itself is operational data. |
| RQ-7 | Tests for the matrix could ossify the catalog — adding a new perm requires touching tests. | Acceptable; the test matrix IS the contract. Adding perms is intentional. |
