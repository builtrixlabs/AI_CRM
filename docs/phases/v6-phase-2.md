# V6 Phase 2 — AI-Native Behaviors — Implementation Summary

**Status:** built + integrated to `v6` (`e63d5b0`, 2026-05-15).
**Window:** 2026-05-14 → 2026-05-15.
**Integration PR:** [#87](https://github.com/builtrixlabs/AI_CRM/pull/87) `v6-phase-2 → v6` (merge commit `e63d5b0`).
**Phase 1 dependency:** [#84](https://github.com/builtrixlabs/AI_CRM/pull/84) `ba1c321` (D-602/604/605/608/610/617) + [#83](https://github.com/builtrixlabs/AI_CRM/pull/83) `5606620` (D-603).
**Authority:** [`docs/PRD-v6.0.md`](../PRD-v6.0.md) §D-600 / D-601 / D-607 / D-609 / D-614 / D-615; [`docs/plans/v6-implementation-order.md`](../plans/v6-implementation-order.md) §3 + §4 step 2.

This document is the closure record for V6 Phase 2 — what shipped, what's pending, the verification evidence, the patterns the build leaned on, and the foundations Phase 3 inherits.

---

## §1. Scope

Phase 2 delivered the two flagship AI agents end-to-end (Brochure + Site Visit Booking) plus the **policy** and **workflow-approval** gates around them. Six directives across two batch PRs:

| Step | Directive | What | Landed via |
|---|---|---|---|
| 2.1 | **D-607** Brochure Repository | Per-org brochures store + Supabase Storage + ranked-match lookup | [#85](https://github.com/builtrixlabs/AI_CRM/pull/85) → `9b1a91c` |
| 2.2 | **D-600** Brochure Agent | VIQ `call.next_best_action` → brochure pick → WhatsApp draft → approval queue | [#85](https://github.com/builtrixlabs/AI_CRM/pull/85) → `9b1a91c` |
| 2.3 | **D-609** Click-to-call on canvas | Lead canvas → Exotel-bridged call → call.initiated activity | [#85](https://github.com/builtrixlabs/AI_CRM/pull/85) → `9b1a91c` |
| 2.4 | **D-601** Site Visit Booking Agent | VIQ `book_site_visit` → cab form → scheduled visit + WhatsApp + sales-rep auto-assigned | [#85](https://github.com/builtrixlabs/AI_CRM/pull/85) → `9b1a91c` |
| 2.5 | **D-614** Predefined Message Templates | Per-org `auto_send` vs `require_approval` policy; wires the brochure + follow-up agents | [#86](https://github.com/builtrixlabs/AI_CRM/pull/86) → `efbbd64` |
| 2.6 | **D-615** AI Agent Approval Workflow | Manager-authored workflows → org-admin approval queue → live / archived | [#86](https://github.com/builtrixlabs/AI_CRM/pull/86) → `efbbd64` |

Phase 1 dependencies pulled in by the same `v6` integration: **D-603** (adapter dispatch — the path the brochure agent dispatches through under `auto_send`), **D-602** (site-visit cab/assignment jsonb fields the booking agent writes onto), **D-608** (project↔sales-rep mapping the booking agent auto-assigns from).

---

## §2. What landed

Concise per-directive summary; full narrative + AC tables are in [`V6_STATUS.md`](../V6_STATUS.md) §3.

### D-607 Brochure Repository — `9b1a91c`
- `brochures` table (per-org RLS, partial index on `(organization_id, project_id)` for the agent-match hot path).
- **Private Supabase Storage bucket `brochures`** — first Storage use in the repo. Created via `scripts/ensure_brochures_bucket.mjs` (not migration SQL — Storage admin rights are project-config-dependent; a failure inside a migration txn would roll back the table).
- `findBrochuresForAgent` ranked-match lookup (exact `bhk` +3, `budget_band` +2, `area_sqft` +1; `document_type` is a hard filter).
- Signed upload/read URLs (request → upload → finalize, no `body-size-limit` bump).
- `/admin/brochures` UI + three RBAC perms (`brochures:view` / `:upload` / `:delete`).

### D-600 Brochure Agent — `9b1a91c`
- `onCallNextBestAction` emits `agent/brochure.requested` (best-effort, try/catch — never breaks the webhook) → `brochureAgentOnRequest` Inngest fn → `runBrochureAgent`.
- AI gateway draft with a deterministic template fallback. A gateway `!ok` (budget cap, provider down) never drops the request — the queue row is always produced.
- `agent_approval_queue` row carries `agent_kind='brochure_send'`, the brochure in `attachments` jsonb, and `error='no_match'` (with explanatory copy) when nothing matched.
- `dispatchApprovedDraft` extended to resolve **fresh 1h** brochure signed URLs at *send* time — never a queue-time stale link, and a since-deleted brochure resolves to nothing and is silently skipped.

### D-609 Click-to-Call on Canvas — `9b1a91c`
- `OutboundCallArgs.from_phone_e164` added — the Exotel adapter now dials the **rep** as the `From` leg (backward-compatible — falls back to `virtual_number`).
- `src/lib/comms/telephony/click-to-call.ts`: `initiateClickToCall` + `recordCallStatusUpdate` (org-scoped, injectable client).
- `/api/calls/initiate` gated on `calls:listen` + a non-null `profiles.phone`.
- The D-433 `call-status` webhook — previously scaffolding — is now wired: Exotel status callbacks patch the activity node's disposition.
- **No migration** — Gate 4 = N/A.

### D-601 Site Visit Booking Agent — `9b1a91c`
- `onCallNextBestAction` emits `agent/site_visit.requested` → `siteVisitAgentOnRequest` Inngest fn → `runSiteVisitBookingAgent`: creates a draft `site_visit` node + an `attended` edge + a `site_visit_booking` queue row.
- The queue UI branches on `agent_kind='site_visit_booking'` to render `<SiteVisitBookingCard>` (cab-details form: driver, vehicle, pickup time/address).
- `confirmSiteVisitBooking` writes the cab fields onto the draft visit, transitions `draft → scheduled` (audit-logged), auto-assigns the project's sales rep via D-608, and dispatches a templated WhatsApp confirmation via D-415/D-603.
- **No site-visit DDL** — D-602 already shipped the cab/assignment jsonb schema.

### D-614 Predefined Message Templates — `efbbd64`
- `agent_message_policies` table (per-org, per-agent-kind; `mode` CHECK-constrained to `auto_send` / `require_approval`; PK `(organization_id, agent_kind)`; sparse — no row means the default `require_approval`).
- `resolveSendPolicy` **moved** out of the D-600 stub in `brochure-agent.ts` into a shared `src/lib/agents/send-policy.ts` (the follow-up agent needs it too — a follow-up agent importing from brochure-agent would be a wrong-way dependency). Real per-org lookup; graceful-degrades to `require_approval` when the table or row is absent.
- `runBrochureAgent` + `enqueueFollowUpDraft` branch on it: `auto_send` inserts `pending` first (so the partial unique idempotency index still guards duplicates), promotes to `approved` (`decided_by` = the agent service account, so provenance distinguishes from a human approval), and dispatches via `dispatchApprovedDraft`. `no_match` brochure runs **always queue** regardless of policy — the "upload a brochure" copy must never auto-send to a customer.
- `site_visit_booking` is a locked `require_approval` row (the cab form is mandatory; auto-send is structurally impossible at agent-run time).
- `/admin/agents/policies` UI with per-kind toggles + new `agents:manage_policies` perm (org-admin-plane).

### D-615 AI Agent Approval Workflow — `efbbd64`
- `directives` gains six columns: `lifecycle_status` (CHECK `live | pending_approval | archived`, default `live` so every pre-D-615 row is `live` — the runtime gate becomes a no-op for existing data), `submitted_by`, `submitted_at`, `decided_by`, `decided_at`, `rejection_reason`. Partial index `directives_org_pending_idx` for the approval-queue read.
- `createCustomDirective` keys the lifecycle off the **author's permissions** — a `directives:approve` holder (`org_admin` / `org_owner`) self-publishes to `live`; anyone else (now incl. `manager`, which gains `directives:author` via `MANAGER_OPERATIONAL` cascade) lands `pending_approval` + `enabled=false` with `submitted_by`/`submitted_at` stamped.
- `loadActiveDirectives` adds `.eq('lifecycle_status','live')` — a pending workflow is **runtime-inert** even if its `enabled` flag is true.
- `listPendingWorkflows`, `approveWorkflow`, `rejectWorkflow` (reason ≥ 10 chars; `archived` is terminal) added to `src/lib/doe/authoring.ts`.
- `/admin/directives/pending` queue UI gated on `directives:approve`; approve/reject server actions audit-log every decision (`action='workflow_approved'` / `'workflow_rejected'`).

---

## §3. Migrations applied to live Supabase

All additive, idempotent, with explicit `ROLLBACK:` blocks. Each has a paired `scripts/verify_6XX.mjs` checker.

| Migration | Directive | Verify | Applied |
|---|---|---|---|
| `20260514170000_brochures.sql` | D-607 | `verify_607.mjs` 7/7 | 2026-05-14 |
| `20260514180000_brochure_agent_queue.sql` | D-600 (`attachments` + `error`) | `verify_600.mjs` 3/3 | 2026-05-14 |
| `20260514190000_agent_queue_ref_node.sql` | D-601 (`ref_node_id`) | `verify_601.mjs` 3/3 | 2026-05-14 |
| `20260515120000_agent_message_policies.sql` | D-614 | `verify_614.mjs` 6/6 | 2026-05-15 |
| `20260515120100_directive_lifecycle.sql` | D-615 | `verify_615.mjs` 11/11 | 2026-05-15 |

Plus the **private `brochures` Storage bucket** — created via `scripts/ensure_brochures_bucket.mjs` (not migration SQL — see D-607 note above).

D-609 ships no migration (Gate 4 = N/A).

---

## §4. Verification

| Gate | Result |
|---|---|
| Unit + RTL (`npx vitest run`) | **2055 / 2055 green** (221 files). +51 over the 2004 Phase-2.1→2.4 baseline; +157 over the 1898 Phase-1 baseline. |
| Integration (live Supabase, `vitest.integration.config.ts`) | **14 / 14 green** — D-607 `brochures-cross-tenant` ×4, D-614 `agent-message-policies` ×5, D-615 `directive-lifecycle` ×5 |
| TypeScript (`npx tsc --noEmit`) | 0 errors in changed files. 9 pre-existing `tests/e2e/` strict-null + one Deno-URL-import error are unrelated (also documented in PR #85). |
| Build (`npm run build`) | Green. All new routes compile: `/admin/brochures`, `/admin/agents/queue`, `/admin/agents/policies`, `/admin/directives/pending`, `/api/calls/initiate`. |
| Live-Supabase migrations | Every `verify_*.mjs` PASS. |
| Vercel preview | #85 + #86 + #87 all shipped READY. |

### What was **not** done in Phase 2

- **Playwright e2e suite.** The suite is independently broken — confirmed during PR #85 closure (see [`memory/v6_preview_verification_env.md`](../../memory/v6_preview_verification_env.md)): 8 of 11 specs auth via magic-link (`page.goto(supabase_action_link)`) which the agent sandbox refuses (`ERR_CONNECTION_REFUSED`); 2 break on stale `getByLabel(/email/i)` selectors after the email+password / magic-link toggle commit changed the `/auth/sign-in` DOM. The operator opted to verify Phase 2 (steps 2.1→2.4 and 2.5→2.6) with unit + RTL + integration instead. Repairing the e2e harness (cookie-injection auth helper so the browser never touches `supabase.co`) is its own scheduled task.
- **Live authed UI walkthrough on the Vercel preview.** Gate 2 acceptance — operator-side once Vercel preview env-sync runs against the integrated `v6` tip.

---

## §5. Integration timeline

| When | Event |
|---|---|
| 2026-05-12 | D-501 (PSCRM admin port) + D-433 (Exotel telephony) land on `v5` — the foundation D-603 needs. |
| 2026-05-14 morning | **D-603** ships via [#83](https://github.com/builtrixlabs/AI_CRM/pull/83) → `v6-phase-1` — the BIG REWIRE (`pickProvider() → "mock"` replaced with `resolveOrgAdapter` everywhere agent dispatch lives). |
| 2026-05-14 afternoon | D-602 / D-604 / D-605 / D-608 / D-610 / D-617 built in one operator-authorized run; PR [#84](https://github.com/builtrixlabs/AI_CRM/pull/84) squash-merged → `v6-phase-1` complete at `ba1c321`. |
| 2026-05-14 evening | `v6-phase-2` cut from `v6-phase-1@ba1c321`. D-607 / D-600 / D-609 / D-601 built in one run; PR [#85](https://github.com/builtrixlabs/AI_CRM/pull/85). |
| 2026-05-15 morning | PR #85 merged → `v6-phase-2` at `9b1a91c` (Phase 2.1→2.4 complete). |
| 2026-05-15 | D-614 + D-615 built on `feature/614-615-msg-policies-approval-workflow` (cut from `v6-phase-2@9b1a91c`); PR [#86](https://github.com/builtrixlabs/AI_CRM/pull/86) merged → `v6-phase-2` at `efbbd64` (Phase 2.5→2.6 complete). |
| 2026-05-15 | Integration PR [#87](https://github.com/builtrixlabs/AI_CRM/pull/87) merged: `v6-phase-2 → v6` (merge commit `e63d5b0`). Full Phase 1 + Phase 2 lineage now lives on the `v6` horizon branch. |

---

## §6. Operator follow-ups (Gate 2 acceptance still open)

The work is built + verified at the unit/integration layer; the live preview verification is operator-side.

- [ ] Vercel preview env-sync against the new `v6` tip (`e63d5b0`). Run from the worktree with `VERCEL_PROJECT_ROOT` pointed at the parent repo (see [`memory/v6_preview_verification_env.md`](../../memory/v6_preview_verification_env.md)).
- [ ] Live UI walkthrough — **brochure loop**: POST a `call.next_best_action` (`nba.action='send_brochure'`) for a lead with a matching brochure → row appears in `/admin/agents/queue` with the brochure attached → approve → with a configured WhatsApp adapter, the message goes out with a fresh signed URL.
- [ ] Live UI walkthrough — **site-visit booking loop**: VIQ `book_site_visit` → operator fills the cab form at `/admin/agents/queue` → visit `draft → scheduled`, project rep auto-assigned, customer WhatsApp confirmation sent.
- [ ] Live UI walkthrough — **D-614**: flip `brochure_send` to `auto_send` at `/admin/agents/policies` → next matching agent run dispatches without queuing.
- [ ] Live UI walkthrough — **D-615**: sign in as a `manager`, author a workflow → confirm it lands `pending_approval` (not live); sign in as an `org_admin`, `/admin/directives/pending` → approve → confirm it goes live and fires on its trigger.
- [ ] Tick the Phase 2 line in [`V6_STATUS.md`](../V6_STATUS.md) §10 once the above is green.

---

## §7. Patterns applied (carry forward into Phase 3)

- **`caller-org-filter-on-service-role-mutation`** — every Phase 2 read/write on the service-role client filters by `caller_org_id` (or `organization_id = public.app_org_id()` in RLS). RLS itself enforces org isolation only; permission gates run in the server actions.
- **`additive-only-migrations`** — five migrations, every column add is `IF NOT EXISTS`, every table create is `CREATE TABLE IF NOT EXISTS`, every migration ends with `NOTIFY pgrst, 'reload schema'` and ships an explicit `ROLLBACK:` block.
- **`tier-2-templated-no-gateway` (adapted)** — D-600 calls `gateway.complete` per PRD but keeps a deterministic template as the guaranteed fallback. A gateway outage degrades to T2 behaviour, never drops the request.
- **`injectable-supabase-client-for-tests`** — every agent + authoring function takes an injectable client (default real) so unit tests inject a chainable mock instead of mocking the whole supabase module.
- **`server-action-result-discriminated-union`** — every new server action returns `{ ok: true, ... } | { ok: false, error, message? }`. No throwing across the boundary.
- **`best-effort-event-emit`** — `onCallNextBestAction` wraps its Inngest fan-out in try/catch; a send failure logs but never breaks the webhook handler.
- **`rsc-server-only-vs-client-safe-split`** — client components import only types + constants from server modules; the Supabase admin client never reaches the browser bundle.
- **`pending-insert-then-promote-for-auto-send`** (new in D-614) — auto-send paths still insert the queue row as `pending` first (so the partial unique index keeps guarding duplicates), then update to `approved` + dispatch. Provenance is preserved via `decided_by = <agent service account>`.
- **`permission-keyed-lifecycle`** (new in D-615) — "can self-publish" is keyed off `BASE_ROLE_PERMS[actor_role].has('directives:approve')`, not a role-string match. Ties the gate to the permission catalog rather than enumerating role names.

---

## §8. Foundations Phase 3 inherits

Phase 3 cuts from the `v6` tip (`e63d5b0`). What it can build directly on:

- **`directives.lifecycle_status`** + approval-audit columns (D-615) — **D-611 AI Workflow Builder** extends the same column set with `version` / `parent_id` / `compiled_dag` / `test_payloads`.
- **`agent_approval_queue`** (D-322 + D-600/D-601 extensions) — D-611's test-before-publish sandbox can reuse the approve/reject + audit pipeline.
- **`teams` + `team_members`** (D-610) — **D-612 Team-Scoped Dashboards** publishes onto these.
- **`audit_log`** schema + helper shape — **D-606 Super Admin V6** impersonation logs land there (`actor_type='user'` + `on_behalf_of` for the impersonated user).
- **`base_role`** enum (D-602 / D-003 ext) — **D-616 Customer Recovery Team** adds nothing new at the role layer; `customer_recovery_rep` is already in the enum.
- **`resolveSendPolicy` seam** (D-614) — D-611's workflow builder may want a similar per-workflow policy hook (auto-fire vs queue-for-approval) on a per-org basis, modeled the same way.

### Phase 3 scope (per implementation-order §4)

| Step | Directive | Effort |
|---|---|---|
| 3.1 | **D-611** AI Workflow Builder (N8N-style, replaces the form-based authoring UI) | 10-15 days |
| 3.2 | **D-612** Team-Scoped Dashboards | 5-7 days |
| 3.3 | **D-616** Customer Recovery Team | 3-5 days |
| 3.4 | **D-606** Super Admin V6 (per-org impersonation + action logs + defect tracking + feature-flag matrix) | 5-7 days |

**Gate 3 acceptance:** manager opens the AI Workflow builder, drags a trigger + action, tests with a sample payload, publishes — and (per D-615 lifecycle) the workflow lands `pending_approval` for org-admin sign-off before it goes live.

---

**End of V6 Phase 2.**
