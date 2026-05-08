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

## 2026-05-07 — D-005 Org Admin Cockpit + Onboarding Wizard

### D-005.1 STEP_IDS as a literal-of-8

**Decision:** `STEP_IDS` is an `as const` array of 8 step ids; every other
type derives from it (`StepId`, `HARD_GATED_STEPS`, payload-schema record).
Adding or reordering is a contract change reviewed in Plan Mode.

### D-005.2 Hard-gate enforced at advanceStep, not just in the UI

**Decision:** Calling `advanceStep` with `skipped: true` on a hard-gated
step throws `OnboardingHardGateError`. The UI hides the "Skip" button on
those steps too, but the throw is the load-bearing enforcement (in case
a future automation calls advanceStep directly).

### D-005.3 Sample demo writes no DB rows

**Decision:** Step 8 is purely visual — a hardcoded fixture (Priya
Sharma · 3 BHK · Bangalore) walked through 4 transitions. No `nodes`
row is created. Fictional data shouldn't pollute the org's real graph.

### D-005.4 `branding` column as jsonb (vs separate columns)

**Decision:** Single `branding jsonb DEFAULT '{}'` instead of three
columns (primary_color, accent_color, logo_url). Allows future
expansion (typography, theme name, etc.) without DDL. Zod schema is
the contract. Same pattern as `onboarding_state`.

### D-005.5 Single dispatcher action over 8 separate actions

**Decision:** One server action `onboardingAction(prev, formData)` that
reads `step` from FormData and dispatches to `advanceStep`. The plan
called for one action per step; consolidating saves ~150 lines of
boilerplate without losing behavior. Per-step extraction is in a typed
`extractPayload` helper.

### D-005.6 Wizard step components inlined into one client component

**Decision:** `wizard.tsx` switches on `currentStep` to render the matching
step's form fields inline, instead of 8 separate client components per
the plan. Saves files; each step's UI is small (1-2 fields up to a
checkbox group); the action is the same. If a step grows to need state
or components, splitting later is trivial.

### D-005.7 Pipeline stages fixed at the default 7 in V0

**Decision:** Step 5 (pipeline stages) shows the default 7-stage list
read-only and asks the user to confirm. Customisation lands in D-007
lead lifecycle. Documented inline.

### D-005.8 Step 6 invites are best-effort

**Decision:** When step 6 invites N teammates, partial failure (e.g. one
of N email addresses rejected by Supabase) does NOT roll back the entire
step. The successful invites stay; the step advances. Surface inline
errors in a future iteration if observed friction.

---

## 2026-05-07 — D-006 Intelligent Canvas (Lead canvas only)

### D-006.1 Framer Motion as the locked motion library

**Decision:** `framer-motion@^12` is the motion library for every canvas-
touching directive going forward. First motion lib in the repo; locked
into baseline 112 §VI.

**Alternatives considered:**
- `motion-one`, `react-spring`. **Rejected** — Framer Motion is the
  React 19-compatible incumbent, has the strongest reduced-motion story
  (`MotionConfig reducedMotion="user"`), and pairs well with shadcn/ui.

**Rationale:** Constitution VII says "Framer Motion (Canvas-grade UX)";
this directive locks the version range and the usage patterns
(MotionConfig at root, AnimatePresence for expanders, `motion.div` for
section reveal). Future canvases reuse the same shapes.

### D-006.2 Defense-in-depth client-side org filter on Realtime

**Decision:** `useLeadActivityStream` drops Realtime messages whose payload
`organization_id` ≠ the canvas's `currentOrgId` (and `workspace_id` if
supplied) BEFORE merging into local state. RLS-via-Realtime is the
load-bearing layer; the client filter is belt + suspenders per
Constitution II.

**Rationale:** even though Supabase Realtime respects RLS by default, a
Realtime regression or RLS gap would silently leak. Cost of filtering
client-side is one comparison per message — negligible. Cost of a tenant
leak is existential.

### D-006.3 404 (not 403) on cross-tenant lead access

**Decision:** `/dashboard/leads/[id]` returns `notFound()` (404) for both
"doesn't exist" and "exists in another tenant". `getLeadCanvas` returns
`null` in both cases (RLS makes them indistinguishable upstream).

**Alternatives considered:**
- 403 for "exists but no permission". **Rejected** — leaks existence to
  the caller. The 404/403 distinction itself reveals which lead IDs are
  real, which is exactly the kind of inference attack RLS prevents.

**Rationale:** preserve RLS's existence-hiding property end-to-end.

### D-006.4 Operational canvas reads are NOT audited

**Decision:** The Lead canvas does NOT write a `read_sensitive` audit row
when it loads. Operational-tier reads by the workspace's own user are
not audited.

**Alternatives considered:**
- Audit every canvas mount. **Rejected** — would 10x audit_log volume
  in V0, swamp the platform audit surface, and obscure the actual
  privileged reads we DO care about (super_admin platform reads, D-004.4).

**Rationale:** Constitution VII reserves `read_sensitive` for platform-
tier reads. D-004.4 set the precedent. D-006 follows it.

### D-006.5 RSC boundary split — server-only api.ts vs client-safe channel.ts

**Decision:** `src/lib/canvas/api.ts` is server-only (it transitively
imports `next/headers`). The channel-name helper + edge-type / activity-
limit constants live in `src/lib/canvas/channel.ts` so client components
(`realtime.ts`) can import them without dragging server-only modules into
the client bundle.

**Discovered at:** `npm run build` — Turbopack bundled `realtime.ts` →
`activity-stream.tsx` → `lead-canvas.tsx` → `api.ts` → `next/headers`
into the client bundle and threw "Ecmascript file had an error". Split
fixed the boundary.

**Anchor:** [src/lib/canvas/channel.ts](../src/lib/canvas/channel.ts).

### D-006.6 Demo route ships ahead of D-007

**Decision:** `/dashboard/leads/demo` ships in D-006 with the Priya Sharma
fixture. The route is removed in a future directive once D-007 ships
create/edit and demos can use a real seeded lead.

**Rationale:** without a fixture route, the canvas can't be exercised
visually until D-007 lands the create flow. The demo route is one extra
30-line page; it lets us run Playwright @smoke and human design QA on the
canvas immediately.

### D-006.7 UUID guard on lead_id before Supabase query

**Decision:** `getLeadCanvas` validates `lead_id` against a v1-v8 UUID
regex and returns null without touching the DB if it doesn't match. Sits
in front of the existing PostgREST `.or()` filter that interpolates
`lead_id` into a string template.

**Rationale:** PostgREST already type-casts `id` (uuid) and 400s on
malformed input, AND RLS scopes the query to the caller's tenant — so the
interpolation isn't realistically exploitable. Adding the regex guard
costs ~2µs per call and removes the surface entirely. Defense-in-depth.

**Anchor:** [src/lib/canvas/api.ts](../src/lib/canvas/api.ts) `UUID_RE`.

---

## 2026-05-07 — D-007 Lead lifecycle on Canvas

### D-007.1 State machine in pure TS, not a DB CHECK

**Decision:** The lead state graph lives in `src/lib/leads/transitions.ts`
as a `Readonly<Record<LeadState, readonly LeadState[]>>` literal +
`assertTransitionAllowed` pure function. No `CHECK (state, target_state)`
constraint at the DB.

**Alternatives considered:**
- DB-side CHECK on a transitions table. **Rejected** — would need a
  migration to change the graph, slowing iteration. The audit log
  records every (from, to) pair anyway, so auditors can see when a
  graph violation was attempted.
- Trigger-based enforcement that reads the prior state. **Rejected** —
  same drawback, plus harder to debug.

**Rationale:** Same trade-off as D-002.1 (Zod over per-type CHECKs).
App layer + tests own the contract; DB stays additive-friendly.

### D-007.2 `transitionLead` is separate from `updateNodeData`

**Decision:** A dedicated `transitionLead` helper (in
`src/lib/leads/api.ts`) handles state transitions instead of routing
through D-002's `updateNodeData`. Two paths now exist for `nodes`
mutations.

**Why:** `updateNodeData` writes audit rows with
`diff: { before, after }` (full data snapshot). State transitions need
`diff: { from, to, reason? }` for compact, RERA-friendly audits. Trying
to fold both shapes into `updateNodeData` would either bloat its API or
double-write audit rows.

**Anchor:** [src/lib/leads/api.ts](../src/lib/leads/api.ts) `transitionLead`.

### D-007.3 Sticky terminals in V0; reactivation deferred to V1

**Decision:** `lost`, `on_hold`, `junk` are dead-end states in V0.
`TRANSITIONS[lost] = []`. Reactivation flow ("Restore to new") is V1.

**Rationale:** Reactivation needs a UX decision (who can reactivate?
does it create a new audit chain or amend the old one? what about
RERA implications?). Out of scope for V0 ship.

### D-007.4 Whole-canvas edit-mode toggle (not per-field inline)

**Decision:** A single "Edit" button in the Header swaps the entire
Header + Field block for an `EditLeadForm`. No per-field click-to-edit.

**Alternatives considered:**
- Per-field inline editing (click phone → input becomes editable).
  **Rejected for V0** — more components, more state, more edge cases
  (validation timing, partial saves). Whole-canvas toggle is one
  state bit.

**Rationale:** Ship a usable lead-edit flow now; per-field UX is V1
once we know what fields users actually edit most often.

### D-007.5 Terminal transitions require a reason; forward transitions don't

**Decision:** `transitionInputSchema.superRefine` requires a non-empty
`reason` iff `target_state ∈ TERMINAL_STATES`. Forward transitions
(new → contacted, contacted → qualified) don't require a reason.

**Rationale:** Lost / On hold / Junk are RERA-relevant decisions —
the audit log needs a free-text "why". Forward transitions are
expected pipeline progression and don't need a reason.

### D-007.6 Server-action ActionResult discriminated union

**Decision:** All three server actions (`createLeadAction`,
`updateLeadAction`, `transitionLeadAction`) return
`{ ok: true; data? } | { ok: false; error: 'permission' | 'validation' | 'unknown'; fieldErrors?; message? }`.

**Rationale:** Calling components can switch on `result.error` to
render the right inline UI (permission banner, field-error map,
form-level error). Keeps the server-action layer typed without
exceptions crossing the RSC boundary.

### D-007.7 `leads:edit` covers both field-edit and state-transition

**Decision:** Both field edits (`updateLeadAction`) and state
transitions (`transitionLeadAction`) gate on the same `leads:edit`
permission. No separate `leads:transition` perm in V0.

**Trade-off:** if we later want a workspace_admin who can transition
without editing fields (or vice versa), we'd add `leads:transition`
to the catalog. One literal-union change in `rbac.ts`. Acceptable.

### D-007.8 Stacked PR off feature/006 while D-006 PR is open

**Decision:** D-007's branch (`feature/007-lead-lifecycle`) was created
off `feature/006-intelligent-canvas` while PR #6 is still open. D-007's
PR will target `feature/006-intelligent-canvas` until D-006 merges to
`v1`, then rebase + retarget to `v1`.

**Rationale:** Avoids blocking D-007 progress on operator-side merge
review. D-007 only adds files + adds optional props to LeadCanvas —
rebase risk is low.

### D-007.9 Mandatory `caller_org_id` filter on every service-role mutation

**Decision:** Every server action that mutates a tenant-owned row via
the service-role admin client MUST first prove the row belongs to the
caller's `org_id`. Two patterns implemented in D-007:

1. **Helper-internal** — `transitionLead` accepts `caller_org_id` as a
   **required** field on `TransitionLeadArgs`. The helper's SELECT
   chain includes `.eq("organization_id", caller_org_id)` before
   reading the current state; a mismatch returns null and the helper
   throws `Lead not found or not visible: <id>`.
2. **Action-layer pre-check** — `updateLeadAction` calls
   `assertLeadInTenant(lead_id, user.org_id)` (a service-role lookup
   filtered by `organization_id = user.org_id`) before invoking
   D-002's `updateNodeData`. Returns `{ ok:false, error:'validation',
   message:'Lead not found' }` on null — same shape as a genuine
   missing lead, so existence isn't leaked across tenants.

**Why both patterns:** D-002's `updateNodeData` doesn't accept a
`caller_org_id` argument (D-002 predates this threat-model surface).
Rather than amend D-002, D-007 inserts a gate one frame upstream.
New helpers like `transitionLead` take the stricter approach:
required `caller_org_id` parameter so TypeScript enforces the gate
at every call site.

**Discovered:** First Gate-4 security scan flagged this as CRITICAL —
the original code used the service-role client (which bypasses RLS)
without explicit `org_id` filtering, allowing IDOR across tenants.
Closed before commit; rescan went clean.

**Anchors:**
- [src/lib/leads/api.ts](../src/lib/leads/api.ts) `transitionLead`
- [src/app/(dashboard)/dashboard/_actions/leads.ts](../src/app/(dashboard)/dashboard/_actions/leads.ts) `assertLeadInTenant`
- [tests/lib/leads/api.test.ts](../tests/lib/leads/api.test.ts) cross-tenant unit test
- [tests/integration/lead-create-edit-transition.test.ts](../tests/integration/lead-create-edit-transition.test.ts) cross-tenant integration

---

## 2026-05-08 — D-008 Cmd+K bounded catalog

### D-008.1 Bounded catalog (literal-of-30); free-form NL is V1

**Decision:** D-008 ships `src/lib/cmdk/catalog.ts` as an `as const`
literal of exactly 30 commands. Each entry has a stable `id`, a
`kind` discriminator (`navigate`/`action`/`lookup-prefix`/`placeholder`),
and an optional `requires[]` permission gate. New commands require an
amendment directive; runtime additions are V1+ (Constitution XI L3).

**Why:** Constitution X — NL-Compile-Then-Apply. The catalog IS the
compiled artifact. Free-form NL ("show me hot leads in Whitefield")
needs the Model Gateway (D-009) + DOE engine (D-011). Shipping a
bounded literal now gives users muscle memory + a stable shortcut
surface that future NL UX can defer to.

### D-008.2 cmdk locked as the command-bar lib (PRD §6.3-binding)

**Decision:** `cmdk` is the only command-bar implementation in the
repo. Custom keyboard navigation, fuzzy match, and group rendering
are not re-implemented.

**Side-effects:** jsdom doesn't ship `ResizeObserver` or
`Element.prototype.scrollIntoView`; both polyfilled in
`tests/setup-rtl.ts`.

### D-008.3 Cmd+K mounted on `(dashboard)/*` only in V0

**Decision:** The CommandPalette + NewLeadDialogProvider mount in
`src/app/(dashboard)/layout.tsx`. Routes outside `(dashboard)/*`
(admin, platform, settings) do not get Cmd+K in V0. V1 hoists the
provider to the root layout.

### D-008.4 NewLeadDialog open-state lifted to a React Context Provider

**Decision:** The previously self-contained `<NewLeadDialog>` (D-007)
gains a controlled `open` prop. A `NewLeadDialogProvider` mounts the
dialog ONCE at layout level and exposes `useNewLeadDialog()` so any
descendant — the dashboard's "+ New lead" trigger button, the Cmd+K
"Create new lead" command — can call `openDialog()` imperatively.

**Alternatives considered:**
- Event bus (mitt). Rejected — extra dep, untyped.
- Module-level store (zustand). Rejected — no existing infrastructure.
- URL state. Rejected — bookmarkable open-state isn't a goal.

### D-008.5 Placeholder commands navigate to `/dashboard/placeholder/<slug>` stubs

**Decision:** Forward-pointer commands (filtered list views, deal /
contact canvases, today's site visits, in-app feedback) navigate to a
single `/dashboard/placeholder/[slug]` Server-Component route that
validates `slug` against `PLACEHOLDER_SLUGS` and renders a
forward-link banner.

**Why:** Same precedent as D-005's placeholder cards. Discoverability
NOW; muscle memory builds before the real surface lands. Toast was
the alternative — rejected because toasts disappear, while a
dedicated route can be linked to and bookmarked.

### D-008.6 No `read_sensitive` audit on Cmd+K lookup-search

**Decision:** `searchLeads` is operational-tier — the user's own
workspace, ≤ 8 results, label + first-line phone. No `audit_log` row
written. Same precedent as D-004.4 / D-006.4.

### D-008.7 Hotkey preventDefault only when NOT in editable elements

**Decision:** `useCmdkHotkey` listens at the document level for
`Cmd/Ctrl+K` but suppresses the action when the focused element is
`<input>`, `<textarea>`, `<select>`, or `[contenteditable]`.

**Why:** Browser default `Cmd+K` is focus-address-bar; we override,
but only when the user isn't editing. Cost of a misfire (palette opens
while typing) is high; cost of a non-fire (use mouse) is low.

### D-008.8 RSC split — `searchLeadsByClient` for tests, `searchLeads` for production

**Decision:** `searchLeads` (the server action) gates on auth +
permission then delegates to `searchLeadsByClient` (a pure helper
that takes any authenticated client + runs the SELECT). Integration
tests inject an authenticated client into `searchLeadsByClient`
directly — verify RLS without the cookie-based `getCurrentUser`.

### D-008.9 LIKE-special-char escaping in `searchLeads`

**Decision:** Before interpolating user input into the PostgREST
ILIKE filter, escape `%`, `_`, and `\` with a leading backslash.
Without this, a user typing "50%" would match every lead containing
"50" plus arbitrary characters.

**Anchor:** [src/app/(dashboard)/dashboard/_actions/searchLeads.ts](../src/app/(dashboard)/dashboard/_actions/searchLeads.ts)

### D-008.10 Stacked PR off feature/007 while D-006 + D-007 PRs are open

**Decision:** D-008's branch (`feature/008-cmdk-bounded-catalog`)
branched off `feature/007-lead-lifecycle`. PR targets that branch;
retarget to `v1` after D-006 → D-007 merge train clears.

---

## 2026-05-08 — D-009 Model Gateway V0 + Lead Enrichment Agent (T1)

### D-009.1 Single Model Gateway seam (Constitution VII binding)

**Decision:** Every LLM completion + embedding goes through
`src/lib/ai/gateway.ts`'s `complete()` / `embed()`. Direct imports
of `@anthropic-ai/sdk` or `openai` outside `src/lib/ai/providers/`
are forbidden. D-014 hardening adds an ESLint rule + CI grep guard.

### D-009.2 Anthropic primary + OpenAI fallback (single retry)

**Decision:** Completion default: Anthropic `claude-sonnet-4-6`.
Fallback: OpenAI `gpt-4o-mini` on a single retry triggered ONLY by
`rate_limit`/`server`/`network` errors. Auth/parse errors are
non-transient and DO NOT trigger fallback. Embedding default:
OpenAI `text-embedding-3-small` (Anthropic has no embedding model
at V0).

### D-009.3 Token cap V0 = hardcoded global; plan-tier defaults D-014

**Decision:** `MONTHLY_TOKEN_CAP = 100_000` per org per UTC calendar
month, `SOFT_WARN_RATIO = 0.8`. Plan-tier-driven defaults land in
D-014 hardening.

### D-009.4 Lead Enrichment Agent triggered via Inngest event

**Decision:** D-007's `createLead` emits `lead.created` via
`inngest.send(...)` AFTER the DB commit. Send failure logs but does
NOT roll back the lead.

**Alternatives considered:** DB trigger → LISTEN/NOTIFY (rejected;
adds bridge), cron sweep (rejected; latency).

### D-009.5 PII masking via `textOfRecord(node)` for embeddings

**Decision:** All embedding source text is built via
`src/lib/nodes/text.ts` `textOfRecord(node)`. Per-node-type
allowlist of safe keys; phone/email/notes/full-name dropped. Label
is masked for phone/email patterns.

**Trade-off:** the Lead Enrichment Agent's prompt receives the
lead's `label` (PII) directly — documented in baseline 115; the
prompt instructs the model NOT to echo PII in output.

### D-009.6 Tier ceiling enforced at TWO layers (runtime + DB)

**Decision:** Runtime `runAgent` throws `TierCeilingExceededError`
on breach. DB `audit_log` BEFORE INSERT trigger rejects rows where
`agent_tier > service_account.max_tier` (defense-in-depth per
D-007.9 precedent).

### D-009.7 Prompt files under `src/prompts/<agent>/v<N>.md`

**Decision:** Constitution VIII names this as the prompt authority.
File-based prompts are git-versioned + greppable. DB-backed prompt
store + UI is V1+.

### D-009.8 Embedding-refresh body replaced (D-002 stub closed)

**Decision:** D-002's stub that marked rows `deferred-d009` is
replaced with the real `gateway.embed(textOfRecord(node))` path.
Same function id, same triggers, new body. Existing
`deferred-d009` rows process on the next cron sweep.

### D-009.9 Stacked PR off feature/008 (4th in the chain)

**Decision:** D-009's branch branched off `feature/008-cmdk-
bounded-catalog`. Once the chain merges to `v1`, retarget to `v1`.

### D-009.10 Append-only ledger via trigger (audit_log pattern reused)

**Decision:** `token_usage_ledger` uses the same trigger-based
append-only enforcement as `audit_log` (D-001.10). RLS no-policy is
insufficient because `service_role` has `bypassrls=true`.

### D-009.11 `agent_service_accounts` is GLOBAL (one row per agent type)

**Decision:** A single row in `agent_service_accounts` per agent
type, shared across all orgs. Every audit/ledger row carries the
operated-on `organization_id` from the trigger event.

**Alternative considered:** per-org service-account rows seeded at
provisioning (D-004 amendment). Rejected to avoid amending D-004's
provisioning flow.

---

## 2026-05-08 — D-010 WhatsApp inbound webhook + Activity Stream wiring

### D-010.1 Idempotency key lives in `nodes.data.custom.wa_message_id`

**Decision:** Per-org dedup is enforced by SELECT-then-INSERT on
the `data->custom->>wa_message_id` JSONB key. We did NOT add a
unique constraint to `nodes` because:
- `nodes` is the polymorphic graph table; constraints have to apply
  to one `node_type` only, requiring a partial unique index — fine,
  but it would be the first such index and adds a maintenance
  burden.
- The provider `wa_message_id` is text, NOT a uuid, so we can't
  reuse `source_event_id` (uuid) without a coercion table.

**Alternatives considered:**
- Partial unique index `(organization_id, node_type, (data->custom->>wa_message_id)) WHERE node_type='activity'`. **Rejected for V0** — adds DDL surface; the SELECT-first dedup is correct under the only concurrency the V0 webhook sees (one provider, one retry). D-014 hardening can promote to a unique partial index after pilot.
- A side `whatsapp_message_dedup` table. **Rejected** — extra table for one column.

### D-010.2 Orphan activities attach to a per-workspace inbox lead

**Decision:** When an inbound message has no matching lead, the
activity attaches to a system-owned inbox lead created lazily by
SQL function `ensure_workspace_inbox_lead(workspace_id)`. Inbox
leads carry `data.custom.is_system_inbox = true` for lookup. They
use `state='new'` and `data.source='other'` — both Zod-valid — so
the canvas renders them with no special-casing.

**Alternatives considered:**
- Reject orphan activities. **Rejected** — losing inbound messages
  is the failure mode the product was designed to fix.
- A fully separate `inbox_messages` table. **Rejected** — would
  need its own RLS, audit, realtime, edges. Inbox leads ride the
  graph.

### D-010.3 HMAC-SHA256 verification + flat timing

**Decision:** `verifyWhatsAppSignature` always computes the HMAC
even when the header is malformed; `crypto.timingSafeEqual` only
runs after a length check. Padding the compute path keeps total
verification time independent of input quality.

### D-010.4 Per-org webhook secret stored as SHA-256 hash

**Decision:** `org_whatsapp_endpoints.secret_sha256` stores a hash
of the shared secret. V0 uses a platform-wide secret in
`WHATSAPP_WEBHOOK_SECRET` env (matches D-009's
`process.env.ANTHROPIC_API_KEY` pattern). D-016 will activate
per-org secrets stored as SHA-256 hashes.

**Why hash, not encryption:** the verify path can reconstruct the
HMAC from the raw secret + body, but the route never needs to
*read* the raw secret back; we just need to confirm a digest.
Hash-only storage means a DB leak doesn't leak signing keys.

### D-010.5 No outbound emit on whatsapp_inbound

**Decision:** D-010 does NOT emit a `whatsapp.received` Inngest
event. The realtime publication on `nodes` already broadcasts the
INSERT; downstream consumers (Lead Enrichment Agent, future
Stale-lead Watcher) hook off of that. Avoids duplicate event
fan-out.

**Trade-off:** background jobs that need to act on every inbound
must subscribe to Postgres CHANGES, not Inngest. Acceptable for V0;
reassess at D-011 (DOE engine) if directives need a stable event.

### D-010.6 Append-only ledger row even on rejection

**Decision:** `whatsapp_inbound_log` records every webhook POST,
including signature failures (`status='rejected'`, the route logs
on rejection so failed/successful traces are uniformly replayable).
Audit log only fires on successful insert (deduped doesn't audit;
rejected doesn't either — the ledger is the audit equivalent for
the reject path).

---

## 2026-05-08 — D-011 DOE Workflow Engine V0

### D-011.1 Single `directives` table with `organization_id NULL` for platform defaults

**Decision:** One row per directive, with `organization_id IS NULL`
meaning "platform default, all orgs inherit." Per-org rows shadow
the platform default for the same `code`. Runtime UNION-ALL's via
a single SELECT and then dedup-by-code in the app layer with
"org-specific wins."

**Alternatives considered:**
- Per-org-only rows (no platform-default concept). **Rejected** —
  every new org would need to seed 15 rows. Operationally noisy
  and version-drift prone.
- Two tables (`directives_default` + `directives_org`). **Rejected**
  — duplicate schema; the `organization_id NULL` pattern is what
  Supabase RLS handles fluently.

### D-011.2 `directive_invocations` is the rate-limit + idempotency source

**Decision:** Idempotency = unique `(directive_id, subject_node_id,
trigger_id) WHERE outcome='dispatched'` partial index. Rate limit
= `SELECT COUNT(*)` over the last 24h, dispatched-only. Both checks
hit the same table; no separate counter / cache.

**Why:** the ledger is required anyway (audit story). One source
of truth beats duplicating data into a cache that can drift.

### D-011.3 T3+ directives stamp `pending_approval`, runtime stops

**Decision:** When a matched directive's tier is T3 or T4, the
runtime records `outcome='pending_approval'` and does NOT execute
the action handler. Constitution I — agents are colleagues, not
autopilots. Per-action human approval is required for T3 (custom
outbound, deal-term changes, lead reassignment) and T4 (bulk).

**Trade-off:** the V0 surface to approve these is missing
(`/admin/agents/queue` — V1). Pending rows pile up in the ledger.
Acceptable for V0 since the seed has zero T3/T4 directives;
future per-org overrides may add them.

### D-011.4 Action handlers write nodes via `createNode`, not direct INSERT

**Decision:** All action handlers route their writes through
`createNode` / `updateNodeData` from D-002. Audit + provenance +
realtime publication are inherited automatically. The runtime
also writes its own `audit_log` row with `action='directive_fired'`
on top of the per-mutation audit row from `createNode`, so the
"why" is captured alongside the "what."

### D-011.5 `enqueue_agent` is declarative, not actually re-emitting events

**Decision:** D-01's seed declares `action_kind='enqueue_agent'`
with `agent_type='lead_enrichment'`. The handler returns
`{enqueued: false, reason: 'already-emitted-by-createLead'}`
because `createLead` already emits `lead.created` which the
existing `lead-enrichment-on-create` Inngest function consumes.
The declaration documents the wiring + audits each lead-creation
event.

**Why:** double-emission would double-fire the agent. The
declaration is intentionally idempotent.

### D-011.6 No notifications table for V0

**Decision:** `notify_user` writes a `note` node with
`data.custom.notification=true` + `audience` instead of writing to
a separate `notifications` table. Reuses realtime + RLS + audit
infrastructure that already exists for nodes.

**Trade-off:** filtering "my notifications" is a `nodes` SELECT
with `data->custom->>notification = 'true' AND
data->custom->>audience = $user_id`. JSONB queries are slower than
indexed FK lookups; acceptable for V0 volume.

---

## 2026-05-08 — D-012 Site Visit + Reminder Agent (T2)

### D-012.1 Reminder agent uses templated body, no gateway call

**Decision:** The Site Visit Reminder Agent (T2) does NOT call
`gateway.complete` for V0. T2 means "templated outbound" —
constitution I lists the tier explicitly as
"pre-approved, template-based comms." The handler picks a body
from a literal template table (T-12 → 24h, T-13 → 2h) and writes
the activity. Saves a gateway round-trip + dollars; matches the
T2 contract exactly.

**Implications:** when D-016 wires real outbound (template approval
+ provider send), the agent's body builder swaps to load from the
`templates` table. The audit row's `prompt_version` field carries
`v1` even without a gateway call — it represents the agent
behavior version, not just LLM-prompt versions.

### D-012.2 Cron sweep + DOE dispatch instead of per-visit Inngest scheduled events

**Decision:** A single cron Inngest function (`*/15 * * * *`) scans
for visits in the 24h / 2h windows and emits one `site_visit.window`
trigger to the DOE runtime per matching visit. Idempotency is
the DOE runtime's responsibility via
`trigger_id='site_visit.window:<visit_id>:<hours_until>'`.

**Alternatives considered:**
- Schedule a per-visit Inngest scheduled event when the visit is
  created. **Rejected** — Inngest schedules can be cancelled but
  an arbitrary visit-edit makes the schedule stale; scanning every
  15 min is simpler and self-healing.
- Postgres `pg_cron`. **Rejected for V0** — adds a Postgres
  extension dependency and lives outside our Inngest observability.

### D-012.3 Cron sweep is global (org_id NULL)

**Decision:** `findUpcomingSiteVisits` accepts `organization_id ?:
string | null` — null means "all orgs". The cron uses null since
it runs at platform tier (service-role). Each emitted DOE event
carries the visit's actual org id, so per-org rate limiting +
audit still apply downstream.

### D-012.4 Visit creation emits NO Inngest event

**Decision:** `createSiteVisit` does not call `inngest.send`. The
DOE runtime is reached via the cron sweep. Avoids two-source-of-
truth between event-driven and scan-driven dispatch.

**Trade-off:** a visit scheduled within the next 30 minutes might
miss the 2h window if the cron just ran. Acceptable for V0 — the
operator-facing UX displays the upcoming visit immediately on the
canvas; the reminder is a nice-to-have, not the visit's source of
truth.

### D-012.5 Site visits link to leads via `attended` edge

**Decision:** `createSiteVisit` writes the visit node + an edge
`from=visit_id, to=lead_id, edge_type='attended'`. The schema's
`edge_type` enum already names `attended` (D-002 baseline 110).
The canvas's edge query for the lead picks up the visit on the
"site visits" section without a separate lookup.

---

## 2026-05-08 — D-013 Call Audit event bus integration

### D-013.1 Single inbox endpoint, dispatched by `event_kind`

**Decision:** One endpoint `/api/events/inbox` accepts every
sister-product event. The dispatcher discriminates by
`event_kind`. Per-product, per-kind handlers live in
`src/lib/events/<product>/<kind>.ts`. Adding a new kind = add a
handler + a switch arm.

**Alternatives considered:**
- One endpoint per product (`/api/events/call-audit/inbox`,
  `/api/events/legal/inbox`). **Rejected** — operationally
  identical, more route boilerplate, more secrets to manage.

### D-013.2 Idempotency via `data.custom.source_event_id` JSONB key

**Decision:** Reuses D-010's pattern (webhook-dedup-via-jsonb-key).
Inbox dedup looks up an existing `nodes` row whose
`data.custom.source_event_id = $event_id` AND
`organization_id = $envelope.org`. Cross-tenant `event_id`
collisions return null because of the org filter — events from
different orgs with the same id (unlikely but possible) don't
collide.

### D-013.3 Lead-not-found in tenant returns rejection, not orphan

**Decision:** Unlike D-010's WhatsApp orphan-to-inbox-lead
fallback, the call-audit handler rejects when the lead isn't
found in the org. A call without an associated lead is a sister-
product bug; orphan would obscure it.

### D-013.4 Objection-detected dispatches DOE inline (not via Inngest)

**Decision:** `onCallObjectionDetected` calls `dispatchDirective`
directly within the request lifecycle. Latency: synchronous DOE
runs (< 100ms in-memory matching) are fine for the webhook's
return budget. Async dispatch via Inngest would add a hop +
serialization without buying anything.

**Trade-off:** if D-09's action handler is slow (e.g. it calls
`gateway.complete`), the webhook's response time grows. T0
`surface_on_canvas` action is non-AI, so this is bounded for V0.

### D-013.5 Edge type `mentioned_in` for call → lead

**Decision:** Calls link to leads via `mentioned_in` (not
`attended` — that's reserved for site visits per D-012.5).
Constitution naming taxonomy in baseline 110 is binding.

### D-013.6 Same HMAC verifier as D-010

**Decision:** D-013's route imports
`verifyWhatsAppSignature` from D-010 — the underlying HMAC-SHA256
verification is identical. Once D-010's helper is rename-worthy
(D-014 or later), the export becomes a generic
`verifySignature`. For V0 the function name is misleading but
the implementation is correct + tested.

---

## 2026-05-08 — D-014 V0 hardening pass

### D-014.1 Pre-existing canvas/api test mock fixed

**Decision:** D-009's group D modified `getLeadCanvas` to query
`audit_log` for each activity's `agent_tier`, but
`tests/lib/canvas/api.test.ts` was not updated to mock that path
— two tests had been failing on v1 for several merges. D-014
adds an `audit_log` chain to the test's `buildClient` helper
and an `auditTiersResolve` knob; the tests now exercise the
intended audit-tier coercion path.

**Why this lives in D-014, not as a hotfix:** the two tests
weren't blocking V0 (CI gates run a different suite), but they
were noise during D-010..D-013 development. D-014 is the right
place to flush these.

### D-014.2 RLS audit summary — D-010..D-013 tables

**Decision:** Each new table conforms to the Constitution II
pattern:

- **`whatsapp_inbound_log`** (D-010): RLS enabled. SELECT policy
  `whatsapp_inbound_log_select_own_org` filters by
  `organization_id = app_org_id()`. INSERT via service-role only
  (no policy granted to `authenticated`). Append-only via
  trigger.
- **`org_whatsapp_endpoints`** (D-010): RLS enabled. SELECT
  policy allows super_admin OR own org. Writes via service-role
  only.
- **`directives`** (D-011): RLS enabled. SELECT policy admits
  rows where `organization_id IS NULL OR organization_id =
  app_org_id()` (platform-default inheritance) AND a separate
  super-admin policy admits all rows. Writes service-role only.
- **`directive_invocations`** (D-011): RLS enabled. SELECT
  policy filters by org. Append-only via trigger. INSERT via
  service-role.
- **`event_inbox_log`** (D-013): RLS enabled. SELECT policy
  filters by org or super-admin. Append-only via trigger.

Every domain `nodes` write inherits the existing
`nodes_select_own_org` / `nodes_modify_own_org` policies from
D-002.

### D-014.3 Test coverage targets met

**Decision:** D-014 confirms the unit test suite is 100% green
(591 tests). The post-D-009 canvas test was the only outstanding
failure on `v1`; it's now repaired. Coverage thresholds are
enforced in `vitest.config.ts` (≥ 80 lines / 90 branches across
the listed include patterns).

### D-014.4 docs/architecture.md authored

**Decision:** A flat snapshot of V0 architecture (file map, data
model, seam table, Inngest topology) is authored at
`docs/architecture.md`. Lives outside `memory/` because it's
operator-facing reference, not memory; per CLAUDE.md
authority order, `memory/decisions.md` remains the
"why" record and `docs/architecture.md` is the "what & where".

---

## 2026-05-08 — D-015 Pilot onboarding (V0 acceptance gate)

### D-015.1 Pilot is a runbook + smoke test, not new code

**Decision:** D-015 ships zero source code. The deliverables are
two runbooks (`docs/runbooks/pilot-onboarding.md` +
`docs/runbooks/pilot-smoke-test.md`) and an idempotent demo seed
script (`scripts/seed-pilot-org.sh`). Per the install plan:
"D-015 is mostly operational, not code — it's the V0 acceptance
gate."

**Why this matters:** the temptation during pilot is to add
features in response to feedback. The pre-pilot rule, captured
here in writing: **no V0 feature additions during the pilot.**
Bug fixes only. Feature requests file to a V1 backlog.

### D-015.2 Smoke test is 14 numbered checks, all must pass

**Decision:** The smoke test names 14 explicit checks across 10
groups (tenant isolation, lifecycle, canvas activity, Cmd+K,
agents, sweeps, DOE, audit immutability, budget, event bus).
**All 14 must pass** before the pilot is declared live. Single
failure → stop, file pilot-blocker, hotfix branch off v1.

**Why all-or-nothing:** at pilot stage, partial coverage is
worse than no coverage. The smoke test is calibrated such that
each check probes a constitutional principle; passing 13 of 14
with audit-log immutability failing means the system is
non-compliant.

### D-015.3 Demo-org seed script does NOT create auth.users

**Decision:** `scripts/seed-pilot-org.sh` creates rows in
`organizations`, `workspaces`, `teams`, `profiles`, and
`user_app_roles`, but it **skips** rows whose corresponding
`auth.users` rows don't exist. The operator magic-links users
via Supabase Auth, then re-runs the script (idempotent).

**Why:** creating auth users via SQL bypasses Supabase Auth's
email verification + bcrypt + audit. Cardinal sin per
Constitution VII (stack discipline + Supabase Auth).

---

## 2026-05-08 — Hotfix: middleware MIDDLEWARE_INVOCATION_FAILED

### HF-1 Middleware must NEVER throw (Vercel contract)

**Decision:** `src/middleware.ts` is contractually obligated to
return a `Response` for every request, even when configuration is
broken. Any thrown exception in middleware becomes Vercel's
opaque `MIDDLEWARE_INVOCATION_FAILED` 500, which is undebuggable
without reading deploy logs.

**Trigger:** First Vercel deploy of v1 returned
`MIDDLEWARE_INVOCATION_FAILED` on every page. Root cause:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
were not set on the Vercel project. `@supabase/ssr`'s
`createServerClient(url, key, ...)` throws synchronously when
either argument is empty (message:
"Your project's URL and Key are required to create a Supabase client!").

**Fix:**
1. `envConfigError()` runs first in middleware. Missing env vars
   → return a 500 whose body names the variable + the operator
   action (set on Vercel → redeploy).
2. The Supabase-client construction is wrapped in `try/catch` so
   future SDK throws (malformed JWT, network blip during refresh)
   degrade to "no session" — the user is bounced to
   `/auth/sign-in` instead of seeing a 500.

**Pinned by:** `tests/middleware/env-validation.test.ts` — 6 tests
covering each missing-var case + the must-not-throw invariant.
Verified by reverting the fix: 4 of 6 fail without it.

### HF-2 Why local-dev success != Vercel-prod success

**Decision:** Going forward, treat "local `npm run dev`" as
necessary-but-insufficient for deploy readiness. The deploy gate
is a fresh `npm run build` + `npm run start` with `.env*` files
moved aside — that's the closest local approximation of a fresh
Vercel container.

**Lesson:** The 2026-05-08 deploy passed `npm run dev` with
`.env.local` populated, but Vercel's first request hit a
`MIDDLEWARE_INVOCATION_FAILED` because Vercel doesn't read
`.env.local`. The unit-level regression locked in by HF-1's test
catches this at CI-time, not at-deploy time.

---

## 2026-05-08 — D-016 Super-admin secret management (un-parked)

### D-016.1 platform_secrets table — DB-first resolution, env fallback

**Decision:** Provider API keys + webhook signing secrets are now
configurable in-app at `/platform/settings/secrets` (super_admin only)
and persisted in `platform_secrets`. Resolution order at runtime
via `getSecret(kind)`:

  1. `platform_secrets.value` — UI-set value
  2. `process.env[<env_name>]` — Vercel fallback (used at boot
     before super_admin first logs in)
  3. `null` — caller decides (webhooks reject, gateway throws with
     a message pointing to the UI)

**Why now:** Operator request after the 2026-05-08 Vercel deploy
exposed the friction of env-var-only secrets — rotating
`ANTHROPIC_API_KEY` via Vercel UI requires a redeploy, and there
is no audit trail of who changed what. The DB-first path lets
super_admin rotate without touching Vercel.

### D-016.2 Raw value never leaves the DB

**Decision:** The UI never round-trips the raw secret back to the
client. Three layers enforce this:

  1. `platform_secrets_redacted` view exposes only `kind`, `last4`,
     `rotated_at` to authenticated SELECTs. RLS on the base table
     blocks direct reads from authenticated callers.
  2. `listSecretStatus()` returns `RedactedSecret[]` — the type
     literally has no `value` field.
  3. The set-form is `<input type="password" autoComplete="new-password">`
     with no GET path. The form input clears on success; the page
     re-renders with the new last4.

### D-016.3 Audit row records the rotation, NOT the value

**Decision:** Every `setSecret` call writes one `audit_log` row
with `action='platform_secret_rotated'`, `actor_role='super_admin'`,
`diff: {kind, rotated_at}`. The raw value (or last4) is NOT in
the diff. Constitution IV says audit rows are evidence-grade, but
"who rotated what kind, when" is sufficient evidence. Storing the
last4 in audit would let an attacker with audit-read access guess
keys faster.

### D-016.4 30-second in-memory cache, busted on rotation

**Decision:** `getSecret` caches the resolved value for 30 seconds
in module-local memory. Cache key is the `kind`. Rotation calls
`invalidateSecretCache(kind)` so the next request lands a fresh
read. 30s is the longest a stale value persists after a rotation;
shorter would hammer the DB on every Anthropic call.

### D-016.5 No `import "server-only"` on the secrets module

**Decision:** Removed `import "server-only"` from
`src/lib/secrets/getSecret.ts` because it broke vitest test runs
that load the module transitively via `src/lib/ai/providers/*`.
Server-only protection comes from `getSupabaseAdmin()` — the
admin client has its own browser-import guard
(`if (typeof window !== "undefined") throw ...`) which fires
before any value can leak to a client bundle.

---
