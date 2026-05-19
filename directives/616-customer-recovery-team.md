# Directive 616 — Customer Recovery Team

**Kind:** feature (V6 Phase 3, step 3.3 — dedicated queue + role for re-engaging cold/lost leads)
**Status:** AUTHORIZED — operator cleared Phase 3 to run end-to-end 2026-05-19 ("D-616 → D-606 → D-612 → D-611, autonomous").
**Branch target:** `v6.3` (Phase 3 phase branch, cut from `v6.2.2@f112d6c`).
**Generated:** 2026-05-19T12:00:00Z
**Source:** `docs/PRD-v6.0.md` §D-616 (lines 908-927); `docs/plans/v6-implementation-order.md` §4 step 3.3.
**Builds on:** D-007 (lead lifecycle + state catalog), D-322 / D-415 (the agent-queue pattern), D-602 (`customer_recovery_rep` enum value), D-610 (the Inngest cron + per-org-loop pattern), D-413 (custom-views list-page pattern).

---

## Problem

V5 has no recovery surface. Leads in terminal states (`lost`, `on_hold`) or cold non-terminal states (`contacted` / `qualified` with no contact in 14+ days) sit in the leads list with no dedicated workflow. The result: terminal leads are revisited ad-hoc (a manager remembers a lost opportunity) and cold non-terminal leads age out into terminal states without one last re-engagement attempt. D-616 builds the dedicated workflow: a cron sweep that classifies recovery candidates, a queue of those candidates, and a role + dashboard for the recovery rep that owns the loop.

D-616 ships:

1. **Migration** `20260519120000_customer_recovery.sql` — one new table `customer_recovery_queue` (id, org_id, lead_id, recovery_reason, added_at, claimed_by/claimed_at, resolved_at, resolution). Org-scoped + RLS. Partial-unique index on (org, lead) WHERE `resolved_at IS NULL` — a lead has at most one open recovery row.
2. **Sweep lib** `src/lib/recovery/sweep.ts` — `classifyRecoveryReason(lead)` (pure scorer: returns `'lost'`, `'on_hold'`, `'stale_contacted'`, `'stale_qualified'`, or `null`), `findRecoveryCandidates(org_id)` (DB scan + classify + dedup against open queue rows), `enqueueRecoveryCandidate(candidate)` (idempotent insert), `runRecoverySweep()` (cron entry).
3. **Queue lib** `src/lib/recovery/queue.ts` — `listRecoveryQueue(filters)`, `claimRecoveryItem(queue_id, user_id)` (transitions to claimed), `resolveRecoveryItem(queue_id, resolution, note)` (transitions to resolved + writes audit row).
4. **Inngest function** `src/lib/inngest/functions/customer-recovery-sweep.ts` — every 6h, calls `runRecoverySweep()`. Registered in `src/app/api/inngest/route.ts`.
5. **RBAC** — three new perms (`recovery:view`, `recovery:claim`, `recovery:resolve`); the four V6 phone-rep roles already exist, this directive adds the queue perms to `customer_recovery_rep` + `manager` + `org_admin`.
6. **UI** — `/dashboard/recovery` list page + filters (status bucket: open / claimed-by-me / all-resolved; reason filter) + per-row claim / resolve actions; `RecoveryQueueTable`, `RecoveryFilterBar`, `RecoveryClaimButton`, `RecoveryResolveForm`.
7. **Route policy** — `customer_recovery_rep` lands on `/dashboard/recovery` after sign-in (extends `landingFor()` in `src/lib/auth/route-policy.ts`).

---

## Architecture decisions

- **PRD shorthand reconciliation: `state in ('lost','stale')`.** `LEAD_STATES` is `[new, contacted, qualified, lost, on_hold, junk]` — there is no `'stale'` state; "stale" is a behavioural descriptor (cold non-terminal lead). The sweep treats `lost` and `on_hold` as **terminal-recovery** candidates (sales gave up; one re-engagement attempt) and `contacted`/`qualified` with `last_contact_at < now - 14d` as **stale-recovery** candidates. `junk` is excluded (bad data, not recoverable); `new` is excluded (covered by D-322 follow-up sweep on the 7-day window). The four reason values are `lost`, `on_hold`, `stale_contacted`, `stale_qualified` — surfaced on the queue UI as a filter.
- **Don't poach D-322's candidates.** D-322's follow-up sweep already handles `state in (new, contacted)` on the **7-day** window. D-616's stale window is **14+ days** so the recovery sweep picks up where the follow-up sweep has tried-and-not-converted. The partial-unique queue index ensures a single open recovery row per lead.
- **`customer_recovery_queue` is a dedicated table, not the `agent_approval_queue`.** The agent queue is for **agent-drafted message approvals** (Constitution I: AI tier ceiling). Recovery items are **work tickets for a human rep** — claim, talk to the customer, mark resolved. Different verbs, different audit trail, different lifecycle. A second table keeps both surfaces clean.
- **`recovery_reason` is the closed enum on the queue row.** Stored as `text` with a CHECK constraint matching the four reasons. The sweep picks the reason at enqueue time and stores it; the UI groups by it. No re-classification — a lead that went `contacted → stale_contacted` and then later `→ lost` would get a *new* recovery row on the next sweep (the open one is resolved when the rep changes the lead's state, or stays open as a record of the prior attempt).
- **Resolution closes the queue row; the lead's state is the lead's business.** A recovery rep marks a row `won_back` (lead converted back to `contacted` or `qualified`), `unreachable` (no answer after attempts), or `confirmed_lost` (validated the lost state). The recovery row's `resolved_at` is set; the lead's state transition (if any) is done via the existing `transitionLead()` API and audit-logged separately. This keeps D-007's terminal-state stickiness contract intact (`lost`/`on_hold`/`junk` have no allowed transitions in the V0 graph) — recovering a `lost` lead is an out-of-band manager action, not something the queue automates.
- **The sweep is read-only on `nodes`.** It only writes to `customer_recovery_queue`. Nothing edits a lead's `state` or `data` from the sweep. Same posture as D-322's follow-up: classification is observation, not mutation.
- **Org-scoped RLS, app-permission gate.** RLS on `customer_recovery_queue` enforces `organization_id = app_org_id()`. The `recovery:view` / `recovery:claim` / `recovery:resolve` permission gates are in the page + server actions. Same posture as D-602's `site_visit_coordinator_claims` and D-610's `lead_allocation_rules`.
- **Sweep runs as `actor_type='system'`.** Audit rows on resolve carry the resolving user; enqueue is a system action with no audit row (the recovery row itself is the record).
- **Landing for `customer_recovery_rep`.** Extends `landingFor()` to send recovery reps to `/dashboard/recovery` instead of the default `/dashboard`. Mirrors how site-visit coordinators would land on `/dashboard/site-visits` (not currently wired — left for a future polish; D-616 only wires the recovery landing it owns).

---

## Success criteria

- [ ] **AC-1** A `customer_recovery_rep` logs in and lands on `/dashboard/recovery`, sees a queue scoped to the recovery rows for their org.
- [ ] **AC-2** Every 6h, `customerRecoverySweep` runs `runRecoverySweep()` across all orgs; for each org, a lead in `lost` or `on_hold` produces an open queue row with the matching `recovery_reason`; a `contacted` or `qualified` lead whose `data.last_contact_at < now - 14d` produces a `stale_contacted` / `stale_qualified` row. A lead already with an open row is skipped.
- [ ] **AC-3** A rep clicks **Claim** on an open row → `claimed_by` + `claimed_at` are set; the row remains until resolved. A second rep clicking Claim on the same row gets a conflict error.
- [ ] **AC-4** A rep clicks **Resolve** with a resolution (`won_back` / `unreachable` / `confirmed_lost`) → `resolved_at` + `resolution` + optional `note` are set; an `audit_log` row is written with `action='recovery_resolved'`, `diff: { queue_id, lead_id, resolution }`, `actor_type='user'`.
- [ ] **AC-5** Cross-tenant: org A's recovery queue is never visible to org B. Proven by `tests/integration/customer-recovery-cross-tenant.test.ts`.
- [ ] **AC-6** `recovery:view` / `recovery:claim` / `recovery:resolve` are in the literal `PERMISSIONS` catalog; `customer_recovery_rep` holds `recovery:view` + `recovery:claim` + `recovery:resolve`; `manager` + `org_admin` hold `recovery:view`.
- [ ] **AC-7** `customerRecoverySweep` is registered in `src/app/api/inngest/route.ts` and runs on the `0 */6 * * *` cron alongside the other recurring sweeps.
- [ ] **AC-8** The list page surfaces three filter buckets: `open` (default), `mine` (claimed by current user, unresolved), `resolved` (resolved in the last 30 days). Reason filter is independent.
- [ ] **AC-9** Tests: `sweep.test.ts` (classifier matrix + candidate dedup), `queue.test.ts` (claim/resolve happy paths + conflicts), `customer-recovery-sweep.test.ts` (Inngest handler), `recovery-queue-table.test.tsx` (RTL), `customer-recovery-cross-tenant.test.ts` (integration). `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-10** All 10 V6 stopping-criteria gates pass. Migration `20260519120000_customer_recovery.sql` applies; `scripts/verify_616.mjs` PASS against live Supabase.

---

## Non-goals (deferred)

- **Auto-promote a `won_back` resolution to a state transition on the lead.** The PRD says "re-engage, mark as resolved" — it does NOT say "and reopen the lead". D-616 leaves the lead-state change to the existing leads canvas (the rep navigates to the lead and transitions it). Reasons: (a) terminal states are sticky in the V0 lead graph by design (D-007), (b) reopening a `lost` lead is a manager-level decision today, (c) coupling adds blast radius the V6 pilot does not need.
- **Recovery-specific message drafts (T2 templated).** A "send a we-miss-you WhatsApp" agent for recovery candidates is V6.x — would be a new `agent_kind='recovery_outreach'` row in `agent_approval_queue` (Constitution I, D-322 pattern). D-616 ships only the human-driven queue; the agent comes later.
- **Recovery-specific dashboard widgets.** PRD §D-616 mentions "recovery-specific dashboard widgets". The Command Center home (D-605) is already prop-driven and team-scoped; a recovery widget is a 1-day follow-up — D-616 ships only the dedicated page + queue. Widgets become trivial once D-612 (team-scoped dashboards) lands.
- **A SLA timer on open recovery rows.** "Resolve within N days" alerts are out of scope; the operator surfaces aging via the list-table sort.
- **Configurable stale window.** The 14-day threshold is hard-coded (constants exported for tests). Per-org configuration is a V6.x customization.

---

## Stack

- **New:** `supabase/migrations/20260519120000_customer_recovery.sql`, `src/lib/recovery/{types,sweep,queue,index}.ts`, `src/lib/inngest/functions/customer-recovery-sweep.ts`, `src/app/(dashboard)/dashboard/recovery/{page,actions}.tsx`, `src/components/recovery/{recovery-queue-table,recovery-filter-bar,recovery-claim-button,recovery-resolve-form}.tsx`, `scripts/verify_616.mjs`, plus tests.
- **Modified:** `src/lib/auth/rbac.ts` (3 perms + recovery role perm set), `src/app/api/inngest/route.ts` (register sweep), `src/lib/auth/route-policy.ts` (landing for `customer_recovery_rep`).
- **Reuses:** the D-322 cron handler shape, the D-602 list-page + filter-bar layout, the D-413 server-action discriminated-union pattern, `getSupabaseAdmin()`, the org-RLS-app-permission migration pattern from D-602/D-608/D-610.
- **DB:** one new table, no destructive change. `IF NOT EXISTS` throughout.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-616** — role, cron cadence, queue, dashboard, three resolution verbs (take ownership / re-engage / mark resolved).
- **Implementation-order §4 step 3.3** — "New role + auto-routing of stale/lost leads to recovery queue + recovery-specific dashboard."
- **Constitution II** — every queue query filters by `organization_id`; the integration test proves org A's queue is never reachable from org B.
- **Constitution III** — provenance: an `audit_log` row on every resolve; the queue row itself is the record for the enqueue / claim transitions.
- **D-602 / V6 role extension** — the `customer_recovery_rep` enum value already exists; D-616 adds the operational permissions for it.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260519120000_customer_recovery.sql`, then `node --env-file=<parent>/.env scripts/verify_616.mjs`.
- [ ] **Smoke**: as an `org_admin` create a `customer_recovery_rep` user; sign in as them; confirm landing on `/dashboard/recovery`. Manually mark a lead `lost` via the canvas, trigger the Inngest sweep (or wait 6h), confirm the row appears, claim it, resolve it as `won_back`.

---

## Risks & decisions

- **A lead's `data.last_contact_at` is not maintained for every channel today.** The follow-up dispatch (`dispatch.ts`) writes activity nodes but doesn't always touch `data.last_contact_at` on the lead row — that field is the comms layer's responsibility, not D-616's. If the field is missing, the sweep falls back to `nodes.updated_at` (or `created_at` if not present) — the same fallback D-322 uses. Documented so the heuristic is explicit.
- **`junk` leads are excluded by design.** A `junk` lead is bad data, not a recoverable customer. The sweep filters it out at the SQL `WHERE` clause to keep the queue clean.
- **No retroactive cleanup on this migration apply.** Existing leads in `lost`/`on_hold` (or stale `contacted`/`qualified`) get picked up on the next cron tick — there is no "backfill recovery rows for the last 90 days" migration. The sweep is the single source of truth.
- **Concurrent claim.** Two reps clicking Claim simultaneously: the server action uses a conditional `UPDATE ... WHERE claimed_by IS NULL` and reads the affected row count; the loser gets `{ok:false, reason:'already_claimed'}`. No row-level lock needed.
- **Sweep failure does not block other orgs.** The per-org loop catches throws and continues — same posture as `runFollowUpAgent`.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every sweep / queue lib query runs on `getSupabaseAdmin()` and filters by `organization_id`; the integration test is the regulator's proof.
- **`cron-per-org-loop`** (from D-322 / D-610) — the Inngest handler runs a per-org loop; per-org failures are isolated, totals are summarised in the return value.
- **`server-action-result-discriminated-union`** — every D-616 action returns `{ ok: true } | { ok: false, reason }`.
- **`rls-org-isolation-app-permission-gate`** (from D-602/D-608/D-610) — RLS enforces org isolation; the `recovery:*` permissions are gated in the server actions.
- **`additive-only-migrations`** — one `IF NOT EXISTS` table; explicit `ROLLBACK:` block; no destructive change.
