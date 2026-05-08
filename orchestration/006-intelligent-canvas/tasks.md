# Tasks — 006-intelligent-canvas

Ordered for TDD execution. Estimated working sessions: **4-5**.

---

## Group A — library + types + fixture

### A1. [setup] install framer-motion

- `npm install framer-motion@^12` (or latest React 19-compatible major).
- Verify `npm run build` still succeeds with the new dep present but
  unused. Commit deferred until A is done.

### A2. [unit] canvas types

- `src/lib/canvas/types.ts` defines `CanvasLead`, `CanvasActivity`, `CanvasData`.
- Test (`tests/lib/canvas/types.test.ts`): a satisfaction test asserting
  shape via `satisfies` — fails until types are written.

### A3. [unit] leadCanvasChannel helper

- `leadCanvasChannel(lead_id)` returns `canvas:lead:<lead_id>` exactly.
- Test asserts format + that the same input returns the same string
  (idempotent).

### A4. [unit] getLeadCanvas with mock client

- Mock supabase client with two `from` paths: `nodes` (the lead) and
  `nodes` joined with `edges` + `audit_log` (activities + agent_tier).
- Tests cover: happy path returns shape; missing lead returns null;
  schema-mismatch row still returns the row (renderer handles fallback);
  RLS-empty case returns null.

### A5. [unit] DEMO fixture

- `src/lib/canvas/fixture.ts` defines `DEMO_LEAD` + `DEMO_ACTIVITIES`
  per PRD §6.1 (Priya Sharma · 3 BHK · Bangalore).
- Test asserts `DEMO_LEAD.data` parses through `leadSchema`; activities
  array has at least one AI-author row (so the demo exercises the
  tier-badge code path).

### Commit checkpoint A

- [ ] All A tests pass.
- [ ] `npm run build` ✓.
- [ ] Commit: `feat(canvas): types + getLeadCanvas + demo fixture (D-006 group A)`

---

## Group B — primitive components

### B1. [unit] field-renderers — primitive types

- One test per kind: `string`, `email` (mailto), `phone` (tel:),
  `number`, `enum` (badge), `score` (color band by intent value).
- Each test renders a small React tree via RTL, asserts the right tag
  + classes are present.

### B2. [unit] field-renderers — empty value hides

- A renderer called with `null`/`undefined`/`""` returns `null` (the
  block renders nothing for that key). Progressive disclosure.

### B3. [unit] field-renderers — unknown kind fallback

- An `as any` of an unknown `kind` renders as `string`. Documented
  fallthrough; tested.

### B4. [unit] tier-badge

- Renders the right color + label for each tier T0–T4. For `null`
  agent_tier, renders nothing.

### B5. [unit] schema-mismatch fallback

- Component renders the warning header + audit-log link given a record_id.

### B6. [unit] suggested-action-slot empty state + slot

- Without `children`: renders empty-state copy + forward link to
  `/admin/directives`.
- With `children`: renders the children, hides the empty state.

### B7. [unit] agent-panel-slot empty state + slot

- Same shape as B6, but forward link goes to `/admin/agents`.

### Commit checkpoint B

- [ ] All B tests pass.
- [ ] Commit: `feat(canvas): adaptive field renderers + slot placeholders (D-006 group B)`

---

## Group C — composite components

### C1. [unit] canvas-section wrapper

- Renders `motion.div` with the documented variants. Honors a `delay`
  prop (used for staggering). Reduced-motion test (`matchMedia` mock
  returns `(prefers-reduced-motion: reduce) → true`) asserts no
  animation runs (rendered once, no transitions).

### C2. [unit] canvas-header

- Renders label + state badge + 3 primary fields. Snapshot-style
  assertion via RTL `getByText`/`getByLabelText`.

### C3. [unit] field-block

- Renders only primary fields in default state.
- Click "More" → non-primary fields visible. Click again → hidden.
- Reduced-motion: still toggles, but instantly.

### C4. [unit] activity-row

- Renders timestamp + label + body. AI-author row gets tier badge +
  audit-log link. Human row has no badge.

### C5. [unit] activity-stream

- Initial render: 3 fixture activities, newest at top.
- Hook receives a new event → component prepends.
- Cross-org event (different `organization_id`) is dropped before
  the merge (defense-in-depth filter unit-tested at the hook level
  in C6 too).

### C6. [unit] useLeadActivityStream hook

- Inject a mock supabase client that exposes a `channel(...)` factory.
- Hook subscribes on mount → mock channel emits an event → hook state
  prepends.
- Unmount calls `unsubscribe()`. Verified.

### C7. [unit] lead-canvas (the root)

- Section order: header → field-block → activity-stream →
  suggested-action → agent-panel.
- Reduced-motion mock: no animation values applied.
- Demo prop disables Realtime (hook is not called).
- Schema-mismatch on the lead's data → `<SchemaMismatch />` replaces
  field-block + activity-stream.

### Commit checkpoint C

- [ ] All C tests pass.
- [ ] `npm run build` ✓.
- [ ] Commit: `feat(canvas): LeadCanvas root + activity stream + realtime hook (D-006 group C)`

---

## Group D — pages, integration, e2e, baseline

### D1. [page] /dashboard/leads/demo

- Server page that imports the fixture and mounts `<LeadCanvas demo>`.
- Page-level test: a quick RTL render to assert the page returns a
  React tree without crashing on import.

### D2. [page] /dashboard/leads/[id]

- Server page that calls `getLeadCanvas`. On null → `notFound()`.
  Otherwise mounts `<LeadCanvas>`.
- Test: mock `getLeadCanvas` to return `null`; asserts `notFound()`
  is thrown.

### D3. [link] dashboard placeholder updates

- `src/app/(dashboard)/dashboard/page.tsx`: add a "View demo lead" link
  to `/dashboard/leads/demo` (one line below the existing copy).

### D4. [integration] canvas-rls

- Seed two orgs/workspaces; insert one lead + 3 activities in workspace A.
- A user authenticated for workspace B calls `getLeadCanvas(leadA.id)`
  via the workspace-B request-scoped client → returns null.
- Same call from workspace A → returns the data.

### D5. [integration] canvas-realtime-isolation

- Two clients (A in workspace A, B in workspace B) subscribe to
  `canvas:lead:<leadA.id>`.
- Insert an activity node attached to leadA.
- Assert: client A receives the broadcast; client B receives 0
  broadcasts within a 2s window.

### D6. [e2e@smoke] demo route renders

- Playwright spec: navigate to `/dashboard/leads/demo` (auth as a
  seeded sales_rep), see header text "Priya Sharma", see "More"
  button, click → see `email` field appear, see "✨ Suggested next
  action" empty state, see "🤖 Agent activity" empty state.

### D7. [e2e@smoke] /dashboard/leads/<bogus-uuid> 404

- Playwright spec: navigate to a non-existent lead ID, assert 404.

### D8. [doc] baseline 112 ratification

- `baseline/112-canvas-contract.md` written via the V5 ratify-script
  path (the same flow D-002 used for baseline 110). Locks: section
  order, slot contracts, channel naming convention, motion budget,
  reduced-motion contract, "expander not tab" rule, performance
  budget reference.

### D9. [doc] memory updates

- `memory/decisions.md`:
  - D-006.1 Framer Motion as the locked motion library
  - D-006.2 Defense-in-depth client-side org filter on Realtime broadcasts
  - D-006.3 Demo route ships before D-007 (a deliberate trade-off)
  - D-006.4 Operational canvas reads NOT audited (Constitution VII reserves `read_sensitive` for platform reads)
  - D-006.5 404 (not 403) on cross-tenant lead access
- `memory/learned/ai-crm/patterns.md`:
  - `canvas-stacked-sections-with-motion`
  - `realtime-channel-with-defense-in-depth-org-filter`
  - `slot-contract-with-empty-state-default`
  - `field-renderer-registry`

### D10. [verify] V5 Gate 4

- `npm run test`, `npm run test:integration`, `npm run test:smoke`,
  `npm run build`. Coverage report ≥ 80 / ≥ 90.

### D11. [deploy] preview

- Push triggers Vercel; existing env covers D-006.

### D12. [merge] PR

- `gh pr create --base v1 --head feature/006-intelligent-canvas`.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(canvas): types + getLeadCanvas + demo fixture (D-006 group A)` |
| B | `feat(canvas): adaptive field renderers + slot placeholders (D-006 group B)` |
| C | `feat(canvas): LeadCanvas root + activity stream + realtime hook (D-006 group C)` |
| D | `feat(canvas): pages + integration + baseline 112 + decisions (D-006 group D)` |

Final PR title: `feat: D-006 Intelligent Canvas (lead, read-only) + baseline 112`

---

## Reviewer questions for Plan Mode

1. **Framer Motion install — first motion lib in the repo. OK?** ~50KB
   gz. Used by every later canvas-touching directive (D-007, D-012, V1).
2. **Demo route at `/dashboard/leads/demo`** ships ahead of D-007 so
   the canvas is exercise-able. Alternative: integration test only,
   no demo page. Trade-off: demo page is one extra route but enables
   visual + Playwright smoke.
3. **Activity stream initial fetch is 50, no pagination.** OK for V0?
4. **Realtime channel naming `canvas:lead:<id>`.** Locks into baseline 112.
   Alternative considered: `org:<id>:lead:<id>` — rejected as redundant
   with RLS scoping.
5. **Cross-tenant access returns 404, not 403.** Existence-leak avoided.
   Plan Mode confirm.
6. **Operational canvas reads NOT audited.** Constitution VII reserves
   `read_sensitive` for *platform-tier* reads (D-004). Operational reads
   by the workspace's own rep are not. Alternative: write an audit row
   on every canvas mount. Rejected — would 10x audit_log volume in V0.
7. **Defense-in-depth client-side org filter on Realtime.** Even though
   Realtime respects RLS, we filter again on the client. Belt + suspenders.
   OK?
8. **"More" toggle — animated expander, not a tab.** Constitution IX
   compliant. Reviewer should confirm the spec language is clear.
9. **Baseline 112 ratification at end of D-006.** Locks contract for
   D-007/D-008/D-009/D-011. Reviewer should confirm scope of locked
   items: section order, slot contracts, channel naming, motion budget,
   performance budget reference.
10. **Tier badge derivation** joins `audit_log` to find `agent_tier`
    for each activity's `created_by`. Indexed; LEFT JOIN limited to
    50 rows. If perf is an issue, V1 caches `agent_tier` on the node.
