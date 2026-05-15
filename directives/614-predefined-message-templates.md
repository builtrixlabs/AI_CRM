# Directive 614 — Predefined Message Templates (per-org auto-send vs require-approval policy)

**Kind:** feature (V6 Phase 2, step 2.5)
**Status:** AUTHORIZED — operator cleared Phase 2 steps 2.5 + 2.6 to run end-to-end 2026-05-15 ("begin 614 and 615 … implement … push it on phase 2 branch")
**Branch target:** `v6-phase-2` (via `feature/614-615-msg-policies-approval-workflow`)
**Generated:** 2026-05-15T00:00:00Z
**Source:** `docs/PRD-v6.0.md` §D-614 (lines 851-882); `docs/plans/v6-implementation-order.md` §3 + §4 step 2.5 + §6 (`message_template_policies` migration row).
**Builds on:** D-600 (`src/lib/agents/brochure-agent.ts` — `resolveSendPolicy`, the D-614 seam), D-322 (`agent_approval_queue` + `dispatchApprovedDraft`), D-415/D-603 (the approve → real-adapter dispatch path), D-019 (`agents:*` permission family).

---

## Problem

D-600 (Brochure Agent) and D-322 (Follow-up Agent) always queue their drafts for operator approval. That is the safe default, but it is not always the right one: a brochure share right after a call is low-risk and high-volume — making an operator click "approve" on every one is friction with no safety payoff. A site-visit confirmation, by contrast, must stay gated because the cab details have to be verified first.

D-600 anticipated this: `resolveSendPolicy(organization_id, agent_kind)` is a stub that always returns `require_approval`, and `runBrochureAgent` is structured so wiring the real policy is a localized change. D-614 builds the policy.

### Architecture decisions

- **One table, `agent_message_policies`, keyed `(organization_id, agent_kind)`.** Exactly the PRD §D-614 data model: `mode IN ('auto_send','require_approval')`, `updated_at`, `updated_by`. No row for a `(org, kind)` pair means the default — `require_approval` — so the table is sparse and new orgs need no seeding (PRD AC-2).
- **`resolveSendPolicy` moves to `src/lib/agents/send-policy.ts`.** It was a stub inside `brochure-agent.ts`; D-322's follow-up agent needs it too, so a follow-up agent importing from `brochure-agent.ts` would be a wrong-way dependency. The shared module owns the lookup, the `AgentMessagePolicy` type, and the `POLICY_CONFIGURABLE_AGENT_KINDS` list. `brochure-agent.ts` re-exports `resolveSendPolicy` so any pre-existing import path still resolves.
- **`auto_send` reuses the queue row + `dispatchApprovedDraft` — it does not bypass them.** An `auto_send` run inserts the `agent_approval_queue` row as `pending` (so the existing `(org, lead, agent_kind) WHERE status='pending'` partial unique index still guards against duplicates), immediately promotes it to `approved` with the agent service account as `decided_by`, then calls `dispatchApprovedDraft`. The row, the activity node, the audit trail, and the provenance are all identical to an operator approval — only the human click is removed. Provenance is preserved: `decided_by` is the agent service-account uuid, distinguishable from a human approver.
- **`no_match` always queues, regardless of policy.** A brochure-agent run that finds no brochure produces a row with `error='no_match'` and explanatory copy — auto-sending that to a customer would be wrong. So the brochure agent honours `auto_send` only when a brochure actually matched; `no_match` falls through to the approval queue even under `auto_send`.
- **The Site Visit Booking Agent is not auto-sendable.** `runSiteVisitBookingAgent` produces a *draft* booking that structurally requires the operator to enter cab details (driver, vehicle, pickup) before anything can be sent — there is no message to auto-send at agent-run time. `site_visit_booking` therefore stays `require_approval` always; the `/admin/agents/policies` UI shows it as a locked row with that explanation. This matches the PRD user story exactly ("site-visit confirmations to require approval").
- **Permission gate: a new `agents:manage_policies`, org-admin-plane.** Adding a permission is a TS-literal change with no migration (per `rbac.ts`). Configuring send policy is org-admin territory — distinct from `agents:provision` — so it gets its own literal, granted to `org_admin` / `org_owner`.

D-614 ships:

1. **Migration** `supabase/migrations/20260515120000_agent_message_policies.sql` — the `agent_message_policies` table + 4 org-scoped RLS policies. Additive, idempotent, `ROLLBACK:` block.
2. **Send-policy module** `src/lib/agents/send-policy.ts` — `resolveSendPolicy` (real lookup, default `require_approval`), `AgentMessagePolicy` type, `POLICY_CONFIGURABLE_AGENT_KINDS`, `AGENT_KIND_LABELS`.
3. **Brochure agent** `src/lib/agents/brochure-agent.ts` — `runBrochureAgent` branches on the policy: `auto_send` + matched brochure → enqueue + approve + dispatch; otherwise the existing queue-for-approval path. Stub `resolveSendPolicy` removed; re-exported from `send-policy.ts`.
4. **Follow-up agent** `src/lib/agents/follow-up-stale-lead.ts` — `enqueueFollowUpDraft` takes a `policy` arg; `runFollowUpAgent` resolves the policy once per org and threads it through; `auto_send` enqueues + approves + dispatches.
5. **Policies UI** `src/app/(admin)/admin/agents/policies/` — `page.tsx` (server component, lists the configurable agent kinds with their current mode), `actions.ts` (`setAgentPolicyAction`), `policies-form.tsx` (client component, per-kind toggle).
6. **Permission** `src/lib/auth/rbac.ts` — `agents:manage_policies` added to `PERMISSIONS` + `ORG_ADMIN_PLANE`.
7. **Verify** `scripts/verify_614.mjs` — table + RLS + policies.
8. **Tests** — `tests/lib/agents/send-policy.test.ts`, brochure-agent + follow-up-agent test extensions, `tests/app/admin/agents/policies/actions.test.ts`, `tests/components/agents/policies-form.test.tsx`, `tests/integration/agent-message-policies.test.ts`.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** With no `agent_message_policies` row for `(org, 'brochure_send')`, `resolveSendPolicy` returns `require_approval` — the D-600 behaviour is unchanged for an org that never visits the policies page (PRD AC-2: default for new orgs is `require_approval`).

- [ ] **AC-2** An org admin sets `brochure_send` to `auto_send` at `/admin/agents/policies`; the next `runBrochureAgent` run that matches a brochure inserts the queue row, promotes it to `approved` (`decided_by` = the brochure agent service account), and calls `dispatchApprovedDraft` — no operator click required (PRD AC-1).

- [ ] **AC-3** Under `auto_send`, a `runBrochureAgent` run that finds **no** matching brochure still queues a `pending` row with `error='no_match'` — the `no_match` notification is never auto-sent to a customer.

- [ ] **AC-4** `runFollowUpAgent` resolves the org's `follow_up_stale_lead` policy once per org; under `auto_send` each stale-lead draft is enqueued, approved, and dispatched; under `require_approval` (or no row) the existing queue-for-approval behaviour is unchanged.

- [ ] **AC-5** `setAgentPolicyAction` is gated on `agents:manage_policies`; a caller without it gets `{ ok: false, error: 'permission' }` and no write. The action upserts `(organization_id, agent_kind, mode, updated_by)` and writes one `audit_log` row (`action='agent_message_policy_set'`).

- [ ] **AC-6** Cross-org isolation: a policy row for org A's `brochure_send` never affects org B — `resolveSendPolicy` filters by `organization_id`, and `setAgentPolicyAction` writes only the caller's org. Covered by an integration test with two orgs.

- [ ] **AC-7** `/admin/agents/policies` renders one row per configurable agent kind (`brochure_send`, `follow_up_stale_lead`) with a working toggle, plus `site_visit_booking` as a locked `require_approval` row with the cab-details explanation. The page is gated on `agents:manage_policies`.

- [ ] **AC-8** Tests: `send-policy` unit (default + stored-mode lookup, cross-org), brochure-agent extended (auto_send dispatch path, no_match-stays-queued, require_approval unchanged), follow-up-agent extended (auto_send + require_approval), `policies/actions` unit (permission gate, upsert, audit), `policies-form` RTL, `agent-message-policies` integration (cross-tenant). `npx tsc --noEmit` clean for changed files; full vitest suite green.

- [ ] **AC-9** Migration `20260515120000_agent_message_policies.sql` applies via `scripts/apply_migration.mjs`; `scripts/verify_614.mjs` all-PASS against live Supabase.

---

## Non-goals (deferred)

- **Per-customer or per-lead policy overrides** — PRD §D-614 out-of-scope. Policy is per-org, per-agent-kind only.
- **Time-window policies** ("auto-send only during business hours") — PRD §D-614 out-of-scope.
- **Auto-send for the Site Visit Booking Agent** — structurally impossible (the cab form is operator-entered). `site_visit_booking` is a locked `require_approval` row.
- **A policy for arbitrary/future agent kinds** — `POLICY_CONFIGURABLE_AGENT_KINDS` is an explicit list; a new agent kind opts in by joining it.
- **Retroactive dispatch of already-queued rows when policy flips to `auto_send`** — the policy applies to the *next* agent run, not the existing backlog.

---

## Stack

- **New:** `supabase/migrations/20260515120000_agent_message_policies.sql`, `src/lib/agents/send-policy.ts`, `src/app/(admin)/admin/agents/policies/page.tsx`, `src/app/(admin)/admin/agents/policies/actions.ts`, `src/app/(admin)/admin/agents/policies/policies-form.tsx`, `scripts/verify_614.mjs`, `tests/lib/agents/send-policy.test.ts`, `tests/app/admin/agents/policies/actions.test.ts`, `tests/components/agents/policies-form.test.tsx`, `tests/integration/agent-message-policies.test.ts`.
- **Modified:** `src/lib/agents/brochure-agent.ts` (real policy branch; stub removed, re-exported), `src/lib/agents/follow-up-stale-lead.ts` (`policy` arg + auto_send branch), `src/lib/auth/rbac.ts` (`agents:manage_policies`), `tests/lib/agents/brochure-agent.test.ts` + `tests/lib/agents/follow-up-stale-lead.test.ts` (extensions).
- **Reuses:** `dispatchApprovedDraft` (D-415/D-603), `getSupabaseAdmin`, `getCurrentUser` + `BASE_ROLE_PERMS` (RBAC gate), the `Card`/`Button` shadcn primitives, the `single-dispatcher-server-action` + `server-action-result-discriminated-union` patterns.
- **DB:** one new additive table. No destructive change.
- TDD enforced (Gate 3 RED → GREEN → REFACTOR). Branch deploys only — never push directly to `main` or `v6`.

---

## Authority

- **Implementation-order §4 step 2.5** — D-614 is Phase 2's policy layer; §6 names the `message_template_policies` migration.
- **PRD-v6.0 §D-614** — the table, the `mode` enum, the per-agent-kind keying, and the `require_approval` default are specified there.
- **Constitution I** — agents are colleagues with a human gate. `auto_send` is an explicit, audit-logged operator opt-out of the gate for a specific low-risk agent kind — not a removal of the gate.
- **Constitution II** — tenant isolation: `resolveSendPolicy` and `setAgentPolicyAction` are both `organization_id`-scoped.
- **Constitution III** — provenance: an auto-sent row's `decided_by` is the agent service-account uuid; the policy change itself writes an `audit_log` row.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration** (from the worktree, parent env): `node --env-file="C:/Users/ragha/OneDrive/Desktop/AI_CRM/.env.local" scripts/apply_migration.mjs supabase/migrations/20260515120000_agent_message_policies.sql`.
- [ ] **Verify**: `node --env-file="C:/Users/ragha/OneDrive/Desktop/AI_CRM/.env.local" scripts/verify_614.mjs` — expect ALL CHECKS PASS.
- [ ] **Smoke**: at `/admin/agents/policies`, flip `brochure_send` to `auto_send`; POST a `call.next_best_action` (`nba.action='send_brochure'`) for a lead with a matching brochure → no queue row appears, the WhatsApp goes out directly (with a configured adapter), and the lead shows a "Follow-up sent" activity.

---

## Risks & decisions

- **Auto-send removes the human gate.** Mitigation: it is opt-in per agent kind, defaults off, is audit-logged on change, and `no_match` is never auto-sent. The site-visit agent — the one the PRD explicitly wants gated — is structurally non-auto-sendable.
- **Idempotency under `auto_send`.** The queue row is still inserted as `pending` first, so the existing partial unique index guards duplicates; only then is it promoted + dispatched. A 23505 on insert is the benign "already pending" no-op, same as today.
- **Dispatch failure under `auto_send`.** `dispatchApprovedDraft` leaves the row `approved` with `send_error` on a provider failure (its existing D-415 retry contract) — the row surfaces in the queue for the operator to retry. An `auto_send` failure degrades to the `require_approval` UX, never a silent drop.
- **Touching two agents.** The brochure-agent change is a localized branch the D-600 author left a seam for; the follow-up-agent change adds an optional `policy` arg (defaulting to `require_approval`) so existing callers and tests are unaffected.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — `resolveSendPolicy` and `setAgentPolicyAction` are `organization_id`-scoped on the service-role client.
- **`server-action-result-discriminated-union`** — `setAgentPolicyAction` returns `{ ok: true } | { ok: false, error }`.
- **`additive-only-migrations`** — one `CREATE TABLE IF NOT EXISTS`, explicit `ROLLBACK:` block, no destructive change.
- **`injectable-supabase-client-for-tests`** — `resolveSendPolicy` and the agent entry points take an injectable client (default real) so unit tests inject a chainable mock.
- **`rsc-server-only-vs-client-safe-split`** — `policies-form.tsx` imports only the `AgentMessagePolicy` type + label constants; the Supabase admin client never reaches the browser bundle.
