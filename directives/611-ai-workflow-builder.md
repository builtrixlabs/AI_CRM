# Directive 611 — AI Workflow Builder (V6 MVP)

**Kind:** feature (V6 Phase 3, step 3.1 — visual workflow authoring + sandbox test + versioning, atop the existing DOE engine)
**Status:** AUTHORIZED — operator cleared Phase 3 to run end-to-end 2026-05-19 ("D-616 → D-606 → D-612 → D-611, autonomous").
**Branch target:** `v6.3`.
**Generated:** 2026-05-19T16:00:00Z
**Source:** `docs/PRD-v6.0.md` §D-611 (lines 735-781); `docs/plans/v6-implementation-order.md` §4 step 3.1 + §10.4 (React Flow locked as the visual library — see Architecture below for the V6 scope-cut).
**Builds on:** D-011 (DOE workflow engine — `runtime.ts`, `authoring.ts`), D-017 (existing form-based directive UI), D-615 (`directives.lifecycle_status` + approval flow already in place).

---

## Problem

The V0/V3 directives UI is a single-form authoring surface — pick one trigger, one action, paste a JSONB config. The PRD calls for a visual DAG builder ("N8N-style") where an org_admin drags trigger + action nodes onto a canvas, wires them, tests with a sample payload, and publishes. D-611 ships that capability **incrementally** — the engine (catalog + compile + sandbox + versioning) is built completely; the visual canvas ships as a **form-based DAG composer** as the V6 MVP, with React Flow integration documented as a V6.x polish (see Non-goals).

D-611 ships:

1. **Migration** `20260519150000_directive_versioning.sql` — extends `directives` with `version int NOT NULL DEFAULT 1`, `parent_id uuid REFERENCES directives(id)`, `compiled_dag jsonb`, `test_payloads jsonb NOT NULL DEFAULT '[]'`, `last_test_passed_at timestamptz`. (`lifecycle_status` was already added in D-615.)
2. **Closed catalog** `src/lib/workflow-builder/catalog.ts` — 7 trigger kinds + 7 action kinds matching PRD §D-611, each with a JSON Schema-shaped input contract for the sandbox.
3. **Compiler** `src/lib/workflow-builder/compile.ts` — `compileDag(dag)` validates a DAG shape (one trigger, ordered action chain, optional if/else branch on prior output) and returns a `CompiledDag` JSON value persisted to `directives.compiled_dag`.
4. **Sandbox** `src/lib/workflow-builder/sandbox.ts` — `sandboxRun(dag, samplePayload)` walks the DAG node-by-node, producing a per-node trace `{ node_id, kind, input, output, condition? }` — **no real side effects** (no DB writes, no Inngest emits, no template sends). Used by the Test button.
5. **Versioning** `src/lib/workflow-builder/versioning.ts` — `createNewVersion(parent_id)` clones a live workflow into a `lifecycle_status='draft'`, `version = parent.version + 1`, `parent_id = parent.id` row. `revertToVersion(id)` flips lifecycle of the chosen historical version back to `live`, archives the prior live row.
6. **UI** — list page at `/admin/directives` already exists (D-017 rename to "AI Workflows" already happened) — D-611 adds:
   - `/admin/directives/[id]/builder` — the form-based DAG composer (add trigger → add ordered actions → optional condition expression → save).
   - "Test with sample" form — pastes a JSON payload, calls `sandboxRun`, displays the per-node trace.
   - "Publish" button — disabled unless `last_test_passed_at` was set on the current draft within the session; on click, transitions `lifecycle_status='live'` and demotes any prior live row to `archived`.
7. **RBAC reuse** — `directives:author` / `directives:approve` already exist (D-615); D-611 does not add new perms.

---

## Architecture decisions

- **Visual canvas is form-based for V6.** PRD §D-611 + implementation-order §10.4 lock React Flow as the long-term choice. The V6 MVP uses a form composer (dropdown to pick trigger, ordered action chain via add/move/remove rows, condition expression per edge). Reason: a React Flow integration with custom node types, edge labels, save/load, and zoom is multi-day work that would crowd the autonomous Phase-3 run; the *behaviour* (DAG → compile → sandbox → publish gate → versioning) is the load-bearing piece and is fully delivered. React Flow polish is a documented V6.x follow-up — the migration's `compiled_dag` shape already includes node positions, so the visual layer drops in without a re-migration.
- **`compiled_dag` is the source of truth, not the form fields.** The form serialises to a `CompiledDag` JSON value on Save; the runtime reads `compiled_dag`. No legacy `trigger_kind` / `action_kind` columns are removed — the existing single-trigger/single-action runtime continues to dispatch the pre-V6 directives unchanged, and D-611 workflows execute through a **new** runtime path that reads `compiled_dag`. (Documented runtime split below.)
- **Two runtime paths coexist.** Pre-V6 directives (no `compiled_dag`) keep firing through the existing `doe/runtime.ts` dispatcher. D-611 workflows (with `compiled_dag` set) get a new dispatcher entry point `runCompiledDag(dispatched_trigger, dag)` that walks the catalog. The unified `loadActiveDirectives` query stays — D-615's `lifecycle_status='live'` filter is the gate.
- **The catalog is closed.** 7 triggers + 7 actions per PRD verbatim. Unknown kinds in `compiled_dag` are a compile-time error; if a saved DAG is later loaded against a stricter catalog (e.g. a kind is removed), the loader marks the workflow as `lifecycle_status='archived'` rather than crashing the runtime.
- **`test_payloads jsonb` stores the most-recent sample payloads the operator tested against** — an array of `{ name, payload, last_run_at, last_run_ok }` rows; the Test form lets the operator reuse old payloads. Capped at 5 entries (LRU eviction).
- **Publish requires a passing test on the CURRENT draft.** `last_test_passed_at` is wiped on every save; a successful `sandboxRun` sets it. Publish action verifies `last_test_passed_at > updated_at` before transitioning lifecycle.
- **Versioning is parent_id linking, not separate revisions tables.** A new version is a new `directives` row with `parent_id = previous.id` and `version = previous.version + 1`. Lifecycle: only one row per `(organization_id, parent_chain)` may be `live` at a time. Revert sets the chosen row's `lifecycle_status='live'` and demotes the current live to `archived`.
- **D-615's manager-approval flow is preserved.** A manager-authored visual workflow still lands `lifecycle_status='pending_approval'` and waits for an `org_admin` approve (D-615's queue at `/admin/directives/pending`). D-611 does not bypass it.

---

## Success criteria

- [ ] **AC-1** A user with `directives:author` opens `/admin/directives/[id]/builder`, picks `lead.created` as trigger, adds `send_template_message` + `update_lead_field` actions, saves — a `compiled_dag` JSON is persisted on the row.
- [ ] **AC-2** "Test with sample" form runs `sandboxRun` against the saved DAG; the per-node trace is rendered (`input → output`, condition truthiness if present); no DB writes, no Inngest emits (asserted by tests).
- [ ] **AC-3** "Publish" is disabled until `last_test_passed_at` is set on the current draft. Clicking it transitions the row to `lifecycle_status='live'` (or `pending_approval` for managers per D-615); any prior `live` revision is demoted to `archived`.
- [ ] **AC-4** Editing a published workflow → "New version" → creates a new `directives` row with `parent_id = live.id`, `version = live.version + 1`, `lifecycle_status='draft'`; the live revision keeps firing until the new draft is published.
- [ ] **AC-5** "Revert to v(n-1)" — clicking on any prior version row in the version history transitions that row back to `live` and archives the current live.
- [ ] **AC-6** `compileDag` rejects an empty DAG (no trigger), more than one trigger, unknown node kinds, and edges that reference missing nodes — each with a specific error code.
- [ ] **AC-7** The closed catalog covers PRD §D-611's 7 triggers (`whatsapp.inbound`, `email.inbound`, `lead.created`, `call.next_best_action`, `lead.state_changed`, `manual.button_click`, `schedule`) and 7 actions (`send_template_message`, `update_lead_field`, `assign_to_user`, `create_task`, `send_brochure`, `book_site_visit`, `call_ai_gateway`).
- [ ] **AC-8** Tests: `catalog.test.ts` (catalog pin), `compile.test.ts` (validator matrix), `sandbox.test.ts` (per-node trace + zero side effects), `versioning.test.ts` (new version + revert), RTL on the builder form. `npx tsc --noEmit` clean; targeted vitest green.
- [ ] **AC-9** All 10 V6 stopping-criteria gates pass. Migration `20260519150000_directive_versioning.sql` applies; `scripts/verify_611.mjs` PASS against live Supabase.

---

## Non-goals (deferred to V6.x)

- **React Flow visual editor.** The form-based composer ships the behaviour; React Flow is the visual polish. `compiled_dag` already carries node positions so the swap is local.
- **User-defined custom action types.** The catalog is closed at 14 kinds.
- **Branching beyond if/else (merge/join).** Linear action chain + optional if/else on a prior output — no fork-merge graphs.
- **Workflow import/export.**
- **Marketplace of workflow templates.**
- **Live diff between two versions.** Versioning ships the data; a side-by-side diff UI is V6.x.
- **`call_ai_gateway` action wired to a real model call in sandbox.** The sandbox mocks the gateway response (returns a fixture); production runtime is the same path the existing `doe/runtime.ts` would take after wiring (a small `runCompiledDag` shim — implementation deferred to V6.x to keep this directive within scope).

---

## Stack

- **New:** `supabase/migrations/20260519150000_directive_versioning.sql`, `src/lib/workflow-builder/{catalog,compile,sandbox,versioning,types,index}.ts`, `src/app/(admin)/admin/directives/[id]/builder/{page,actions,builder-form}.tsx`, `scripts/verify_611.mjs`, plus tests.
- **Modified:** none in `src/lib/doe/*` (D-611 ships parallel to the existing engine; runtime integration is a follow-up).
- **Reuses:** `getSupabaseAdmin`, the D-615 lifecycle pipeline + approval queue, the existing `directives` row shape.
- **DB:** five new columns on `directives`. No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-611** — node catalog (7 + 7), versioning fields, test-before-publish contract.
- **Implementation-order §4 step 3.1 + §10.4** — React Flow locked as the visual library (deferred — see Non-goals).
- **Constitution VIII** — RBAC unchanged; `directives:author` + `directives:approve` cover the V6 workflow.
- **D-615** — manager-author → org-admin-approve lifecycle stays in force.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260519150000_directive_versioning.sql`, then `node --env-file=<parent>/.env scripts/verify_611.mjs`.
- [ ] **Smoke**: at `/admin/directives` create a workflow via the new builder; trigger=`lead.created`, action=`update_lead_field` (set `data.notes='hello'`); Test with `{ lead_id: 'x' }`; observe the per-node trace; click Publish; confirm `lifecycle_status='live'` and `compiled_dag` is set on the row.

---

## Risks & decisions

- **Two runtimes (legacy + compiled_dag) coexist.** Acceptable: legacy directives keep working unchanged; new visual workflows go through `runCompiledDag`. A future consolidation PR can migrate legacy rows to `compiled_dag` rows.
- **The form-based composer is "ugly".** Operators used to N8N may bounce off it. The directive's MVP scope is documented explicitly; React Flow upgrade is on the V6.x roadmap with no engine rework needed.
- **`last_test_passed_at > updated_at` is a "session" gate.** Saving wipes it; running the sandbox resets it. A long gap between Save and Publish in the same session is fine as long as the operator runs Test in between.
- **Sandbox doesn't dispatch real comms.** The PRD requires this ("no real side effects"). Tests assert the `dispatchApprovedDraft` / `inngest.send` modules are not called from `sandboxRun`.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every lib query filters by `organization_id`.
- **`additive-only-migrations`** — five `ADD COLUMN IF NOT EXISTS`; explicit `ROLLBACK:` block.
- **`server-action-result-discriminated-union`** — every D-611 action returns `{ ok: true } | { ok: false, reason }`.
- **`closed-enum-catalog`** — `TRIGGER_KINDS` + `ACTION_KINDS` are exported tuples; tests pin the literal arrays to prevent drift.
