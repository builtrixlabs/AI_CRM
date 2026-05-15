# Directive 600 — Brochure Agent (Voice IQ → brochure pick → WhatsApp draft → approval queue)

**Kind:** feature (V6 Phase 2, step 2.2 — the first flagship AI-native loop)
**Status:** AUTHORIZED — operator cleared Phase 2 steps 2.1→2.4 to run end-to-end 2026-05-14 ("start with 2.1 and execute until 2.4 … consider all plans approved")
**Branch target:** `v6-phase-2` (cut from `v6-phase-1@ba1c321` on 2026-05-14)
**Generated:** 2026-05-14T12:30:00Z
**Source:** `docs/PRD-v6.0.md` §D-600 (lines 176-218) + §3.1; `docs/plans/v6-implementation-order.md` §3 + §4 step 2.2.
**Builds on:** D-607 (`src/lib/brochures/repository.ts` — `findBrochuresForAgent`, the ranked-match lookup), D-322 (`agent_approval_queue` + `/admin/agents/queue` UI + `dispatchApprovedDraft`), D-415 / D-603 (the approve → real-adapter dispatch path), D-130/D-131 (`call.next_best_action` Voice IQ event + `onCallNextBestAction` handler), D-009 (`gateway.complete` + the `lead.created` → Inngest-function agent pattern).

---

## Problem

D-607 built the brochure repository. Now the loop: a presales rep finishes a call, Voice IQ posts a `call.next_best_action` event whose `nba.action` says the customer wants project material — and **nothing happens**. There is no agent that turns "send the 3BHK floor plan" into a drafted, attachment-bearing WhatsApp message sitting in the approval queue.

D-600 builds that agent. On a `call.next_best_action` event with `nba.action ∈ {send_brochure, send_floor_plan, send_price_sheet}`: resolve the lead → derive match criteria from the lead's own data → `findBrochuresForAgent` (D-607) picks the best brochure → the AI gateway drafts a short WhatsApp body → a `agent_approval_queue` row lands with `agent_kind='brochure_send'`, the brochure in `attachments`, ready for the operator to approve in the existing `/admin/agents/queue`.

### Architecture decisions

- **The `nba` payload is lean — match criteria come from the lead.** `callNextBestActionPayloadSchema` is `{ lead_id, workspace_id, call_id?, nba: { action, rationale?, ai_confidence? } }` — `nba.action` is a bare string, no project/bhk/budget. So `extractMatchCriteria` reads the **lead node's own `data`** (project_id, bhk, budget_band — wherever D-604 MIH ingestion / BANT extraction put them) and maps `nba.action` → `document_type`. Every criterion is optional; with none, the agent still picks the most-recent brochure of the right document type.
- **Inngest-driven, mirroring `leadEnrichmentOnCreate`.** `onCallNextBestAction` (which already runs and dispatches to the DOE) gains a small additive block: when `nba.action` is a brochure action it `inngest.send`s `agent/brochure.requested` (best-effort, try/catch — `best-effort-event-emit`). A new Inngest function `brochureAgentOnRequest` calls `runBrochureAgent`. The agent logic is a standalone, fully-unit-testable function with injectable `{ gateway, client }` deps — exactly the `enrichLead` shape.
- **`kind` is the existing `agent_kind` column; `attachments` + `error` are new.** PRD §D-600's data model says `ALTER TABLE agent_approval_queue ADD kind`, but the table already has `agent_kind` (D-322). D-600's migration adds only the two genuinely-missing columns: `attachments jsonb` (the brochure refs) and `error text` (agent-level errors like `no_match`, distinct from the existing `send_error` dispatch column). The brochure agent writes `agent_kind='brochure_send'`.
- **AI draft with a deterministic fallback.** PRD §D-600 wants an Anthropic call to draft the body. `draftBrochureMessage` calls `gateway.complete`; if the gateway returns `!ok` (budget exceeded, provider down) it falls back to a templated body so the queue row is **always** produced — the agent never silently drops a request.
- **`no_match` still produces a row.** PRD AC-2: if no brochure matches, the queue row is created with `error='no_match'`, empty `attachments`, and a `draft_body` telling the operator to upload one — the operator is "notified" by the row appearing in the queue. (`draft_body` is `NOT NULL`, so the no-match row carries explanatory copy.)
- **Auto-send is D-614's job.** PRD AC-3 references `agent_message_policies.mode='auto_send'`. That table is D-614 (step 2.5, not yet built). D-600 ships the **approval-queue path only** and degrades gracefully — `resolveSendPolicy` returns `require_approval` when the table is absent. D-614 wires the `auto_send` branch; D-600's `runBrochureAgent` is structured so that's a localized change.
- **Send wiring: brochure URL appended at dispatch time.** `dispatchApprovedDraft` (D-415/D-603) is the send path. D-600 extends its `whatsapp` branch: a row with `attachments` gets **fresh 1h signed URLs** (`getBrochureSignedUrl`) resolved and appended to the body at send time — never the stale queue-time URL.

D-600 ships:

1. **Migration** `supabase/migrations/20260514180000_brochure_agent_queue.sql` — `agent_approval_queue` gains `attachments jsonb NOT NULL DEFAULT '[]'` + `error text`. Additive, idempotent, `ROLLBACK:` block.
2. **Agent** `src/lib/agents/brochure-agent.ts` — `runBrochureAgent`, `extractMatchCriteria`, `draftBrochureMessage`, `enqueueBrochureDraft`, the action↔document_type map, `resolveSendPolicy` (D-614-ready stub).
3. **Inngest** — `agent/brochure.requested` added to the `Events` registry; `src/lib/inngest/functions/brochure-agent.ts` (`brochureAgentOnRequest`); registered in `src/app/api/inngest/route.ts`.
4. **Trigger** — `src/lib/events/call-audit/onCallNextBestAction.ts` gains a best-effort `inngest.send` for brochure actions.
5. **Dispatch** — `src/lib/agents/follow-up/dispatch.ts` resolves + appends fresh brochure signed URLs for `attachments`-bearing whatsapp rows.
6. **Queue UI** — `src/app/(admin)/admin/agents/queue/page.tsx` + `queue-item.tsx` surface the attachment + the `no_match` error.
7. **Tests** — `tests/lib/agents/brochure-agent.test.ts` + the dispatch + queue-UI test extensions.
8. **Verify** `scripts/verify_600.mjs` — the two new columns.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** A `call.next_best_action` event with `nba.action='send_brochure'` for an in-org lead produces exactly **one** `agent_approval_queue` row (`agent_kind='brochure_send'`, `channel='whatsapp'`, `status='pending'`), idempotent via the existing `(org, lead, agent_kind) WHERE status='pending'` partial unique index — a second event while one is pending is a benign no-op.

- [ ] **AC-2** When `findBrochuresForAgent` returns no match, the row is still created with `error='no_match'`, `attachments='[]'`, and a `draft_body` instructing the operator to upload a brochure. The row appears in `/admin/agents/queue`.

- [ ] **AC-3** When a brochure matches, `attachments` carries `[{ brochure_id, title, document_type }]` and `draft_body` is the AI-drafted body. `draftBrochureMessage` calls `gateway.complete`; on a gateway `!ok` result it falls back to a deterministic template (the row is always produced). `resolveSendPolicy` returns `require_approval` (D-614 absent) — no auto-send in D-600.

- [ ] **AC-4** The draft body contains the lead's first name and the brochure title. `extractMatchCriteria` derives `document_type` from `nba.action` (`send_brochure→brochure`, `send_floor_plan→floor_plan`, `send_price_sheet→price_sheet`) and pulls `project_id` / `bhk` / `budget_band` from the lead node's `data` defensively (only a UUID-shaped value sets `project_id`).

- [ ] **AC-5** Cross-org isolation: `runBrochureAgent` resolves the lead org-scoped and threads that `organization_id` into `findBrochuresForAgent` and the queue insert — a brochure from org B can never attach to an org-A lead's draft. Covered by a unit test with a cross-org lead and by D-607's `findBrochuresForAgent` org filter.

- [ ] **AC-6** Approve → send: `dispatchApprovedDraft` for a `brochure_send` whatsapp row resolves a **fresh** 1h signed URL per attachment via `getBrochureSignedUrl` (org-scoped) and appends it to the body before the adapter send. A deleted brochure resolves to no URL and is skipped — never a dead link. The existing approve/reject/deferred flow is otherwise unchanged.

- [ ] **AC-7** `/admin/agents/queue` renders a `brochure_send` row with its attachment title and, for a `no_match` row, a clear "no matching brochure" indicator. Existing `follow_up_stale_lead` rows render unchanged.

- [ ] **AC-8** Tests: `tests/lib/agents/brochure-agent.test.ts` (criteria extraction, action mapping, match → enqueue, no_match → enqueue+error, already-pending no-op, gateway-failure fallback, cross-org); dispatch test extended for the attachment-URL path; queue-page/item RTL extended for the brochure row. `npx tsc --noEmit` clean for changed files; targeted vitest suite green; full suite green.

- [ ] **AC-9** All 10 V6 stopping-criteria gates pass. Migration `20260514180000_brochure_agent_queue.sql` applies via `scripts/apply_migration.mjs`; `scripts/verify_600.mjs` all-PASS.

---

## Non-goals (deferred)

- **Auto-send** — `agent_message_policies` is D-614 (step 2.5). D-600 always queues for approval; `resolveSendPolicy` is the D-614 seam.
- **The Site Visit Booking Agent** — D-601 (step 2.4), a separate `nba.action`.
- **Brochure content generation / AI metadata extraction** — D-607 non-goals; D-600 sends what was uploaded.
- **A bespoke brochure WhatsApp template** — D-600 reuses the existing follow-up WA template path in `dispatchApprovedDraft`; the brochure link is appended to the body. A dedicated media-template is a V6.x refinement.
- **Registry/per-org config for the brochure agent** — like the follow-up agent (`runFollowUpAgent`), the brochure agent is a standalone function, not an `agent_service_accounts` registry row. D-615 (agent approval workflow) revisits this.
- **Re-running the agent on lead-data change** — D-600 triggers only on the Voice IQ `call.next_best_action` event, not on lead edits.

---

## Stack

- **New:** `supabase/migrations/20260514180000_brochure_agent_queue.sql`, `src/lib/agents/brochure-agent.ts`, `src/lib/inngest/functions/brochure-agent.ts`, `scripts/verify_600.mjs`, `tests/lib/agents/brochure-agent.test.ts`.
- **Modified:** `src/lib/inngest/client.ts` (`agent/brochure.requested` event), `src/app/api/inngest/route.ts` (register the function), `src/lib/events/call-audit/onCallNextBestAction.ts` (best-effort emit), `src/lib/agents/follow-up/dispatch.ts` (attachment signed-URL append), `src/app/(admin)/admin/agents/queue/page.tsx` + `queue-item.tsx` (attachment + error display), plus the test extensions.
- **Reuses:** `findBrochuresForAgent` / `getBrochureSignedUrl` (D-607), `gateway.complete` + the injectable-deps agent shape from `enrichLead`, the `enqueueFollowUpDraft` queue-insert pattern, `dispatchApprovedDraft`, `getSupabaseAdmin`, the `inngest.send` best-effort-emit convention.
- **DB:** two additive `agent_approval_queue` columns. No new table, no destructive change.
- TDD enforced (Gate 3 RED → GREEN → REFACTOR). Branch deploys only — never push directly to `main` or `v6`.

---

## Authority

- **Implementation-order §4 step 2.2** — D-600 is Phase 2's first flagship agent; PRD §3.1 is the canonical loop diagram.
- **PRD-v6.0 §D-600** — the event subscription, metadata match, Anthropic draft, `agent_approval_queue` write, and `no_match` behavior are specified there.
- **Constitution I** — agents are colleagues with a human gate. D-600 always queues for approval (D-614 later policies auto-send); the operator's `approve` is what triggers the send.
- **Constitution II** — tenant isolation: `runBrochureAgent` resolves the lead org-scoped and threads `organization_id` into every downstream read/write.
- **Constitution III** — provenance: `created_by_agent_id` on the queue row; `dispatchApprovedDraft` already writes the activity node + audit row on send.
- **`best-effort-event-emit` (memory/learned)** — `onCallNextBestAction`'s `inngest.send` is wrapped in try/catch; a send failure logs but never breaks the webhook handler.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration** (from the worktree, parent `.env`): `node --env-file=../../../.env scripts/apply_migration.mjs supabase/migrations/20260514180000_brochure_agent_queue.sql`.
- [ ] **Verify**: `node --env-file=../../../.env scripts/verify_600.mjs` — expect ALL CHECKS PASS.
- [ ] **Smoke**: POST a `call.next_best_action` event (`nba.action='send_brochure'`) for a lead in an org that has a matching brochure → a `brochure_send` row appears in `/admin/agents/queue` with the brochure attached → approve → (with a configured WhatsApp adapter) the message goes out with a fresh brochure link.
- [ ] **Note** — D-614 (step 2.5) wires the `auto_send` policy branch; until then every brochure draft requires operator approval.

---

## Risks & decisions

- **Lean `nba` payload.** Voice IQ's `call.next_best_action` carries only `nba.action` — no project/bhk/budget. D-600 derives match criteria from the lead node's own `data`, which D-604 (MIH) / BANT extraction populate. If a pilot org's leads carry none of those fields, the agent falls back to "most-recent brochure of the right document_type" — still useful, never an error. If that proves too coarse, enriching the VIQ contract is a baseline-122-style follow-up, not a D-600 change.
- **`project_id` as a hard filter.** `findBrochuresForAgent` hard-filters on `project_id`. A stale/wrong `project_id` on the lead would yield `no_match`. Mitigation: `extractMatchCriteria` only sets `project_id` when the value is UUID-shaped, and `no_match` is a recoverable state (the operator sees the row and can attach manually).
- **AI draft latency / failure.** `gateway.complete` can be slow or fail (budget cap, provider down). The agent runs inside an Inngest function (off the webhook path) and `draftBrochureMessage` falls back to a deterministic template on any `!ok` — the queue row is always produced. Inngest's retry handles transient infra failures.
- **Stale signed URLs.** A brochure signed URL expires in 1h; an operator may approve a queue row days later. So the URL is resolved **at dispatch time**, not queue time — `attachments` stores only `{ brochure_id, title, document_type }`, and `dispatchApprovedDraft` mints a fresh URL per send. A brochure deleted between queue and approve resolves to nothing and is skipped.
- **Touching `dispatchApprovedDraft`.** D-600 extends a D-415/D-603 file. The change is scoped to the `whatsapp` branch and gated on `attachments` being non-empty — `follow_up_stale_lead` rows (empty `attachments`) take the exact existing path. The existing dispatch tests must stay green.

---

## Learned Patterns Applied

- **`best-effort-event-emit`** — `onCallNextBestAction` emits `agent/brochure.requested` in a try/catch after its existing work; a send failure logs but never rolls back or throws.
- **`injectable-supabase-client-for-tests`** — `runBrochureAgent` / `extractMatchCriteria` / `draftBrochureMessage` take injectable `{ gateway, client }` deps (default real), exactly like `enrichLead`, so unit tests inject a chainable mock client + a canned gateway.
- **`caller-org-filter-on-service-role-read`** — every `runBrochureAgent` read/write is `organization_id`-scoped on the service-role client; `findBrochuresForAgent` carries the same org id.
- **`server-action-result-discriminated-union`** — `runBrochureAgent` returns `{ ok: true, … } | { ok: false, error }`; no throwing across the boundary.
- **`additive-only-migrations`** — `ADD COLUMN IF NOT EXISTS` ×2, explicit `ROLLBACK:` block, no destructive change.
- **`tier-2-templated-no-gateway` (adapted)** — the follow-up agent is pure-templated; D-600 *does* call the gateway (PRD-mandated) but keeps the templated path as the guaranteed fallback, so a gateway outage degrades to T2 behavior rather than dropping the request.
