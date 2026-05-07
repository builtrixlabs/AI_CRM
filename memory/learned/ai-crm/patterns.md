# Learned Patterns — Builtrix AI-Native CRM

V5 auto-extracts patterns from successful directives into this file.
Each pattern records: name, confidence (1-5), first-seen directive,
description, and a code/SQL anchor.

Format:
```
## <pattern-name>  (confidence: <N>)
- First seen: <directive id>
- Last reinforced: <directive id>
- Description: <2-3 sentences>
- Anchor: <file path / line range / snippet>
```

---

## tenant-isolation-via-jwt-claim  (confidence: 1)

- First seen: D-001
- Description: Every domain table is scoped by `auth.org_id()`, a
  STABLE SQL function that reads the `organization_id` claim from the
  request JWT. The claim is populated by a Supabase Auth Hook
  (`public.custom_access_token_hook`) on every token issuance. RLS
  policies become declarative: `USING (organization_id = auth.org_id())`.
  Cross-tenant access is impossible because the predicate evaluates with
  the *caller's* claim, not arbitrary input.
- Anchor:
  - `supabase/migrations/20260507120000_orgs_and_workspaces.sql` (auth.org_id helper)
  - `supabase/migrations/20260507120100_users_and_auth.sql` (custom_access_token_hook)
  - `supabase/migrations/20260507120400_rls_policies.sql` (USING predicates)

## provenance-as-not-null-columns  (confidence: 1)

- First seen: D-001
- Description: Provenance fields (`created_by/at/via`, `updated_by/at/via`,
  `source_event_id`, `ai_confidence`, `deleted_at/by/reason`) are NOT NULL
  columns with sensible defaults. App code sets `_by` and `_via` on every
  write — never null, never magic. Soft-delete only.
- Anchor: any of `supabase/migrations/20260507120*.sql`.

## three-layer-rbac-resolver  (confidence: 1)

- First seen: D-001
- Description: Effective permissions =
  `base UNION bridge UNION allow EXCEPT deny`, with deny winning over
  allow on the same permission. PLATFORM_ONLY_PERMISSIONS are silently
  filtered for non-super_admin roles at resolve time, AND rejected at
  write time (D-003). The resolver is a pure function over plain
  `Set<Permission>`.
- Anchor: `src/lib/auth/rbac.ts`, `tests/lib/auth/rbac.test.ts`.

## append-only-via-rls-no-policy  (confidence: 1)

- First seen: D-001
- Description: `audit_log` is append-only because it has an INSERT policy
  for service_role only and *no* UPDATE or DELETE policy. With RLS
  enabled, missing policies = forbidden. Even service_role can't UPDATE
  or DELETE, on Supabase managed databases where service_role has
  `bypassrls = false`.
- Anchor: `supabase/migrations/20260507120300_audit_log.sql`.

## edge-middleware-as-routing-policy  (confidence: 1)

- First seen: D-001
- Description: Route authorization is a *pure function* (`decideRoute`)
  taking `(user, pathname)` and returning
  `{ kind: 'allow' | 'redirect' | 'unauthorized' }`. The Next.js
  `middleware.ts` is a thin adapter: build supabase client, call
  getCurrentUser, call decideRoute, translate to NextResponse. Pure
  function = trivial unit testing of every (role × surface) case.
- Anchor: `src/lib/auth/route-policy.ts`, `src/middleware.ts`,
  `tests/lib/auth/route-policy.test.ts`.

## injectable-supabase-client-for-tests  (confidence: 1)

- First seen: D-001
- Description: Functions that need a Supabase client (e.g.
  `getCurrentUser`) accept it as an optional argument. Production
  callers pass none and get a request-scoped server client; tests pass
  a mock. Avoids module-level singletons in business logic.
- Anchor: `src/lib/auth/getCurrentUser.ts`,
  `tests/lib/auth/getCurrentUser.test.ts`.
