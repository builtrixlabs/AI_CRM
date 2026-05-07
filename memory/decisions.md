# Architectural Decisions

Append-only record of decisions made during the build. Each entry: date,
directive, decision, alternatives considered, rationale.

---

## 2026-05-07 — D-001 Multi-tenancy foundation

### D-001.1 Provenance enforcement: column NOT NULL with app-set defaults

**Decision:** Every domain table carries provenance columns
(`created_by/at/via`, `updated_by/at/via`, `source_event_id`,
`ai_confidence`, soft-delete trio) as NOT NULL columns with `DEFAULT now()`
where applicable. App code is responsible for setting `_by` and `_via`
fields on every write.

**Alternatives considered:**
- Postgres trigger that auto-fills `created_by` from `auth.uid()` and `via` from a session var. **Rejected** for D-001: triggers are harder to debug and obscure where state changes. Revisit only if app-side discipline drifts.
- Shared base type via PostgreSQL inheritance. **Rejected** — Supabase tooling and ORMs don't handle table inheritance well.

**Rationale:** explicit > implicit; column constraints catch missing fields at
INSERT time; tests can assert provenance presence by SELECTing the columns.

### D-001.2 Audit log writes from app code, not triggers

**Decision:** Every state-changing path writes to `audit_log` explicitly via
the service-role client (`src/lib/supabase/admin.ts`). No Postgres triggers
on domain tables.

**Alternatives considered:**
- Postgres triggers on every domain table that INSERT into audit_log. **Rejected** for D-001: triggers can't capture `actor_role`, `agent_tier`, `prompt_version`, `nl_input`, or `compiled_artifact` (Constitution IV fields) — those live in the app context.

**Rationale:** Constitution IV requires rich audit context that only the
app layer holds. Trigger-based audit deferred indefinitely.

### D-001.3 PLATFORM_ONLY override semantics: silent filter at resolve time

**Decision:** `effectivePermissions` silently filters allow-overrides for
`PLATFORM_ONLY_PERMISSIONS` when the base role is not `super_admin`. The
override row may still exist in `role_permission_overrides` (when D-003 lands)
but never grants the permission at runtime.

**Alternatives considered:**
- Throw at resolve time. **Rejected** — would crash request handling on bad data; silent filter is failure-quiet.
- Reject at write time only. **Adopted in addition** — D-003 admin UI will validate before insert; resolve-time filter is defense-in-depth.

**Rationale:** double-defense — write-time validation prevents bad data;
runtime filter contains existing bad data without taking down the app.

### D-001.4 Org isolation via Supabase Auth Hook + JWT claim

**Decision:** A Supabase Auth Hook (`public.custom_access_token_hook`)
populates `organization_id` and `base_role` claims into every issued JWT.
RLS policies read these via `auth.org_id()` and `auth.is_super_admin()`
helper functions. super_admin's `organization_id` claim is empty (`NULL`),
so `= auth.org_id()` predicates fail naturally → 0 rows.

**Alternatives considered:**
- Server-side custom token wrapper that re-signs JWTs after sign-in. **Rejected** — custom signing infrastructure to maintain.
- Pass `organization_id` from app code on every query as a request-level GUC. **Rejected** — every server action would need to remember to set it; one missed call = isolation hole.

**Rationale:** the Auth Hook approach is what Supabase recommends (their own
docs use it for tenant claims); RLS predicates become declarative; the hook
runs on every token issue → no app-code burden.

### D-001.5 Branch strategy: feature/* off v1, not off main

**Decision:** Feature work for D-001 onward branches off `v1`. PRs merge
into `v1`. `v1` → `main` only when V0 is shipped.

**Rationale:** `main` is treated as "released" once V0 ships; `v1` is the
work-in-progress trunk during V0. Avoids cluttering `main` with
in-progress changes.

### D-001.6 Channel-partner isolation tested via placeholder fixture

**Decision:** D-001 tests the `submitted_by_user_id = auth.uid()` RLS
pattern against a `cp_submissions` test fixture (in
`tests/fixtures/cp-test-table.sql`) — the production `leads` table arrives
in D-002. The fixture is applied to TEST DB only.

**Rationale:** Constitution X1 (channel partner isolation) is existential
risk. Testing the pattern *now* against a stand-in catches the bug class
that D-002 might re-introduce; D-002's plan must replicate the same pattern.

### D-001.7 Patched V5 source bugs (filed for upstream)

**Decision:** Two V5 framework bugs were patched in our consumer copy:

1. `package.json` `prepare` script used `node -e "...require('husky')()"` which throws on Node 24. Patched to `node -e "if(...skip)" && husky`.
2. `baseline/009-pre-commit-contract.md` shipped realistic-format example secrets (Stripe-formatted live-key strings from Stripe's own docs) that GitHub Push Protection treated as real secrets. Patched to obvious placeholders.

**Action:** report both upstream so future scaffolds don't inherit them.
Track at: TBD (V5 upstream issue tracker).

### D-001.8 Next.js 16 `middleware` → `proxy` deprecation

**Decision:** D-001 ships with `src/middleware.ts` despite the Next.js 16
deprecation warning. Migration to `proxy.ts` is a follow-up directive
(low risk; same API).

**Rationale:** the warning doesn't block. Stability over chasing the
latest Next convention before it stabilizes.

### D-001.9 Helpers in `public.app_*`, not `auth.*`

**Decision:** JWT-claim helpers (`org_id()`, `is_super_admin()`) live in
`public.` schema, prefixed `app_` to distinguish from app-table accessors.

**Alternatives considered:**
- `auth.org_id()`. **Rejected at apply time** — Supabase managed databases
  reject `CREATE FUNCTION` in the `auth` schema with `permission denied for
  schema auth (SQLSTATE 42501)`. The `auth` schema is reserved for Supabase Auth itself.

**Discovered:** During first `supabase db push` against the remote project.
**Anchor:** [supabase/migrations/20260507120000_orgs_and_workspaces.sql](../supabase/migrations/20260507120000_orgs_and_workspaces.sql)

### D-001.10 Audit-log immutability via trigger (RLS isn't enough)

**Decision:** `audit_log` UPDATE / DELETE / TRUNCATE are blocked by a
`BEFORE` trigger that raises `'audit_log is append-only'`. RLS no-policy
is *not* sufficient.

**Alternatives considered:**
- RLS-no-policy (relied upon initially). **Rejected after empirical proof** —
  Supabase configures `service_role` with `bypassrls = true` by default; UPDATE
  and DELETE both succeeded against the no-policy table from a service-role
  client. Triggers run regardless of RLS bypass; that's the only architecturally
  sound enforcement.

**Discovered:** B6 integration test failed (`expected undefined to be <id>`)
when DELETE actually succeeded.
**Anchor:** [supabase/migrations/20260507120500_audit_log_triggers.sql](../supabase/migrations/20260507120500_audit_log_triggers.sql)

### D-001.11 PostgREST schema cache requires NOTIFY for DDL

**Decision:** Test fixtures that create new tables (e.g. `cp_submissions`)
must end with `NOTIFY pgrst, 'reload schema';` so PostgREST refreshes its
schema cache and the table becomes queryable via the JS / REST client.

**Discovered:** B9 first run failed with `Could not find the table
'public.cp_submissions' in the schema cache (PGRST205)` despite the table
being present in the catalog.
**Anchor:** [tests/fixtures/cp-test-table.sql](../tests/fixtures/cp-test-table.sql)

### D-001.12 super_admin AC-10 scoped to operational rows

**Decision:** "super_admin sees zero operational data" excludes the
super_admin's own platform-identity profile (organization_id NULL),
which is correctly visible via `profiles_select_self`. AC-10a asserts
`organization_id IS NOT NULL → 0 rows`, not the literal "0 rows total".

**Rationale:** Constitution Principle II isolates *operational* data from
super_admin. The super_admin still needs to know who they are at sign-in.
A blanket `0 rows` would imply `getCurrentUser()` returns null for every
super_admin, breaking the platform surface entirely.

---

## 2026-05-07 — D-002 Graph Data Model

### D-002.1 Single `nodes` table with `node_type` discriminator

**Decision:** One `nodes` table for all 10 node types instead of per-entity
tables (`leads`, `deals`, `contacts`, ...). `data jsonb` carries type-specific
fields validated by Zod in TypeScript.

**Alternatives considered:**
- Per-type tables. **Rejected** — Canvas component would have to be rewritten per type, cross-type semantic search becomes a UNION-ALL nightmare, provenance contract gets duplicated 10× and drifts.
- Triple store / RDF. **Rejected** — overkill, tooling sparse.

**Rationale:** PRD §7 conclusion. One Canvas, one provenance contract,
one embedding query, one custom-fields engine (D-112). Trade-off: validation
moves to the app layer (TypeScript / Zod). Documented in baseline 110 §II.

### D-002.2 Zod schemas as the type-safety layer for `data` jsonb

**Decision:** `nodes.data` is `jsonb NOT NULL DEFAULT '{}'` — no per-type
column constraints. App-level Zod schemas in `src/lib/nodes/schemas/<type>.ts`
are the only enforcement mechanism for type-specific shapes. The Zod schemas
ratify into baseline 110 and cannot change without an amendment directive.

**Alternatives considered:**
- DB-level CHECK constraints on a (`node_type`, `data`) tuple. **Rejected** — Postgres can't easily express "if node_type='lead' then data->>'phone' IS NOT NULL" across all 10 types without an explosion of CHECK clauses.
- Per-type derived VIEWs with column constraints. **Rejected** — adds layer; query routing complexity.

**Trade-off:** runtime calls that bypass `createNode`/`updateNodeData` could
write malformed `data`. Mitigation: convention + tests; consumers go through
the API helpers. Future RLS layer in D-009 may add a row-level Zod check via
a Postgres function if drift surfaces.

### D-002.3 Embedding queue + deferred-d009 stub pattern

**Decision:** D-002 ships the schema, the trigger that enqueues refreshes,
and an Inngest function that marks every queued row `status='deferred-d009'`
without computing embeddings. D-009 (Model Gateway) replaces the function
body to actually call `text-embedding-3-small`.

**Rationale:** D-002 is the right place to land the schema; D-009 is the
right place to land the LLM call. Splitting them means D-002 doesn't need
a model provider configured. Once D-009 ships, `embedding_queue WHERE
status='deferred-d009'` is the backfill set.

### D-002.4 Inngest is the queue/workflow runtime

**Decision:** Builtrix CRM uses Inngest (per Constitution VII stack discipline)
for every queue and scheduled job. First use lands in D-002 (embedding
refresh); D-010 will add the WhatsApp inbound queue, D-013 the Call Audit
event handler.

**Rationale:** Constitution VII pre-locked Inngest. D-002 is the first
directive that needs a queue, so D-002 is where the runtime lands. Single
`inngest.config.ts` + `/api/inngest` route reused by every later directive's
function.

### D-002.5 Test orgs use unique slugs because audit_log immutability prevents cleanup

**Decision:** Integration tests that exercise audit-writing code paths
(node mutations, RLS checks against the audit table) MUST use a per-run
unique slug (e.g., `\`test-foo-${Date.now()}\``) so they don't try to
re-use a slug that's now permanently bound to audit_log rows. Static slugs
remain fine for tests that don't accumulate audit history.

**Why:** `audit_log.organization_id` has an FK to `organizations`. The
append-only trigger blocks both DELETE and ON DELETE SET NULL. Once a test
writes any audit row referencing an org, the org cannot be deleted. Result:
re-running the test fails on `organizations_slug_key` unique constraint.

**Trade-off:** orphan orgs accumulate in the test DB over many runs. Acceptable;
periodic manual sweep is fine.

### D-002.6 `inngest.createFunction` 2-arg signature with `triggers` in options

**Decision:** Use the modern Inngest 2-arg signature where triggers (event
+ cron) live inside the options object's `triggers` array. The old 3-arg
form with triggers as the second positional argument is rejected by the
TypeScript types in inngest@v3+.

**Why:** Caught at `npm run build` — `Expected 2 arguments, but got 3`.

---

## 2026-05-07 — D-003 RBAC Engine

### D-003.1 `Permission` is a literal union; `rbac.ts` is the single source

**Decision:** `PERMISSIONS` is a `as const` array in `src/lib/auth/rbac.ts`;
`Permission = (typeof PERMISSIONS)[number]`. Adding a permission = TS
literal change there only — no migration, no baseline doc update. The
`Permission` type was removed from `src/lib/auth/types.ts` to enforce a
single source (Constitution VIII).

**Rationale:** PRD §9.3 explicitly states rbac.ts is authoritative.
Mirroring the catalog in a baseline doc would create drift.

### D-003.2 PLATFORM_ONLY is 8 perms, not 10 — `organizations:view` and `organizations:edit` are shared

**Decision:** PLATFORM_ONLY_PERMISSIONS = 8 platform-tier perms (down from
the literal-10 reading of PRD §4.2). `organizations:view` and
`organizations:edit` are NOT platform-only — PRD §5.1 grants them to
org_owner / org_admin for managing their own org metadata. Documented
inline in rbac.ts.

**Why:** The PRD §4.2 list and the PRD §5.1 list contradicted each other.
Resolution above is the only one that lets org_admins edit their own
org without holding a "platform-only" perm.

### D-003.3 PLATFORM_ONLY duplicated in DB guard trigger; drift detector deferred

**Decision:** The DB-side `role_permission_overrides_guard` trigger
duplicates the 8-perm PLATFORM_ONLY list as a defense-in-depth measure
on top of the resolver-time silent filter. A CI script that fails the
build if the TypeScript constant and the DB list diverge lands in D-014
hardening.

**Why:** The resolver protects authenticated users. The DB trigger
protects against bypass paths (service-role writes, future agents).
Belt-and-suspenders.

### D-003.4 `requirePermission` throws a typed `PermissionDenied`

**Decision:** Helpers throw a `PermissionDenied` Error subclass carrying
`{ user_id, perm, org_id }`. Server actions catch it at the framework
boundary and return a typed 403 response. The error message includes the
perm name; nothing else (no SQL, no row data) leaks to the client.

**Rationale:** Throws integrate with Next.js error boundaries. Returning
a Result type would require every gate site to write a discriminated-union
match — too much boilerplate for the win.

### D-003.5 Server-action helpers accept a pre-resolved `Set<Permission>`

**Decision:** `hasPermission`, `requirePermission`, `requireAnyOf` accept
an optional `cached?: Set<Permission>`. Server actions resolve the
effective set once per request and pass it to every gate. No global
cache, no Next.js `cache()` integration — explicit data flow only.

**Rationale:** Makes resolution cost obvious at the call site; no surprise
re-runs in tight loops.

### D-003.6 `requireAnyOf` throws against the LAST perm in the list

**Decision:** When none of the alternative permissions match,
`requireAnyOf` throws `PermissionDenied` with the LAST perm in the
input array (not the first). This makes the audit log capture the most
specific / last-tried permission.

**Why:** The first perm is often the broadest ("any of: leads:view, ...");
the last is usually the narrowest. Logging the narrow case helps
debugging more.

### D-003.7 No catalog baseline; rbac.ts is the contract

**Decision:** D-003 does NOT ratify a `baseline/111-rbac-catalog.md`.
The PRD already names rbac.ts as authoritative (Constitution VIII).
A baseline doc would duplicate the contents and drift. Future directives
that depend on a permission existing should add a unit test asserting it.

---

## 2026-05-07 — D-004 Super Admin Surfaces

### D-004.1 Stacked sections, not tabs

**Decision:** `/platform/organizations/[id]` uses 4 stacked Card sections
(Info / Admins / Subscription / Recent audit). Constitution IX forbids
tabs; PRD §4.3's "tabs" reference is overridden by the constitution.

### D-004.2 Manual rollback on partial provisioning failure

**Decision:** Supabase JS client doesn't expose Postgres transactions.
`provisionOrganization` runs 6 inserts in order; on any failure it runs
compensating deletes in reverse order. Tests cover every failure point.

**Alternatives considered:** A `CREATE FUNCTION provision_org(...)`
called via RPC. **Rejected for D-004** — would add a 7th migration and
hide the rollback behind an opaque function. Future hardening directive
can move to a function if drift becomes a problem.

### D-004.3 createUser + generateLink instead of inviteUserByEmail

**Decision:** Provisioning calls `auth.admin.createUser({ email_confirm:true })`
to create the org_admin user without sending Supabase's default email,
then mints a magic-link via `auth.admin.generateLink`. The link is
returned to the caller for out-of-band delivery.

**Why:** Supabase's `inviteUserByEmail` rejected our test domain
(`@test.builtrix.in`) with "Email address invalid" — its email-sending
path has stricter domain validation than `createUser`. Decoupling
creation from delivery also makes the flow testable end-to-end and
forward-compatible with custom email branding (later directive).

### D-004.4 `read_sensitive` audit on every platform read

**Decision:** `listOrgs`, `getOrgDetail`, and `recentAuditRows` each
write one `audit_log` row with `action='read_sensitive'` per
Constitution VII. Aggregate counts (`platformCounts`) skip the audit
because no per-row data is exposed.

### D-004.5 Plan-tier resource limits recorded but not enforced

**Decision:** `subscriptions.plan_tier` is recorded at provisioning time;
enforcement (max users / leads / AI tokens) is deferred. User-count
enforcement lands in D-005's invitation flow; LLM token caps in D-009.

### D-004.6 5 fully-shipped + 5 placeholder routes

**Decision:** Home, organizations list, organizations/new (real action),
organizations/[id], audit ship FULLY. Subscriptions, analytics, costs,
tickets, settings ship as placeholders pointing forward.

### D-004.7 E2E specs deferred to a follow-up

**Decision:** Playwright @smoke / @regression for the platform surface
is deferred — the integration tests already prove the V1 DOD gate
(provisioning end-to-end + zero operational leakage). UI-level e2e
re-runs the same invariants through a slower channel; can land alongside
D-005's onboarding wizard tests.

---
