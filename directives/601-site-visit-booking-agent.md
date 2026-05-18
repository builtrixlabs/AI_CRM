# Directive 601 — Site Visit Booking Agent (Voice IQ → draft visit → cab form → scheduled + WhatsApp + rep assigned)

**Kind:** feature (V6 Phase 2, step 2.4 — the second flagship AI-native loop)
**Status:** AUTHORIZED — operator cleared Phase 2 steps 2.1→2.4 to run end-to-end 2026-05-14 ("start with 2.1 and execute until 2.4 … consider all plans approved")
**Branch target:** `v6-phase-2` (cut from `v6-phase-1@ba1c321` on 2026-05-14)
**Generated:** 2026-05-14T15:10:00Z
**Source:** `docs/PRD-v6.0.md` §D-601 (lines 222-284) + §3.2; `docs/plans/v6-implementation-order.md` §3 + §4 step 2.4; operator decision §10.1 (manual cab entry — locked).
**Builds on:** D-602 (`src/lib/sitevisits/*` — `transitionSiteVisit`, the 7-state machine, the `site_visit` jsonb schema *already carrying* every cab/driver/assignment field), D-608 (`resolveSalesRepForProject` — the primary-rep lookup with on-leave fallback), D-322/D-415/D-603 (`agent_approval_queue` + `dispatchApprovedDraft`), D-130 (`call.next_best_action` + `onCallNextBestAction`), D-600 (the `onCallNextBestAction` → Inngest fan-out pattern + the `agent_approval_queue` row shape).

---

## Problem

D-602 built the Site Visit module — list, detail, 7-state machine, and a `site_visit` jsonb schema that *already* has `cab_provider` / `driver_name` / `driver_phone` / `vehicle_number` / `pickup_address` / `pickup_time` / `assigned_sales_rep_id` (D-602 added them, read-only, "D-601 writes these in Phase 2"). D-608 built `resolveSalesRepForProject`. Nothing connects them: a Voice IQ call where the customer asks for a site visit produces **nothing**.

D-601 builds the loop (PRD §3.2): VIQ `call.next_best_action` with `nba.action='book_site_visit'` → a draft `site_visit` node + a `site_visit_booking` row in the approval queue → an operator fills a one-screen cab form → the visit transitions `draft → scheduled` with the cab details, the sales rep at that project is auto-assigned via D-608, and a WhatsApp confirmation goes to the customer.

### Architecture decisions

- **No migration for cab fields — D-602 already shipped the schema.** Per D-602's own migration note, the cab/driver/assignment fields live in `src/lib/nodes/schemas/site_visit.ts` (additive jsonb, no DDL) and D-602 landed them. D-601 *writes* those fields; it adds **no** site-visit DDL.
- **One tiny migration: `agent_approval_queue.ref_node_id`.** A `site_visit_booking` queue row must point at its draft `site_visit` node. The queue table has `lead_id` but no generic node reference. D-601 adds `ref_node_id uuid REFERENCES nodes(id) ON DELETE SET NULL` — a small additive column the submit action reads to find the visit. Brochure / follow-up rows leave it null.
- **Inngest-driven, mirroring D-600.** `onCallNextBestAction` gains a second best-effort `inngest.send` block: `nba.action='book_site_visit'` → `agent/site_visit.requested` → `siteVisitAgentOnRequest` → `runSiteVisitBookingAgent`. Standalone, injectable-deps, unit-tested directly.
- **Draft creation via `createNode`, not by widening D-602's `createSiteVisit`.** `createSiteVisit` hardcodes `state='scheduled'` and a fixed arg set. Rather than reshape D-602's API, `runSiteVisitBookingAgent` calls the `createNode` primitive directly (the same primitive `createSiteVisit` wraps) with `state='draft'`, the `lead_id` + a prefilled `scheduled_at` + `project_id`, and writes the `attended` edge — exactly D-602's create shape, just with `draft` state.
- **The queue "action card" is a form, not a textarea.** `queue-item.tsx` branches: `agent_kind='site_visit_booking'` renders `<SiteVisitBookingCard>` (pickup address, date/time, cab provider, driver name + phone, vehicle number) instead of the draft-text textarea. Submit → `submitSiteVisitBookingAction`.
- **Submit reuses `dispatchApprovedDraft` for the WhatsApp send.** The `site_visit_booking` queue row is `channel='whatsapp'`. On submit, D-601 composes the confirmation into `edited_body`, sets the row `approved`, and calls `dispatchApprovedDraft` — the exact D-415/D-603 path D-600 uses. WhatsApp-not-configured → the booking still succeeds (visit scheduled, rep assigned), the message is `deferred`.
- **Notifications = activity nodes (D-619 deferred).** PRD §3.2 says "Notify assigned sales rep + coordinator (D-619)". D-619 is Phase 4. D-601's "notification" is provenance activity nodes — "Sales rep assigned" / "No project rep — coordinator to assign" / "Customer notified" — on the visit. D-619 later layers real in-app/email/WhatsApp pings on top; D-601's activity trail is the V6 surface.
- **Manual cab entry only (§10.1 locked).** No Uber/Ola API. The operator types driver/vehicle/phone; `cab_booking_ref` is an optional free-text field for an externally-booked reference.

D-601 ships:

1. **Migration** `supabase/migrations/20260514190000_agent_queue_ref_node.sql` — `agent_approval_queue.ref_node_id`. Additive, idempotent, `ROLLBACK:` block.
2. **Agent + booking lib** `src/lib/agents/site-visit-agent.ts` — `runSiteVisitBookingAgent`, `confirmSiteVisitBooking`, `composeSiteVisitConfirmation`, `cabDetailsSchema`, the action constant + `isSiteVisitBookingAction`.
3. **Inngest** — `agent/site_visit.requested` event; `src/lib/inngest/functions/site-visit-agent.ts`; registered in the route.
4. **Trigger** — `onCallNextBestAction` second best-effort emit block.
5. **Queue** — `submitSiteVisitBookingAction` (`queue/actions.ts`); `queue-item.tsx` branches to `<SiteVisitBookingCard>`; `queue/page.tsx` carries `ref_node_id`.
6. **UI** — `src/components/agents/site-visit-booking-card.tsx`.
7. **Tests** — `site-visit-agent.test.ts`, `site-visit-booking-card.test.tsx`, queue-page/item extensions.
8. **Verify** `scripts/verify_601.mjs` — the `ref_node_id` column.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** A `call.next_best_action` event with `nba.action='book_site_visit'` for an in-org lead creates a `site_visit` node `state='draft'` (prefilled `lead_id`, a best-effort `scheduled_at` from the lead's `preferred_date`, and `project_id` when the lead carries a UUID-shaped one) + an `attended` edge to the lead + a `site_visit_booking` row in `agent_approval_queue` (`channel='whatsapp'`, `status='pending'`, `ref_node_id`=the draft visit). Idempotent via the existing `(org, lead, agent_kind) WHERE status='pending'` partial unique index.

- [ ] **AC-2** `/admin/agents/queue` renders the `site_visit_booking` row as `<SiteVisitBookingCard>` — a cab form (pickup address, visit date/time, cab provider, driver name + phone, vehicle number, optional booking ref) — not the draft-text textarea. `cabDetailsSchema` validates the submission server-side.

- [ ] **AC-3** Submitting the cab form: `confirmSiteVisitBooking` writes the cab fields + `scheduled_at` + `assigned_sales_rep_id` onto the `site_visit` node (`updateNodeData`), transitions it `draft → scheduled` (`transitionSiteVisit` — audit-logged), composes the WhatsApp confirmation into the queue row's `edited_body`, marks the row `approved`, and dispatches via `dispatchApprovedDraft`. WhatsApp-not-configured → result `{ deferred }`, the visit stays `scheduled` (the booking succeeded).

- [ ] **AC-4** The composed confirmation contains: lead first name, visit date + time, vehicle number, driver name, driver phone, pickup address, pickup time, and the project name when known — verified by a `composeSiteVisitConfirmation` unit test.

- [ ] **AC-5** Sales-rep assignment: `confirmSiteVisitBooking` resolves the visit's `project_id` through D-608 `resolveSalesRepForProject` — the project's primary rep (or the on-leave fallback). No `project_id`, or no assignment for it → `assigned_sales_rep_id` is left null and a "No project rep — coordinator to assign" activity node is written (PRD AC-5).

- [ ] **AC-6** Cross-org isolation: `runSiteVisitBookingAgent` resolves the lead org-scoped; `confirmSiteVisitBooking` loads the queue row org-scoped, verifies the `ref_node_id` visit is in the caller's org before any write, and `transitionSiteVisit` re-checks `caller_org_id`. An org-A operator can never finalize an org-B booking. Covered by unit tests with cross-org rows.

- [ ] **AC-7** RBAC: `submitSiteVisitBookingAction` runs on the existing `/admin/agents/queue` surface, gated `agents:view_activity` (the sibling approve/reject actions' gate; org_admin holds it). The four V6 roles + `site_visits:create`/`:assign`/`:coordinate` already exist (D-602/D-003) — D-601 adds no permission.

- [ ] **AC-8** Tests: `site-visit-agent.test.ts` (`runSiteVisitBookingAgent` create + idempotent + lead-not-found + non-action skip + cross-org; `confirmSiteVisitBooking` happy path + rep-assigned + no-rep-fallback + bad-cab-input + cross-org + whatsapp-deferred; `composeSiteVisitConfirmation`); `site-visit-booking-card.test.tsx` (RTL — form fields, validation, submit→done); queue-page/item extensions. `npx tsc --noEmit` clean for changed files; targeted + full vitest green.

- [ ] **AC-9** All 10 V6 stopping-criteria gates pass. Migration `20260514190000_agent_queue_ref_node.sql` applies via `scripts/apply_migration.mjs`; `scripts/verify_601.mjs` all-PASS.

---

## Non-goals (deferred)

- **Cab booking API** (Uber for Business / Ola Corporate) — §10.1 locked to manual entry; API auto-booking is V6.x.
- **Real notifications** — D-619 (Phase 4). D-601 writes activity nodes as the provenance + V6 "notification" surface.
- **Calendar sync** — PRD §D-601 V6.x.
- **Multi-leg trips / driver-side tracking** — out of scope.
- **The Site Visit list/detail UI** — D-602 already shipped it; D-601's scheduled visits simply appear there. D-601 touches no list/detail code.
- **Editing a booked visit's cab details** — D-602's detail page renders them; a re-edit flow is a later directive. D-601 is create-draft → confirm-once.
- **A bespoke site-visit WhatsApp template** — D-601 reuses the follow-up WA template path in `dispatchApprovedDraft` (the composed body interpolated into the template variable), same as D-600.

---

## Stack

- **New:** `supabase/migrations/20260514190000_agent_queue_ref_node.sql`, `src/lib/agents/site-visit-agent.ts`, `src/lib/inngest/functions/site-visit-agent.ts`, `src/components/agents/site-visit-booking-card.tsx`, `scripts/verify_601.mjs`, `tests/lib/agents/site-visit-agent.test.ts`, `tests/components/site-visit-booking-card.test.tsx`.
- **Modified:** `src/lib/inngest/client.ts` (`agent/site_visit.requested`), `src/app/api/inngest/route.ts` (register), `src/lib/events/call-audit/onCallNextBestAction.ts` (second emit block), `src/app/(admin)/admin/agents/queue/actions.ts` (`submitSiteVisitBookingAction`), `src/app/(admin)/admin/agents/queue/queue-item.tsx` (branch to the card), `src/app/(admin)/admin/agents/queue/page.tsx` (`ref_node_id` in the row), plus test extensions.
- **Reuses:** `createNode` / `updateNodeData` (`nodes/api.ts`), `transitionSiteVisit` + the 7-state machine (D-602), `resolveSalesRepForProject` (D-608), `dispatchApprovedDraft` (D-415/D-603), `resolveOrgAdapter`, the `onCallNextBestAction` → Inngest fan-out + the `agent_approval_queue` insert shape from D-600, `getSupabaseAdmin`.
- **DB:** one additive `agent_approval_queue` column. No new table. The `site_visit` schema is unchanged (D-602 already carries the cab fields).
- TDD enforced. Branch deploys only.

---

## Authority

- **Implementation-order §4 step 2.4** — D-601 is Phase 2's second flagship agent; PRD §3.2 is the canonical loop diagram.
- **Implementation-order §10.1 (locked)** — manual cab entry; the agent does not re-solicit a cab-provider API decision.
- **PRD-v6.0 §D-601** — the event subscription, draft row, cab-form action card, `draft → scheduled` transition, D-608 rep lookup, WhatsApp template, and the no-assignment fallback are specified there.
- **D-602 directive (Non-goals + Risks)** — explicitly hands D-601 the cab/assignment jsonb fields and the `draft` state; D-601 honors that contract (no schema change).
- **Constitution II** — tenant isolation: every read/write in `runSiteVisitBookingAgent` and `confirmSiteVisitBooking` is `organization_id`-scoped; `transitionSiteVisit` re-checks `caller_org_id`.
- **Constitution III** — provenance: `createNode` / `updateNodeData` / `transitionSiteVisit` each write `audit_log` rows; D-601 adds activity nodes for the booking, assignment, and customer notification.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration** (from the worktree, parent `.env`): `node --env-file=../../../.env scripts/apply_migration.mjs supabase/migrations/20260514190000_agent_queue_ref_node.sql`.
- [ ] **Verify**: `node --env-file=../../../.env scripts/verify_601.mjs` — expect ALL CHECKS PASS.
- [ ] **Smoke**: POST a `call.next_best_action` event (`nba.action='book_site_visit'`) for a lead whose project has a D-608 primary rep → a `site_visit_booking` card appears in `/admin/agents/queue` → fill the cab form, submit → the visit shows `scheduled` in `/dashboard/site-visits` with the cab block + the assigned rep, and (with a configured WhatsApp adapter) the customer gets the confirmation.
- [ ] **Note** — D-619 (Phase 4) replaces the activity-node "notifications" with real in-app/email/WhatsApp pings to the rep + coordinator.

---

## Risks & decisions

- **Draft `scheduled_at` is a placeholder.** `siteVisitSchema` requires `scheduled_at`; a draft created from a VIQ event may have no confirmed time. `runSiteVisitBookingAgent` prefills it best-effort from the lead's `preferred_date` (when a valid ISO datetime) and otherwise stamps `now()`; the operator sets the real visit time in the cab form, and `confirmSiteVisitBooking` overwrites it on submit. The draft's placeholder time is never customer-visible.
- **One tiny migration vs. overloading `attachments`.** Linking the queue row to its draft visit could have ridden the D-600 `attachments` jsonb, but that column is semantically "brochure attachments". `ref_node_id` is a clean, additive, generically-useful pointer — worth one `ADD COLUMN`.
- **Touching the shared queue UI again.** D-600 already taught `queue-item.tsx` about `attachments`/`error`; D-601 adds a `site_visit_booking` branch. `follow_up_stale_lead` and `brochure_send` rows take the unchanged path — the branch is purely additive, and the existing queue tests must stay green.
- **`updateNodeData` reads by id only.** `nodes/api.ts:updateNodeData` does not org-filter its read (D-602's `assignSalesRepAction` pre-checks org before calling it). `confirmSiteVisitBooking` follows that exact pattern — it verifies the `ref_node_id` visit is in the caller's org *before* `updateNodeData`, and `transitionSiteVisit` re-checks `caller_org_id` as the second fence.
- **WhatsApp send reuses `dispatchApprovedDraft`.** No new dispatch path — the site_visit_booking row is a normal `channel='whatsapp'` queue row; the only D-601-specific step is composing `edited_body` from the cab details before flipping it `approved`. A not-configured org gets the same `deferred` UX D-600 introduced.

---

## Learned Patterns Applied

- **`best-effort-event-emit`** — `onCallNextBestAction`'s `book_site_visit` emit is try/catch-wrapped; a send failure logs but never fails the event handler.
- **`injectable-supabase-client-for-tests`** — `runSiteVisitBookingAgent` / `confirmSiteVisitBooking` take injectable `{ client, gateway? }` deps; unit tests inject a chainable mock + a fake dispatch.
- **`caller-org-filter-on-service-role-read`** — every read/write is `organization_id`-scoped; `confirmSiteVisitBooking` verifies the visit's org before mutating; `transitionSiteVisit` re-checks `caller_org_id`. Cross-org unit tests are the proof.
- **`server-action-result-discriminated-union`** — `submitSiteVisitBookingAction` and the lib functions return `{ ok: true, … } | { ok: false, reason, … }`; no throwing across the boundary.
- **`additive-only-migrations`** — one `ADD COLUMN IF NOT EXISTS`, explicit `ROLLBACK:` block, no destructive change.
- **`zod-schema-for-jsonb`** — `cabDetailsSchema` validates the form submission; the visit's jsonb stays `siteVisitSchema`-valid via `updateNodeData`'s built-in re-validation.
