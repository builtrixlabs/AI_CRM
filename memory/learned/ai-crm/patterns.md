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

## append-only-via-trigger  (confidence: 2)

- First seen: D-001
- Reinforced: D-001 (after empirical disproof of the RLS-only approach)
- Description: To make a table truly append-only on Supabase, use a
  `BEFORE UPDATE / DELETE / TRUNCATE` trigger that raises
  `RAISE EXCEPTION 'append-only'`. RLS no-policy is NOT enough —
  `service_role` has `bypassrls = true` by default and will succeed at
  UPDATE / DELETE on a no-policy table. Triggers run regardless of RLS
  bypass; this is the architecturally correct enforcement.
- Supersedes: an earlier tentative `append-only-via-rls-no-policy` pattern
  proven false against the live DB.
- Anchor: `supabase/migrations/20260507120500_audit_log_triggers.sql`,
  `tests/integration/audit-log-immutable.test.ts`.

## supabase-helpers-in-public-app-prefix  (confidence: 1)

- First seen: D-001
- Description: JWT-claim helper functions and other custom SQL helpers
  live in the `public` schema with an `app_` prefix (e.g.
  `public.app_org_id()`, `public.app_is_super_admin()`). Supabase
  managed databases reject `CREATE FUNCTION` in `auth.*` (SQLSTATE
  42501); the `app_` prefix avoids collision with PostgREST or pg_*
  introspection.
- Anchor: `supabase/migrations/20260507120000_orgs_and_workspaces.sql`.

## postgrest-notify-after-ddl  (confidence: 1)

- First seen: D-001 (B9 channel-partner test fixture)
- Description: When new tables / functions / policies land outside the
  normal `supabase migration up` flow (e.g. test fixtures, ad-hoc DDL),
  end the script with `NOTIFY pgrst, 'reload schema';` so PostgREST
  refreshes its schema cache and the new objects become reachable via
  the JS / REST client. Without it, calls return PGRST205
  ("Could not find the table in the schema cache") even though the
  object is present in pg_catalog.
- Anchor: `tests/fixtures/cp-test-table.sql`.

## node-data-as-jsonb-with-zod-validation  (confidence: 1)

- First seen: D-002
- Description: Polymorphic data on a single table goes in a `jsonb`
  column with `NOT NULL DEFAULT '{}'`. Type-specific shape is enforced
  in the app layer by Zod schemas (one per discriminator value). Mutation
  helpers (`createX`, `updateXData`) validate input against
  `schemaFor(type).safeParse(input.data)` BEFORE the DB write. Throws a
  typed validation error containing the Zod issues; DB never sees
  malformed input. Tests pass invalid payloads to assert the helpers
  reject without touching the client.
- Anchor: `src/lib/nodes/api.ts` + `src/lib/nodes/schemas/`.

## embedding-queue-pattern  (confidence: 1)

- First seen: D-002
- Description: For long-running async work that should not block the
  triggering write (e.g. computing embeddings on every node update),
  install a queue table + a Postgres trigger that AFTER INSERT/UPDATE OF
  the relevant columns inserts a row into the queue. The trigger function
  is `SECURITY DEFINER` so writes succeed even when the queue has no
  authenticated INSERT policy. A worker (Inngest function) processes the
  queue via cron + pg_notify event. UPDATE OF a column NOT in the
  trigger's list (e.g. `state`-only or `deleted_at`-only changes) does
  NOT enqueue — useful for separating data churn from semantic churn.
- Anchor: `supabase/migrations/20260507130400_embedding_queue.sql`.

## inngest-job-stub-deferred  (confidence: 1)

- First seen: D-002
- Description: When directive A creates infrastructure that directive B
  will populate, ship the Inngest function body as a stub that marks
  queued items `status='deferred-<future-directive>'` and logs a TODO.
  The trigger / queue / function shape is real; only the worker-body is
  empty. Future directive replaces just the body. This keeps the queue
  contract committed early so dependent directives can rely on it.
- Anchor: `src/lib/inngest/functions/embedding-refresh.ts`.

## per-run-test-slugs-for-audit-tables  (confidence: 1)

- First seen: D-002 (B9 audit-on-node-mutations test)
- Description: Integration tests that exercise paths writing to an
  append-only audit table MUST construct unique fixture slugs per run
  (e.g. `\`test-foo-${Date.now()}\``). The audit table's append-only
  trigger plus its FK to organizations means once an org has audit
  history, neither DELETE nor `ON DELETE SET NULL` can clean it up —
  static slugs collide with `_slug_key` UNIQUE constraint on the next
  run. Tests that don't write audit rows can still use static slugs.
- Anchor: `tests/integration/audit-on-node-mutations.test.ts`.

## permission-catalog-as-literal-union  (confidence: 1)

- First seen: D-003
- Description: For systems where a fixed string set is referenced from
  many places (permissions, event types, agent kinds, etc.), define the
  catalog as `const X = [...] as const` and derive the type with
  `(typeof X)[number]`. Ban a sibling `string` alias. Result: TypeScript
  rejects unknown members at compile time, callers get autocomplete, and
  there's exactly one source. A "no orphans" unit test asserts every
  catalog member is referenced from at least one downstream map.
- Anchor: `src/lib/auth/rbac.ts` (PERMISSIONS / Permission /
  BASE_ROLE_PERMS), `tests/lib/auth/permission-catalog.test.ts`.

## belt-and-suspenders-platform-only  (confidence: 1)

- First seen: D-003
- Description: For invariants that protect against escalation
  (PLATFORM_ONLY override rejection, audit-log immutability, RLS), enforce
  in BOTH layers — the application resolver AND a DB constraint or
  trigger. Resolver protects normal authenticated paths; DB protects
  against bypass paths (service-role writes, future agents writing
  directly). Drift detection (CI script that diffs the two lists)
  is a follow-up; the cost of duplication is far less than the cost of
  a single-layer escape.
- Anchor: `src/lib/auth/rbac.ts` PLATFORM_ONLY_PERMISSIONS +
  `supabase/migrations/20260507140100_role_permission_overrides_guard.sql`.

## cached-resolver-set-per-request  (confidence: 1)

- First seen: D-003
- Description: Permission / authz helpers accept an optional pre-resolved
  `Set<Permission>` argument so server actions can resolve effective
  permissions ONCE per request and pass it to every gate site. No global
  cache, no Next.js `cache()` integration — the data flow stays explicit.
  Hot paths benefit; cold paths just call the resolver inline.
- Anchor: `src/lib/auth/permissions.ts` (hasPermission /
  requirePermission / requireAnyOf accept `cached?: Set<Permission>`).

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
