# Spec — 001-multi-tenancy-foundation

## Acceptance criteria

### Routing & redirects (observable in preview URL)

- [ ] **AC-1** super_admin GET `/dashboard` → 302 `/platform`
- [ ] **AC-2** super_admin GET `/admin` → 302 `/platform`
- [ ] **AC-3** org_admin GET `/platform` → 302 `/admin`
- [ ] **AC-4** sales_rep GET `/platform` → 302 `/dashboard`
- [ ] **AC-5** sales_rep GET `/admin` → 302 `/dashboard`
- [ ] **AC-6** channel_partner GET `/admin` → 302 `/dashboard` (or 403 if scope-violating)
- [ ] **AC-7** unauthenticated GET any protected route → 302 `/auth/sign-in`
- [ ] **AC-8** service_account user (agent) GET any UI route → 401 JSON

### RLS (positive + negative)

- [ ] **AC-9** sales_rep in Org A SELECT from `profiles` returns only Org A rows.
- [ ] **AC-10** super_admin SELECT from `profiles` of any operational org returns **0 rows** (zero operational data access).
- [ ] **AC-11** channel_partner in Workspace X submitting CP A: SELECT scoped table → 0 rows for CP B's submissions.
- [ ] **AC-12** UPDATE on `audit_log` raises error for *every* role including `service_role` (RLS USING/WITH CHECK false on UPDATE/DELETE).
- [ ] **AC-13** DELETE on `audit_log` likewise rejected for every role.

### RBAC resolver

- [ ] **AC-14** `base UNION bridge UNION allow EXCEPT deny` — deny wins (allow + deny on same perm → not granted).
- [ ] **AC-15** override granting a permission listed in `PLATFORM_ONLY_PERMISSIONS` is rejected at resolve time.
- [ ] **AC-16** Bridge with `workspace_id NULL` grants permission across all workspaces in org.

### Bootstrap script

- [ ] **AC-17** `scripts/bootstrap-super-admin.sh founder@builtrix.in` creates a profile row with `base_role='super_admin'`, sends a Supabase Auth magic-link, writes one `audit_log` row with `action='bootstrap_super_admin'`.
- [ ] **AC-18** Re-running the script with the same email is idempotent (no second profile, no second magic-link, but a `bootstrap_super_admin_replay` audit row).

### Quality gates (V5 D-06 / D-07)

- [ ] All untagged tests pass (100%).
- [ ] Coverage ≥80% lines / ≥90% branches on `src/lib/auth/`.
- [ ] CRITICAL security findings = 0 after auto-fix loop (3× max).
- [ ] HIGH/MED security findings logged to `memory/logs/security/` and parallel-fixed where in scope.

---

## Data model

### `001_orgs_and_workspaces.sql`

```sql
-- Organization: top-level tenant boundary.
CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  rera_number     text NULL,
  gstin           text NULL,
  primary_contact_email text NULL,
  -- Plan tier resolution lives in subscriptions table (D-005). This is a stub.
  plan_tier       text NOT NULL DEFAULT 'starter'
                  CHECK (plan_tier IN ('starter','professional','enterprise','custom')),
  -- Onboarding state machine (driven by D-005 wizard).
  onboarding_state jsonb NOT NULL DEFAULT '{"completed_steps":[],"current_step":"org_details"}'::jsonb,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL CHECK (created_via IN
                  ('manual','call_audit','whatsapp','email','api_sync',
                   'ai_extraction','import','cp_portal','mih_event','system')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence BETWEEN 0 AND 1),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

-- Workspace: scope unit inside an org (e.g., "Lodha Bangalore Sales").
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  slug            text NOT NULL,
  name            text NOT NULL,
  -- Provenance (same set; trigger or shared base type enforces)
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
  deleted_reason  text NULL,
  UNIQUE (organization_id, slug)
);

-- Team: optional grouping inside a workspace (sales_rep ⊆ team ⊆ workspace).
CREATE TABLE teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  -- + provenance (same set)
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
  deleted_reason  text NULL,
  UNIQUE (workspace_id, name)
);
```

### `002_users_and_auth.sql`

```sql
CREATE TYPE base_role AS ENUM (
  'super_admin', 'org_owner', 'org_admin', 'workspace_admin',
  'manager', 'sales_rep', 'read_only', 'channel_partner', 'service_account'
);

-- profiles: 1-1 with auth.users, augmented with org/role.
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NULL REFERENCES organizations(id),  -- NULL for super_admin
  email           text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  base_role       base_role NOT NULL,
  -- + provenance (same set)
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
  deleted_reason  text NULL,
  -- super_admin must NOT have org_id; everyone else MUST.
  CONSTRAINT profiles_super_admin_no_org
    CHECK ((base_role = 'super_admin' AND organization_id IS NULL) OR
           (base_role <> 'super_admin' AND organization_id IS NOT NULL))
);
```

### `003_user_app_roles_bridge.sql`

```sql
-- App roles (workspace-scoped permissions on top of base_role).
-- product_id is forward-compat for Call Audit / Legal Auditor cross-product roles.
CREATE TABLE user_app_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    uuid NULL REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL = all in org
  product_id      text NOT NULL DEFAULT 'crm',
  app_role        text NOT NULL,           -- one of GRANTABLE_APP_ROLES; validated app-side (D-003)
  granted_by      uuid NOT NULL REFERENCES profiles(id),
  reason          text NULL,
  -- + provenance (same set)
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
  deleted_reason  text NULL,
  UNIQUE (user_id, organization_id, workspace_id, product_id, app_role)
);
```

### `004_audit_log.sql`

Schema matches Constitution IV verbatim:

```sql
CREATE TABLE audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts                timestamptz NOT NULL DEFAULT now(),
  actor_id          uuid NOT NULL,
  actor_type        text NOT NULL CHECK (actor_type IN ('user','agent','system')),
  actor_role        text NOT NULL,
  on_behalf_of      uuid NULL,
  workspace_id      uuid NULL REFERENCES workspaces(id),
  organization_id   uuid NULL REFERENCES organizations(id),
  table_name        text NOT NULL,
  record_id         uuid NULL,
  action            text NOT NULL,
  diff              jsonb NULL,
  agent_tier        text NULL CHECK (agent_tier IS NULL OR agent_tier IN ('T0','T1','T2','T3','T4')),
  prompt_version    text NULL,
  nl_input          text NULL,
  compiled_artifact jsonb NULL,
  reasoning         text NULL,
  supersedes        uuid NULL REFERENCES audit_log(id)
);

-- Append-only: enforced via RLS.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- INSERT allowed for service_role only; no UPDATE / DELETE policies (= forbidden).
CREATE POLICY audit_log_insert_service ON audit_log
  FOR INSERT TO service_role WITH CHECK (true);
-- SELECT: anyone in the same org+workspace; super_admin sees platform-wide rows
-- (action LIKE 'platform_%' AND organization_id IS NULL).
CREATE POLICY audit_log_select_org ON audit_log
  FOR SELECT TO authenticated USING (
    organization_id = current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
  );
```

### `005_rls_policies.sql`

For each of `organizations`, `workspaces`, `teams`, `profiles`, `user_app_roles`:

```sql
ALTER TABLE <T> ENABLE ROW LEVEL SECURITY;

-- SELECT: row.organization_id = caller's org_id from JWT claim
CREATE POLICY <T>_select_org ON <T> FOR SELECT TO authenticated USING (
  organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  AND deleted_at IS NULL
);

-- INSERT/UPDATE: same boundary + WITH CHECK
CREATE POLICY <T>_write_org ON <T> FOR INSERT TO authenticated WITH CHECK (
  organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
);

-- super_admin gets ZERO rows from operational tables.
-- (Default-deny holds; we add no super_admin-permissive policy here.)
```

For `channel_partner` scope (Workspace X), enforced via `submitted_by_user_id = auth.uid()` on
*future* `leads` table (D-002+); D-001 just sets up the routing redirect.

---

## API contracts

### Routes (placeholders only — no business logic)

| Path | Status | Purpose |
|---|---|---|
| `/platform` | 200, super_admin only | Placeholder: "Platform home — D-004 surfaces incoming." |
| `/admin` | 200, org_admin only | Placeholder: "Admin cockpit — D-005 incoming." |
| `/dashboard` | 200, operational | Placeholder: "Canvas — D-006/D-007 incoming." |
| `/auth/sign-in` | 200, public | Supabase magic-link form. |
| `/auth/callback` | 302 | Supabase Auth callback handler. |
| `/api/auth/whoami` | 200 JSON | Returns `getCurrentUser()` payload. Used by tests. |
| `/403` | 403 | Forbidden page (no auto-redirect, just "you don't have access"). |

### Server-side helpers (`src/lib/auth/`)

```ts
// src/lib/auth/getCurrentUser.ts
export type CurrentUser = {
  user:        { id: string; email: string };       // from supabase.auth
  profile:     { id: string; display_name: string; base_role: BaseRole };
  org_id:      string | null;                       // null for super_admin
  workspace_ids: string[];                          // all WS the user has bridge rows in
  app_roles:   Array<{ workspace_id: string | null; app_role: string }>;
};
export async function getCurrentUser(): Promise<CurrentUser | null>;
```

```ts
// src/middleware.ts (edge runtime)
// Decision matrix:
//   no auth                    → 302 /auth/sign-in
//   service_account            → 401 (UI routes only)
//   super_admin && !/platform  → 302 /platform
//   org_admin   && /platform   → 302 /admin
//   operational && /platform   → 302 /dashboard
//   operational && /admin      → 302 /dashboard
//   channel_partner && /admin  → 302 /dashboard
```

### RBAC resolver (`src/lib/auth/rbac.ts`)

```ts
// D-001 ships SHELL only. Permission catalog (~120 perms) lands in D-003.
export type Permission = string;   // narrowed to a literal union in D-003
export const PLATFORM_ONLY_PERMISSIONS: ReadonlySet<Permission>;
export function effectivePermissions(args: {
  base_role: BaseRole;
  bridge_app_roles: string[];
  org_allow_overrides: Permission[];
  org_deny_overrides: Permission[];
}): Set<Permission>;
```

### Bootstrap script (`scripts/bootstrap-super-admin.sh`)

```
Usage: scripts/bootstrap-super-admin.sh <email>

1. Validates env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required.
2. Idempotent check: SELECT id FROM profiles WHERE email=$1.
   - If exists with base_role='super_admin' → log replay audit row, exit 0.
   - If exists with different role → fail with explicit error.
3. INSERT INTO profiles (id, organization_id=NULL, email, display_name, base_role='super_admin', ...).
4. Call supabase.auth.admin.inviteUserByEmail(email).
5. INSERT INTO audit_log (actor_type='system', action='bootstrap_super_admin', ...).
```

---

## UI surface

- **Pages**: 4 placeholder pages + 1 sign-in form + 1 403 page.
- **shadcn components needed**: none yet (plain HTML + Tailwind for placeholders); D-004/D-005 install shadcn proper.
- **Motion**: none — placeholders only.

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | Supabase JWT custom claim `organization_id` requires a custom auth hook (PG function set on `auth.users`). Does V5 ship a pattern for this? | Author the JWT-claim function in `001_orgs_and_workspaces.sql` migration alongside `profiles`. Add to spec. |
| RQ-2 | Test-suite database: integration tests need a real Supabase instance to exercise RLS. Use Supabase preview branches per feature, or a local docker-compose? | Recommend Supabase preview branch for CI; local supabase for dev. Confirm in Plan Mode. |
| RQ-3 | super_admin negative test (AC-10) requires *some* operational rows to exist in the test fixture so we can prove super_admin sees zero. | Test fixture seeds 1 org + 1 sales_rep + 1 placeholder profile per org; super_admin probe SELECT must return 0. |
| RQ-4 | `audit_log` insert path: do we write from app code (server action) or from a Postgres trigger? | App code (explicit, easier to test, simpler diff capture). Trigger-based audit deferred to V1 hardening. |
| RQ-5 | The constitution says provenance fields are enforced "via Postgres trigger or shared base type." We're choosing column-by-column NOT NULL with app-set defaults. | Document choice in `memory/decisions.md` after Plan Mode approval. |
