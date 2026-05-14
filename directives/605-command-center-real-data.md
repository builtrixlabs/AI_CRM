# Directive 605 — Command Center home · Real Data

**Kind:** feature (V6 Phase 1, step 1.6 — replace the hardcoded `/dashboard` mockup)
**Status:** AUTHORIZED — operator cleared Phase 1 to run end-to-end 2026-05-14 ("implement all these features without stopping … completing phase 1").
**Branch target:** `v6-phase-1`
**Generated:** 2026-05-14T11:40:00Z
**Source:** `docs/PRD-v6.0.md` §D-605 (lines 449-482); `docs/plans/v6-implementation-order.md` §4 step 1.6.
**Builds on:** D-002 (graph `nodes` model), D-005 (`getCockpitData` count-query pattern), D-401 (`getLeadCanvas` + the canvas realtime hook `useLeadActivityStream`), D-410 (real list pages), D-322 (`agent_approval_queue`).

---

## Problem

`/dashboard` — the first page every operator sees — is a hardcoded mockup. `KpiTiles` shows `"247"`, `PulseFeed` shows `"Rohit Menon → +91 98••• 4421"`, `LeadHeatmap` shows fake Chennai clusters, `AgenticState` shows fake orchestrations, `StateMachineCanvas` shows a fake workflow, `HotLeadsStrip` shows three invented leads. None of the six widgets take props or touch the database.

D-605 replaces all six with real, org-scoped, role-scoped data from one fetch lib.

D-605 ships:

1. **Data lib** `src/lib/command-center/data.ts` — `getCommandCenterData(viewer)`: one role-scoped lead fetch + a deals fetch + a recent-activity fetch + an `agent_approval_queue` fetch, aggregated in JS into a single `CommandCenterData` payload. Org-scoped on every query; the rep tier additionally narrows to leads/activities the viewer owns.
2. **Six widgets rewired to props** — every widget in `src/components/command-center/` becomes presentational, fed by `CommandCenterData`:
   - `KpiTiles` — `active_leads` (state ∈ new/contacted/qualified), `hot_pipeline` (intent_score ≥ 70), `avg_intent` (mean intent_score, last 30d), `closed_mtd` (deals booked this month).
   - `PulseFeed` — last 20 activity nodes; a client component subscribing to `nodes` INSERT (`node_type=activity`) for live updates (mirrors the canvas realtime hook).
   - `LeadHeatmap` → **rebuilt** as a per-day lead-volume + intent-density chart for the current month (the PRD's spec — the geographic-cluster mockup is dropped).
   - `AgenticState` → real `agent_approval_queue` summary: pending / approved / sent-today / rejected.
   - `StateMachineCanvas` → **rebuilt** as the real lead-state distribution (count per state).
   - `HotLeadsStrip` — real top-5 leads by `intent_score` in the viewer's scope, linking to the lead canvas.
3. **Page rewrite** `src/app/(dashboard)/dashboard/page.tsx` — fetches `getCommandCenterData`, passes data to the widgets, and renders the AC-6 empty state ("No leads yet — connect MIH or use the universal webform endpoint") when the viewer's scope has no leads.

**No migration** — D-605 reads existing tables only.

---

## Architecture decisions

- **One fetch lib, JS aggregation.** `getCommandCenterData` fetches the viewer's lead rows once (`id, state, data, created_by, created_at`) and computes `active_leads`, `hot_pipeline`, `avg_intent`, the per-day volume series, the state distribution, and the hot-5 all in JS. This sidesteps the jsonb-numeric-comparison trap (`data->>'intent_score'` is text — `.gte` would compare lexically) and keeps the role-scope filter in one place. At V6 pilot scale (hundreds–low-thousands of leads/org) the single fetch is well within the AC-1 1.5 s budget. Mirrors D-602's `listSiteVisits` "fetch + JS filter" shape.
- **`intent_score` source = `data.intent_score`.** The lead's intent lives in `nodes.data.intent_score` (the `leadSchema` field the canvas already reads). `node_signals` is not joined — D-009 writes `data.intent_score`; D-605 reads it. Leads without an intent score (not yet enriched) are excluded from the `avg_intent` mean and treated as score 0 for the hot threshold.
- **Role scope.** `org_owner` / `org_admin` / `workspace_admin` / `manager` get the full org rollup (AC-3, AC-4). The rep tier (`sales_rep`, `presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `read_only`, `site_visit_coordinator`) gets a personal rollup — leads where `data.assigned_sales_rep_id` or `created_by` is the viewer (AC-2). Same `FULL_VISIBILITY_ROLES` split as D-602. Manager team-by-project narrowing (PRD AC-3 "team") is org-wide in D-605 — team infrastructure is a D-612 concern; noted in *Non-goals*.
- **Activities are role-scoped too.** For the rep tier, the pulse feed shows only activities edge-linked to the viewer's leads (`edges` where `to_node_id ∈ viewer's lead ids`, activity edge types). Full-visibility roles get the recent org activity stream. This honors AC-2's "leads **and activities** in their assignment".
- **`agent_approval_queue` is org-scoped for all roles.** It is an agent-operations widget (the queue page itself is gated on `agents:view_activity`); the dashboard summary shows org-wide agent state regardless of viewer role. Not a per-rep figure.
- **`LeadHeatmap` and `StateMachineCanvas` are rebuilt, not re-skinned.** The PRD redefines both: `LeadHeatmap` → per-day volume/intent chart, `StateMachineCanvas` → lead-state distribution. The mockup shapes (geographic blobs, workflow HUD) are replaced; the `cc-card` shell + numbering eyebrow are kept for visual continuity.
- **Realtime via a client `PulseFeed`.** `PulseFeed` becomes a `"use client"` component taking the server-fetched seed + `orgId`; it subscribes to `nodes` INSERT on a `org:pulse:<org_id>` channel, re-checking `organization_id` on the client (defense-in-depth, per the canvas hook). AC-5.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** `/dashboard` renders real org-scoped data. `getCommandCenterData` runs four scoped queries; the page passes the payload to all six widgets. (Pilot-scale latency is well under the 1.5 s p95 target — single indexed fetches.)
- [ ] **AC-2** A rep-tier viewer sees only their own leads + edge-linked activities — `data.assigned_sales_rep_id`/`created_by` scope on leads, edge-join scope on activities.
- [ ] **AC-3 / AC-4** A `manager` / `org_admin` / `org_owner` / `workspace_admin` viewer sees the full org rollup (no personal narrowing).
- [ ] **AC-5** `PulseFeed` is a client component subscribed to `nodes` INSERT (`node_type=activity`); a new activity for the viewer's org prepends without a page reload. Org re-checked on the client.
- [ ] **AC-6** When the viewer's scope has zero leads, the page renders the empty state: "No leads yet — connect MIH or use the universal webform endpoint." (with a link to `/admin/integrations`).
- [ ] **AC-7** `KpiTiles` shows the four real KPIs; `LeadHeatmap` shows the per-day volume series for the current month; `AgenticState` shows real `agent_approval_queue` counts; `StateMachineCanvas` shows the real lead-state distribution; `HotLeadsStrip` shows the real top-5 by intent, each linking to `/dashboard/leads/<id>`.
- [ ] **AC-8** Tests: `data.test.ts` (role-scoping, KPI math, empty state, per-day bucketing) + RTL tests for all six rewired widgets. `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-9** All applicable V6 stopping-criteria gates pass. **Gate 4 (migrations) = N/A** — D-605 ships no migration.

---

## Non-goals (deferred)

- **Customizable widgets on the Command Center home** — `/admin/dashboards` (D-021 / D-612) owns custom dashboards; D-605's home is a fixed six-widget layout.
- **Manager team-by-project rollup** — D-605 gives managers the org-wide rollup; per-team narrowing needs D-612 team-dashboard infrastructure.
- **Historical KPI deltas** — the mockup's "+12 / +5" delta pills are dropped; there is no period-over-period snapshot table in V6. The widgets show current values only.
- **Geographic heatmap** — the mockup's Chennai cluster map is replaced by the PRD-specified per-day volume chart; a real geo view is not in V6 scope.
- **`StateMachineCanvas` per-lead workflow HUD** — repurposed to the org lead-state distribution per the PRD; the per-lead animated workflow is not a V6 deliverable.

---

## Stack

- **New:** `src/lib/command-center/data.ts`, `scripts` — none (no migration); tests under `tests/lib/command-center/` + `tests/components/command-center/` (the six widget tests are rewritten).
- **Modified:** all six `src/components/command-center/*.tsx` widgets (props-driven; `lead-heatmap` + `state-machine-canvas` rebuilt; `pulse-feed` becomes a realtime client component), `src/app/(dashboard)/dashboard/page.tsx`.
- **Reuses:** `getCurrentUser`, `getSupabaseAdmin`, the `getCockpitData` count-query pattern, the `useLeadActivityStream` realtime pattern + `createSupabaseBrowserClient`, the `cc-*` Command Center CSS classes.
- **DB:** read-only. No schema change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-605** — the six-widget real-data spec, including the `LeadHeatmap` → per-day chart and `StateMachineCanvas` → state-distribution redefinitions, is specified there.
- **Implementation-order §4 step 1.6** — "Fix the homepage that every user sees first."
- **Constitution II** — every query in `getCommandCenterData` filters by `organization_id`; the rep-tier narrowing is the per-user scope; the realtime client re-checks org.
- **D-002 / baseline 110** — leads, activities, deals are all `nodes` rows; D-605 reads them, adds nothing to the model.

---

## Operator follow-ups (post-merge)

- [ ] **No migration** — D-605 ships none (`docs/V6_STATUS.md` Gate 4 row = N/A).
- [ ] **Smoke** `/dashboard` as an `org_admin` of an org with seeded leads → KPIs, heatmap, agentic state, state distribution, hot-leads all show real numbers.
- [ ] **Smoke** as a `sales_rep` → the same page shows only their assigned leads' figures.
- [ ] **Smoke realtime** — ingest a lead via the D-604 MIH endpoint (or webform) for the org; the pulse feed should prepend the new activity without a reload.
- [ ] **Empty-state smoke** — a fresh org with no leads → the "connect MIH" empty state renders.

---

## Risks & decisions

- **No historical deltas.** The mockup's delta pills implied a snapshot history that does not exist. Rather than invent a snapshot table (out of D-605 scope), the KPI tiles show current values only. If period-over-period deltas are wanted later, that is a dedicated directive with its own `kpi_snapshots` table.
- **`avg_intent` over un-enriched leads.** Before D-009 enrichment runs, leads have no `data.intent_score`. `getCommandCenterData` excludes null-intent leads from the mean (so a fresh org shows `avg_intent: 0` cleanly rather than `NaN`) and counts them as below the hot threshold.
- **Realtime is best-effort.** If the Supabase realtime channel fails to connect, `PulseFeed` still renders the server-fetched seed — it just won't live-update. No error surface; the feed degrades to "fresh on navigation", matching the canvas hook's posture.
- **Activity edge-scoping cost for reps.** A rep's pulse feed does one extra `edges` query to resolve their leads' activity ids. Bounded by the rep's lead count; negligible at pilot scale. If a power-rep ever has thousands of leads, capping the lead-id `IN (...)` list is the follow-up.
- **`closed_mtd` counts deals, not leads.** "Closed" = a `node_type='deal'` row in `state='booked'` with `updated_at` in the current month. Deal closure is the booking event (D-321). For the rep tier this is role-scoped to deals they own.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — `getCommandCenterData` runs on `getSupabaseAdmin()`; every query filters by `organization_id`, and the rep-tier narrowing is applied in JS over the org-scoped set.
- **`fetch-once-aggregate-in-js`** (from D-602 `listSiteVisits`) — one lead fetch feeds six derived figures; avoids six count round-trips and the jsonb-numeric-comparison trap.
- **`realtime-client-rechecks-org`** (from the canvas `useLeadActivityStream` hook) — the `PulseFeed` client component re-verifies `organization_id` on every realtime payload, even though Supabase RLS already filters.
- **`injectable-supabase-client-for-tests`** — `getCommandCenterData` takes an optional `client` last-arg so unit tests inject the chainable mock.
