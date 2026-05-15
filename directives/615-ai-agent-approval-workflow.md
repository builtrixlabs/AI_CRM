# Directive 615 — AI Agent Approval Workflow (Manager authors → Org Admin approves)

**Kind:** feature (V6 Phase 2, step 2.6 — closes Phase 2)
**Status:** AUTHORIZED — operator cleared Phase 2 steps 2.5 + 2.6 to run end-to-end 2026-05-15 ("begin 614 and 615 … implement … push it on phase 2 branch")
**Branch target:** `v6-phase-2` (via `feature/614-615-msg-policies-approval-workflow`)
**Generated:** 2026-05-15T00:00:00Z
**Source:** `docs/PRD-v6.0.md` §D-615 (lines 886-904); `docs/plans/v6-implementation-order.md` §3 + §4 step 2.6.
**Builds on:** D-017 (`src/lib/doe/authoring.ts` — `createCustomDirective`, `toggleDirective`, the `/admin/directives` surface), D-011 (`src/lib/doe/runtime.ts` — `loadActiveDirectives`, the firing path), D-003 (`rbac.ts` — `directives:author` / `directives:approve` permissions, the `manager` role).

---

## Problem

Today an "AI Workflow" (a `directives` row) goes live the moment it is authored — and only `org_admin` / `org_owner` can author one. There is no way for a `manager` to propose a workflow, and no approval gate between "authored" and "firing across the team".

D-615 adds the gate. A `manager` (or any author who lacks `directives:approve`) creates a workflow → it lands `lifecycle_status='pending_approval'`, **disabled**, and does **not** fire. An org admin sees it in a pending-approval queue and approves (→ `live`, enabled, fires) or rejects (→ `archived`, with a reason). Both decisions are audit-logged. An org-admin-tier author still self-publishes straight to `live` — they *are* the approver.

### Architecture decisions

- **`lifecycle_status` is a new column on `directives`, not a new table.** PRD §D-615 + implementation-order §6 (`ai_workflow_versioning.sql`, attributed to D-611) both put the lifecycle on the `directives` row. D-615 lands the **subset D-611 will later extend** — `lifecycle_status` plus the approval-audit columns — exactly as D-602 landed the four `base_role` enum values ahead of "D-003 ext". Values: `live` (the default — every existing directive is already live), `pending_approval`, `archived`.
- **The runtime gate is one filter line.** `loadActiveDirectives` already filters `enabled=true` + `deleted_at IS NULL`; D-615 adds `lifecycle_status='live'`. A `pending_approval` workflow is therefore inert at the runtime regardless of its `enabled` flag — and `toggleDirective` flipping `enabled` on a non-live row still can't make it fire. The runtime change is additive and the migration's `DEFAULT 'live'` means every pre-D-615 row keeps firing unchanged.
- **`createCustomDirective` keys the lifecycle off the author's permissions, not a role string match.** "Can self-publish" = "holds `directives:approve`" — `BASE_ROLE_PERMS[actor_role].has('directives:approve')`. That ties the gate to the actual permission catalog: `org_admin` / `org_owner` self-publish to `live`; `manager` / `workspace_admin` land `pending_approval` + `enabled=false` with `submitted_by` / `submitted_at` stamped.
- **`manager` gains `directives:author`.** It is added to `MANAGER_OPERATIONAL` (so it cascades to `workspace_admin`, consistent with the existing role hierarchy). Authoring is a TS-literal change — no migration. The existing `directiveAction` dispatcher already passes `actor_role` to `createCustomDirective`, so no server-action change is needed for authoring.
- **Approval lives in `authoring.ts` alongside its siblings.** `listPendingWorkflows`, `approveWorkflow`, `rejectWorkflow` join `toggleDirective` / `createCustomDirective` — same `caller-org-filter-on-service-role-mutation` shape, same `DirectiveAuthoringError`, same audit-row-per-mutation. The new `/admin/directives/pending` surface gets its own server actions gated on `directives:approve` (distinct from the `/admin/directives` dispatcher's `directives:author` gate).
- **Rejection is `archived`, not a distinct `rejected` state.** PRD §D-615: "Rejection moves to `archived` with reason." `rejection_reason` being non-null distinguishes a rejection-archive from any other archive. A rejected workflow is terminal — it does not return to the queue.

D-615 ships:

1. **Migration** `supabase/migrations/20260515120100_directive_lifecycle.sql` — `directives` gains `lifecycle_status` (CHECK `live|pending_approval|archived`, default `live`) + `submitted_by` / `submitted_at` / `decided_by` / `decided_at` / `rejection_reason`, plus a partial index for the pending queue. Additive, idempotent, `ROLLBACK:` block.
2. **Runtime gate** `src/lib/doe/runtime.ts` — `loadActiveDirectives` adds `.eq('lifecycle_status','live')`.
3. **Authoring** `src/lib/doe/authoring.ts` — `createCustomDirective` sets the lifecycle from the author's permissions; `listPendingWorkflows` / `approveWorkflow` / `rejectWorkflow` added.
4. **Permission** `src/lib/auth/rbac.ts` — `directives:author` added to `MANAGER_OPERATIONAL`.
5. **Pending-queue UI** `src/app/(admin)/admin/directives/pending/` — `page.tsx` (gated `directives:approve`), `actions.ts` (`approveWorkflowAction` / `rejectWorkflowAction`), `pending-queue.tsx` (client; approve / reject-with-reason).
6. **Verify** `scripts/verify_615.mjs` — column + CHECK + index.
7. **Tests** — `authoring.test.ts` extensions, `tests/lib/doe/workflow-approval.test.ts`, `tests/app/admin/directives/pending/actions.test.ts`, `tests/components/pending-queue.test.tsx`, `tests/integration/directive-lifecycle.test.ts`.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** A `manager` authoring a workflow via `createCustomDirective` produces a `directives` row with `lifecycle_status='pending_approval'`, `enabled=false`, and `submitted_by` / `submitted_at` stamped — it is **not** live (PRD AC-1).

- [ ] **AC-2** An `org_admin` / `org_owner` authoring a workflow produces a row with `lifecycle_status='live'` and `enabled` honouring the input — the pre-D-615 behaviour for the only roles that could author before.

- [ ] **AC-3** `loadActiveDirectives` returns only `lifecycle_status='live'` rows — a `pending_approval` workflow never fires at the runtime, even if its `enabled` flag is true.

- [ ] **AC-4** `approveWorkflow` on a `pending_approval` row sets `lifecycle_status='live'`, `enabled=true`, stamps `decided_by` / `decided_at`, and writes an `audit_log` row (`action='workflow_approved'`). Approving a row that is not `pending_approval` throws `DirectiveAuthoringError(kind:'conflict')` (PRD AC-2).

- [ ] **AC-5** `rejectWorkflow` requires a reason ≥ 10 characters — a shorter reason throws `DirectiveAuthoringError(kind:'invalid')` with no write. A valid rejection sets `lifecycle_status='archived'`, `enabled=false`, stamps `decided_by` / `decided_at` / `rejection_reason`, and writes an `audit_log` row (`action='workflow_rejected'`) (PRD AC-3).

- [ ] **AC-6** Cross-org isolation: `approveWorkflow` / `rejectWorkflow` / `listPendingWorkflows` all filter by `caller_org_id` — an org admin cannot see or decide another org's pending workflow; a cross-org `directive_id` resolves to `not_found`.

- [ ] **AC-7** `/admin/directives/pending` is gated on `directives:approve`; it lists the org's `pending_approval` workflows with Approve / Reject (reason) controls. `approveWorkflowAction` / `rejectWorkflowAction` are gated the same way and return the `server-action-result-discriminated-union` shape.

- [ ] **AC-8** `manager` holds `directives:author` — `resolveForUser` for a manager includes it, so `directiveAction`'s existing gate admits a manager-authored `create`.

- [ ] **AC-9** Tests: `authoring` extended (manager → pending, org_admin → live); `workflow-approval` unit (approve, reject, reason floor, conflict, cross-org); `pending/actions` unit (permission gate); `pending-queue` RTL; `directive-lifecycle` integration (runtime gate + approve/reject round-trip on live Supabase). `npx tsc --noEmit` clean for changed files; full vitest suite green.

- [ ] **AC-10** Migration `20260515120100_directive_lifecycle.sql` applies via `scripts/apply_migration.mjs`; `scripts/verify_615.mjs` all-PASS against live Supabase.

---

## Non-goals (deferred)

- **The N8N-style visual workflow builder** — D-611 (Phase 3). D-615 keeps the existing form-based authoring; it only adds the lifecycle gate around it.
- **`directives.version` / `parent_id` / `compiled_dag` / `test_payloads`** — the rest of implementation-order §6's `ai_workflow_versioning.sql`; D-611's job. D-615 lands `lifecycle_status` + the approval-audit columns only.
- **Re-submitting a rejected workflow** — `archived` is terminal. Re-proposing means authoring a new workflow. An edit-and-resubmit loop is a D-611 refinement.
- **Notifying the manager on approve/reject** — D-619 (Phase 4) notifications. D-615 audit-logs the decision; the manager sees the outcome on the `/admin/directives` list.
- **Approval for platform-default directives** — those are super_admin-authored and ship `live`; D-615's gate only applies to org-authored workflows.

---

## Stack

- **New:** `supabase/migrations/20260515120100_directive_lifecycle.sql`, `src/app/(admin)/admin/directives/pending/page.tsx`, `src/app/(admin)/admin/directives/pending/actions.ts`, `src/app/(admin)/admin/directives/pending/pending-queue.tsx`, `scripts/verify_615.mjs`, `tests/lib/doe/workflow-approval.test.ts`, `tests/app/admin/directives/pending/actions.test.ts`, `tests/components/pending-queue.test.tsx`, `tests/integration/directive-lifecycle.test.ts`.
- **Modified:** `src/lib/doe/authoring.ts` (lifecycle on create; `listPendingWorkflows` / `approveWorkflow` / `rejectWorkflow`), `src/lib/doe/runtime.ts` (lifecycle filter), `src/lib/auth/rbac.ts` (`directives:author` → manager), `tests/lib/doe/authoring.test.ts` (create-path extensions).
- **Reuses:** `DirectiveAuthoringError`, the `caller-org-filter-on-service-role-mutation` pattern, `getCurrentUser` + `resolveForUser` (RBAC gate), the audit-log helper shape, the `Card` / `Button` shadcn primitives, the `queue-item.tsx` approve/reject client-component shape.
- **DB:** five additive columns + one partial index on an existing table. No new table, no destructive change.
- TDD enforced (Gate 3 RED → GREEN → REFACTOR). Branch deploys only — never push directly to `main` or `v6`.

---

## Authority

- **Implementation-order §4 step 2.6** — D-615 closes Phase 2.
- **PRD-v6.0 §D-615** — the `pending_approval` lifecycle, the manager→org-admin flow, the ≥10-char rejection reason, and the audit requirement are specified there.
- **Constitution I** — agents (and the workflows that drive them) are colleagues with a human gate. D-615 *is* the gate for manager-authored automation.
- **Constitution II** — tenant isolation: every approval read/write filters by `caller_org_id`.
- **Constitution III** — provenance: `submitted_by` / `decided_by` on the row, plus an `audit_log` row per author / approve / reject.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file="C:/Users/ragha/OneDrive/Desktop/AI_CRM/.env.local" scripts/apply_migration.mjs supabase/migrations/20260515120100_directive_lifecycle.sql`.
- [ ] **Verify**: `node --env-file="C:/Users/ragha/OneDrive/Desktop/AI_CRM/.env.local" scripts/verify_615.mjs` — expect ALL CHECKS PASS.
- [ ] **Smoke**: sign in as a `manager`, author a workflow at `/admin/directives` → it does not appear as live; sign in as an `org_admin`, open `/admin/directives/pending` → approve it → it shows live on `/admin/directives` and fires on its trigger.

---

## Risks & decisions

- **The runtime gate must not break existing directives.** Mitigation: the migration's `lifecycle_status DEFAULT 'live'` means every pre-D-615 row (platform defaults + existing org rows) is `live`, so `loadActiveDirectives`'s new filter is a no-op for them. Covered by the integration test (existing-style directive still fires) + the unchanged `runtime.test.ts` suite.
- **`manager` gaining `directives:author` widens who can write `directives` rows.** Mitigation: a manager-authored row is `pending_approval` + `enabled=false` + runtime-inert — it cannot fire until an org admin approves. The blast radius of the new permission is "can propose", not "can activate".
- **`workspace_admin` also gains `directives:author` (via the `MANAGER_OPERATIONAL` cascade).** Accepted — `workspace_admin ⊇ manager` is the existing role-hierarchy design, and `workspace_admin` lacks `directives:approve`, so its workflows also land `pending_approval`. Consistent, not a hole.
- **Two directives editing `rbac.ts` + `authoring.ts` in one branch (D-614 + D-615).** D-614's `rbac.ts` edit adds `agents:manage_policies`; D-615's adds `directives:author` to `MANAGER_OPERATIONAL` — disjoint lines. Neither touches `authoring.ts` except D-615. No conflict within the branch.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-mutation`** — `approveWorkflow` / `rejectWorkflow` / `listPendingWorkflows` every read/write filters by `caller_org_id` on the service-role client.
- **`server-action-result-discriminated-union`** — `approveWorkflowAction` / `rejectWorkflowAction` return `{ ok: true } | { ok: false, error }`.
- **`additive-only-migrations`** — `ADD COLUMN IF NOT EXISTS` ×5 + `CREATE INDEX IF NOT EXISTS`, explicit `ROLLBACK:` block, no destructive change.
- **`injectable-supabase-client-for-tests`** — the three new authoring helpers take an injectable client (default real) so unit tests inject a chainable mock.
- **`rsc-server-only-vs-client-safe-split`** — `pending-queue.tsx` imports only the `PendingWorkflowRow` type from the server module; the Supabase admin client never reaches the browser bundle.
- **`single-dispatcher-server-action` (sibling)** — the pending-queue actions mirror the `/admin/agents/queue` approve/reject action shape rather than extending the `directiveAction` dispatcher, because the permission gate differs (`directives:approve` vs `directives:author`).
