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

## provisioning-with-manual-rollback  (confidence: 1)

- First seen: D-004
- Description: Multi-step provisioning operations against Supabase (no
  client-side transactions) ship as: collect intermediate IDs in
  variables, run inserts in order in a try block, in the catch run
  compensating deletes in REVERSE order, then re-throw the original
  error. Best-effort cleanup — swallow rollback errors so the original
  failure surfaces. Tests must cover every failure point (after step 1,
  after step 3, etc.) and assert the DB returns to the empty pre-state.
- Anchor: `src/lib/platform/provision.ts`
  + `tests/lib/platform/provision.test.ts`.

## read-sensitive-audit-on-platform-reads  (confidence: 1)

- First seen: D-004
- Description: Service-role reads of operational metadata from
  super_admin surfaces write one `audit_log` row with
  `action='read_sensitive'` and `diff: { kind: '<surface>' }`. Pure
  aggregate counts (no per-row exposure) skip the audit. Constitution
  VII contract — every privileged read is observable.
- Anchor: `src/lib/platform/queries.ts` (listOrgs / getOrgDetail /
  recentAuditRows write the audit row; platformCounts does not).

## stacked-sections-not-tabs  (confidence: 1)

- First seen: D-004
- Description: For surfaces that PRD/spec describes as "tabs", use
  stacked Card sections instead. Constitution IX bans tabs in operational
  surfaces; the platform surface follows the same pattern for consistency.
  No client-state sync needed (SSR-friendly), and the page is more
  printer-friendly / search-engine-friendly without tabs hiding content.
- Anchor: `src/app/(platform)/platform/organizations/[id]/page.tsx`.

## wizard-state-machine-via-jsonb  (confidence: 1)

- First seen: D-005
- Description: Multi-step onboarding / wizard flows store their progress
  in a single `jsonb` column on the parent row (e.g. `organizations.
  onboarding_state`). The shape is defined by a Zod schema with strict
  defaults so the column accepts an empty `'{}'` payload. A helper
  function (`advanceStep`) is the only state-mutating entry point — it
  validates per-step Zod, applies the side-effect (existing tables when
  appropriate; jsonb when not), advances `current_step`, appends to
  `completed_steps`, and writes one audit row per advance. Stateless and
  re-entrant; the same step ID can be submitted twice without regressing.
- Anchor: `src/lib/admin/onboarding.ts` + `tests/lib/admin/onboarding.test.ts`.

## hard-gate-as-typed-error-class  (confidence: 1)

- First seen: D-005
- Description: When a flow has steps that cannot be skipped, enforce at
  the helper layer with a typed Error subclass (`OnboardingHardGateError`)
  carrying the offending step id. UI also hides "Skip" buttons for
  defense-in-depth, but the throw is the load-bearing enforcement —
  catches automation paths that don't go through the UI. Helpers separate
  validation errors (`OnboardingPayloadError` carrying Zod issues) from
  hard-gate errors so the action layer can map each to the right UX.
- Anchor: `src/lib/admin/onboarding.ts` (HARD_GATED_STEPS +
  OnboardingHardGateError).

## single-dispatcher-server-action  (confidence: 1)

- First seen: D-005
- Description: When a UI walks N similar steps that all dispatch to the
  same backend helper, ship ONE server action that reads the step id
  from FormData and routes accordingly, rather than N separate actions.
  Each step's UI sets `<input type="hidden" name="step" value="..."/>`
  and the rest of its fields; `extractPayload(step, fd)` is a typed
  helper that pulls the right shape per step. Saves ~150 lines of
  boilerplate with no behavioural difference. Splits later are trivial
  if any step grows complex enough.
- Anchor: `src/app/(admin)/admin/onboarding/actions.ts`
  (onboardingAction + extractPayload).

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
- Reinforced: D-006 (`getLeadCanvas` accepts an optional `client?` arg
  for unit tests; production caller passes none and the function falls
  back to `createSupabaseServerClient`).
- Description: Functions that need a Supabase client (e.g.
  `getCurrentUser`) accept it as an optional argument. Production
  callers pass none and get a request-scoped server client; tests pass
  a mock. Avoids module-level singletons in business logic.
- Anchor: `src/lib/auth/getCurrentUser.ts`,
  `src/lib/canvas/api.ts`,
  `tests/lib/auth/getCurrentUser.test.ts`,
  `tests/lib/canvas/api.test.ts`.

## stacked-sections-with-motion  (confidence: 1)

- First seen: D-006
- Description: Operational surfaces that PRD describes as cards / panels
  / tabs use stacked sections wrapped in a motion-aware section
  component. Each section gets a staggered reveal (`opacity 0→1`,
  `y 8→0`, `delay = index * 0.05s`). A `<MotionConfig reducedMotion="user">`
  at the root honors the user's `prefers-reduced-motion` preference and
  short-circuits all transitions to instant. Tests assert section order
  + presence; reduced-motion is asserted by mounting inside a
  `MotionConfig reducedMotion="always"` and checking that children render
  without throwing — Framer's reduced-motion path is a different code
  branch but the tree shape is identical.
- Anchor: `src/components/canvas/canvas-section.tsx`,
  `src/components/canvas/lead-canvas.tsx`,
  `tests/components/canvas/canvas-section.test.tsx`,
  `tests/components/canvas/lead-canvas.test.tsx`.

## realtime-channel-with-defense-in-depth-org-filter  (confidence: 1)

- First seen: D-006
- Description: Supabase Realtime subscriptions for tenant-scoped channels
  layer two filters: (1) RLS, server-side, load-bearing; (2) a
  client-side `organization_id` (and optional `workspace_id`) check that
  drops broadcasts whose payload doesn't match the current canvas's
  scope, BEFORE merging into local state. The client check exists in
  case of a Realtime regression or future RLS gap — Constitution II says
  tenant isolation is architecturally impossible, not policy-prevented.
  Cost: one comparison per message. Tested by injecting a mock channel
  and emitting a cross-org payload; the hook must drop it.
- Anchor: `src/components/canvas/realtime.ts`,
  `tests/components/canvas/realtime.test.tsx`,
  `tests/integration/canvas-realtime-isolation.test.ts`.

## slot-contract-with-empty-state-default  (confidence: 1)

- First seen: D-006
- Description: When a UI surface needs a forward-compatible slot for a
  not-yet-built feature (DOE engine, agent panel, etc.), ship the slot
  as a component that takes optional `children`. Without children, it
  renders an empty-state copy + a forward link to the placeholder
  surface that will eventually populate it. With children, it renders
  the children inside the same `<Card>` chrome and flips a
  `data-empty="false"` attribute for tests/styling. The shape is the
  open API for future directives — they implement the children, the
  slot's wrapping chrome stays stable.
- Anchor: `src/components/canvas/suggested-action-slot.tsx`,
  `src/components/canvas/agent-panel-slot.tsx`,
  `tests/components/canvas/slots.test.tsx`.

## field-renderer-registry  (confidence: 1)

- First seen: D-006
- Description: Type-aware UI rendering for polymorphic data uses a
  declarative registry: `const X_FIELDS = [{ key, label, kind, primary }]
  as const` driving a `<FieldValue kind value>` component that switches
  on `kind` (`string`/`email`/`phone`/`number`/`enum`/`score`/...).
  Empty values hide the row entirely (progressive disclosure).
  Unknown kinds fall through to `string`. Adding a new field type =
  add a case in the switch + a new descriptor in the registry. No
  per-type subcomponent explosion; tests cover one renderer per kind +
  the empty-value + unknown-kind branches.
- Anchor: `src/components/canvas/field-renderers.tsx`,
  `tests/components/canvas/field-renderers.test.tsx`.

## rsc-server-only-vs-client-safe-split  (confidence: 1)

- First seen: D-006
- Description: When a Server Component module (e.g. `lib/canvas/api.ts`
  importing `next/headers` via `createSupabaseServerClient`) shares
  helpers with Client Components (e.g. a channel-name formatter), split
  the helpers into a separate file (`lib/canvas/channel.ts`) that has
  zero server-only imports. Otherwise the bundler pulls the entire
  server module into the client bundle and the build fails with
  "Ecmascript file had an error" pointing at `next/headers`. Discovered
  at `npm run build` time; the build is the load-bearing detector.
- Anchor: `src/lib/canvas/api.ts`, `src/lib/canvas/channel.ts`,
  `src/components/canvas/realtime.ts`.

## state-machine-as-pure-record  (confidence: 1)

- First seen: D-007
- Description: Domain state machines (lead lifecycle, deal pipeline,
  document workflow) are encoded as
  `Readonly<Record<S, readonly S[]>>` literal in a
  `src/lib/<domain>/transitions.ts` module, paired with
  `allowedTransitions(s)`, `isTerminal(s)`, and
  `assertTransitionAllowed(from, to)` pure helpers (`assert*` throws a
  typed `Illegal*Error`). Tests cover every (from, to) pair via a
  matrix loop so adding a new state mechanically extends coverage.
  No DB CHECK constraint — the audit log is the regulator's view.
- Anchor: `src/lib/leads/transitions.ts`,
  `tests/lib/leads/transitions.test.ts`.

## terminal-transition-requires-reason  (confidence: 1)

- First seen: D-007
- Description: Zod transition schemas use `.superRefine` to require a
  non-empty `reason` field iff the `target_state` is in the
  `TERMINAL_STATES` set. Forward transitions don't require a reason.
  This pattern matches RERA-style audit expectations: the audit log
  always carries `{ from, to }`; for terminal moves, also `{ reason }`.
  The UI's transition footer encodes the same split — forward buttons
  fire the action directly; terminal buttons open a reason sub-dialog.
- Anchor: `src/lib/leads/schemas.ts` (`transitionInputSchema`),
  `src/components/canvas/transition-footer.tsx`.

## domain-helper-with-distinct-audit-shape  (confidence: 1)

- First seen: D-007 (`transitionLead` vs D-002's `updateNodeData`)
- Description: When two write paths against the same table need
  different audit-log diff shapes (e.g. `{ before, after }` for full
  updates vs `{ from, to, reason? }` for state changes), give each its
  own helper instead of widening one helper to carry both shapes.
  Encapsulate in `src/lib/<domain>/api.ts` so the audit-shape choice is
  obvious at the call site. An integration test asserts the diff shape
  end-to-end against the real DB.
- Anchor: `src/lib/leads/api.ts` (`transitionLead`),
  `tests/integration/lead-create-edit-transition.test.ts`.

## server-action-result-discriminated-union  (confidence: 1)

- First seen: D-007
- Description: Server Actions return a discriminated union
  `{ ok: true; data? } | { ok: false; error: 'permission' | 'validation' | 'unknown'; fieldErrors?; message? }`
  rather than throwing. Callers `switch (result.error)` to render the
  right inline UI (permission banner, per-field error map, form-level
  error). Keeps the action contract typed without exceptions crossing
  the RSC boundary. `IllegalTransitionError` (from a domain helper)
  is mapped to `{ error: 'validation' }` at the action layer.
- Anchor: `src/app/(dashboard)/dashboard/_actions/leads.ts`,
  `tests/app/dashboard/_actions/leads.test.ts`.

## whole-surface-edit-mode-toggle  (confidence: 1)

- First seen: D-007 (LeadCanvas)
- Description: Operational surfaces start with a clear "Edit" button at
  the top; clicking it swaps the read-only Header + Field block for an
  editable form rendered in the same section slot. Activity Stream and
  forward sections continue to render. The component-local `editing`
  state is the single bit driving the swap; no per-field hover affordance,
  no inline click-to-edit. Per-field inline is V1 once usage tells us
  which fields actually deserve the optimization.
- Anchor: `src/components/canvas/lead-canvas.tsx` (`editing` state +
  EditModeButton/EditLeadForm switch),
  `tests/components/canvas/lead-canvas-extras.test.tsx`.

## caller-org-filter-on-service-role-mutation  (confidence: 2)

- First seen: D-007 (caught by Gate-4 security scan as a CRITICAL IDOR
  before merge; closed in the same gate)
- Description: Any server action that mutates a tenant-owned row via
  the service-role admin client (which bypasses RLS) MUST prove the
  row belongs to the caller's `organization_id` BEFORE the mutation.
  Two viable patterns: (a) **helper-internal** — make the helper
  require `caller_org_id` as a non-optional argument so TypeScript
  enforces it at every call site, and have the helper's SELECT chain
  filter by `organization_id`; (b) **action-layer pre-check** — add a
  small `assertLeadInTenant`-style helper that does a filtered SELECT
  and returns null on mismatch, then the action returns the same
  "validation: not found" shape as a genuine missing row (no
  existence leak). Pattern (a) is preferred for new helpers; pattern
  (b) is the right escape hatch when the underlying mutator (e.g.
  D-002's `updateNodeData`) cannot be widened. Both paths emit the
  IDENTICAL action result for genuine-missing and cross-tenant —
  confirmed by tests so we can't accidentally leak existence later.
- Anchor: `src/lib/leads/api.ts` (`transitionLead` requires
  `caller_org_id`), `src/app/(dashboard)/dashboard/_actions/leads.ts`
  (`assertLeadInTenant` pre-check),
  `tests/lib/leads/api.test.ts` (cross-tenant unit test),
  `tests/integration/lead-create-edit-transition.test.ts`
  (cross-tenant integration test).

## rtl-vitest-setup-with-env-stub  (confidence: 1)

- First seen: D-006
- Description: To unit-test React components in Vitest with React
  Testing Library, the setup file must (1) import
  `@testing-library/jest-dom/vitest`, (2) register `afterEach(cleanup)`
  so RTL's auto-cleanup runs between tests (vital for `it.each`
  iterations that would otherwise accumulate DOM), and (3) `vi.stubEnv`
  fake values for `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` so any test that lazily
  constructs the browser client doesn't throw. JSDOM environment is
  selected per-file via `// @vitest-environment jsdom` pragma rather
  than `environmentMatchGlobs` (removed in vitest 4.x). The vitest
  config also needs `@vitejs/plugin-react` for JSX/TSX transform.
- Anchor: `tests/setup-rtl.ts`, `vitest.config.ts`.

## bounded-command-catalog-literal  (confidence: 1)

- First seen: D-008
- Description: Surfaces that need a stable, discoverable list of
  user-invokable commands (Cmd+K palettes, NL command bars,
  copilot-style action menus) ship the catalog as an `as const` array
  in a single TS file. Each entry has a stable kebab-case `id`, a
  `kind` discriminator (`navigate`/`action`/`lookup-prefix`/
  `placeholder` for V0; `nl-compile` for V1+), a per-kind payload
  (target URL, action key, sub-mode prefix), and an optional
  `requires[]` permission gate. The literal IS the compiled artifact
  per Constitution X (NL-Compile-Then-Apply); free-form NL is a
  later layer that compiles user input INTO this literal's IDs.
  Tests assert ID uniqueness, group/kind/permission membership,
  per-kind payload validity, kebab-case ID.
- Anchor: `src/lib/cmdk/catalog.ts`, `src/lib/cmdk/types.ts`,
  `tests/lib/cmdk/catalog.test.ts`.

## permission-gated-command-visibility  (confidence: 1)

- First seen: D-008
- Description: A pure `visibleCommands(catalog, perms)` filter takes
  the catalog literal + the user's resolved permission set and
  returns the subset where every entry in `requires[]` is held.
  Commands with no `requires` are always visible. Hide-don't-disable:
  a permission-failing command is ABSENT from the rendered list, no
  spinner, no tooltip — same precedent as D-001. Permissions resolved
  ONCE per request server-side; serialized as `string[]` to the
  Client palette via the layout's props bridge.
- Anchor: `src/lib/cmdk/permissions.ts`,
  `src/app/(dashboard)/layout.tsx`,
  `tests/lib/cmdk/permissions.test.ts`.

## dialog-state-via-react-context-provider  (confidence: 1)

- First seen: D-008 (`NewLeadDialogProvider` lifted from D-007's
  self-contained `<NewLeadDialog>`)
- Description: When a dialog needs to open from multiple call sites
  (Cmd+K command, page button, future toolbar), refactor the dialog
  to a controlled component (`open` + `onOpenChange`) and mount it
  ONCE inside a Context Provider at the route-group layout. The
  Provider owns open state; consumers call
  `useDialogContext().openDialog()` imperatively. Avoid event buses
  (untyped + extra dep), URL state (bookmarkable open-state we don't
  want), and module-level stores (no shared infrastructure justifies
  it yet).
- Anchor: `src/components/dashboard/new-lead-dialog-context.tsx`,
  `src/app/(dashboard)/layout.tsx`,
  `tests/components/dashboard/new-lead-dialog-context.test.tsx`.

## lookup-prefix-submode-in-cmdk  (confidence: 1)

- First seen: D-008
- Description: For commands that need server-side fuzzy lookup
  (Open lead by name…, Open deal by name…), use a two-mode palette:
  `mode: 'catalog' | 'lookup'`. Selecting a `kind: 'lookup-prefix'`
  command transitions to lookup mode; subsequent input drives a
  debounced server-action search. Esc collapses back to catalog via
  `onKeyDownCapture` + `stopPropagation` so the parent Dialog doesn't
  close. Selecting a result navigates + closes. Debounce 200ms;
  LIMIT 8; ORDER BY recency. ILIKE pattern with proper `% _ \\`
  escaping. Operational reads are NOT audited.
- Anchor: `src/components/cmdk/command-palette.tsx`,
  `src/components/cmdk/lookup-results.tsx`,
  `src/app/(dashboard)/dashboard/_actions/searchLeads.ts`.

## ilike-escape-user-input  (confidence: 1)

- First seen: D-008
- Description: When interpolating user input into a PostgREST
  `.ilike()` / `.or('label.ilike.%X%')` filter, escape LIKE-special
  characters (`%`, `_`, `\`) with a leading backslash before wrapping
  with `%`s. Otherwise a user typing `50%` would over-match every row
  containing `50` followed by arbitrary characters. Defensive even
  though Postgres-side injection is parameterized — this is about
  user-intent semantics, not SQLi.
- Anchor: `src/app/(dashboard)/dashboard/_actions/searchLeads.ts`
  (`escaped = trimmed.replace(/[\\%_]/g, ...)`).

## jsdom-polyfill-resizeobserver-and-scrollintoview  (confidence: 1)

- First seen: D-008 (cmdk in jsdom)
- Description: The `cmdk` library (and most Radix primitives) reach
  for `ResizeObserver` and `Element.prototype.scrollIntoView` for
  layout / focus management. Neither ships in jsdom. Define no-op
  polyfills in `tests/setup-rtl.ts` so RTL component tests mount
  these primitives without crashing. Tests assert behavior, not
  layout — no-ops are safe.
- Anchor: `tests/setup-rtl.ts`.
