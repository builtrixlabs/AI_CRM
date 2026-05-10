# Directive 321 — Deal canvas + promote-lead-to-deal

**Kind:** feature (V3 / Phase C — real-estate daily-use)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Branch target:** `v2`
**Source:** `docs/plans/v3-plan-v1.md` §5 D-321
**Builds on:** D-006 (lead canvas pattern), D-002 (graph node model), D-007 (state-machine pattern), D-320 (one-way-with-override transition pattern)

---

## Problem

The lead canvas (D-006) is the daily-driver for early-stage work, but once a lead qualifies, sales-rep work shifts to the deal — site visit scheduling, negotiation, close. Without a deal canvas, that work fragments across the dashboard widgets and the lead canvas. Reps lose context.

D-321 ships:

- A read-only `/dashboard/deals/[id]` mirroring the lead canvas pattern (stacked sections per Constitution IX, no tabs).
- A deal-stage state machine: `qualified → site_visit_scheduled → site_visit_done → negotiation → booked` (one-way; backward + from-terminal need admin override). Terminal `lost` allowed from any non-booked stage.
- "Promote lead to deal" action on the lead canvas — creates the deal node, links it to the lead via a `deal_to_lead` edge, audit-logs.

## Success criteria (production target 80/90)

- [ ] **AC-1** New module `src/lib/deals/transitions.ts` — pure state machine (`isForwardTransition`, `isOverrideRequired`, `assertTransitionAllowed`, `IllegalDealTransitionError`).
- [ ] **AC-2** New module `src/lib/deals/api.ts` — `getDealCanvas(deal_id, client?)` returns `{deal, leads, units, activities}` partitioned by edge neighbour `node_type`. `promoteLeadToDeal({lead_id, organization_id, workspace_id, caller_id, label?})` inserts deal node + edge + audit row.
- [ ] **AC-3** New page `/dashboard/deals/[id]/page.tsx` — Server Component. Sections: header + stage timeline (forward arrows, tinted current stage), side panel (value INR, expected close date, owner), linked leads, linked units, activity stream.
- [ ] **AC-4** New action `promoteLeadToDealAction(lead_id)` in [`src/app/(dashboard)/dashboard/_actions/leads.ts`](../src/app/(dashboard)/dashboard/_actions/leads.ts) — gates on `deals:create` perm + reuses `assertLeadInTenant` (D-007 caller-org pre-check pattern).
- [ ] **AC-5** Client component `src/components/canvas/promote-to-deal-button.tsx` — `useTransition` button on the lead canvas; on success navigates to the new deal page.
- [ ] **AC-6** Tests:
  - `tests/lib/deals/transitions.test.ts` — 14+ cases covering forward / backward / from-terminal / unknown-stage.
  - `tests/lib/deals/api.test.ts` — `isDealStage` table, `getDealCanvas` happy + edge cases, `promoteLeadToDeal` happy + not_found + DB error.
- [ ] **AC-7** Existing lead-canvas page test (`tests/components/canvas/page-id.test.tsx`) updated to navigate the new wrapping `<div>` and find LeadCanvas in children.
- [ ] **AC-8** Coverage on touched files: ≥80% lines / ≥90% branches.

## Non-goals (deferred to V3.x)

- **Property + Unit canvases** (D-110 full version) — Deal canvas alone is enough for the v3 MVP sales motion.
- **Multi-lead → single-deal merge** — one promoted lead per deal for v3 MVP.
- **Cross-workspace deal reassignment** (D-122).
- **In-canvas stage transition controls** — D-321 ships a read-only canvas. Stage transitions happen elsewhere (existing dashboard widgets / future deal-edit page) and the state machine is the load-bearing enforcement.
- **React-Flow graph view** — structured panels only.
- **Auto-link units when site-visit-scheduled** — V3.x.

## Stack

- **No new runtime deps.** Reuses existing shadcn cards, Zod for `deal_data` validation in `getDealCanvas`.

## Authority

- Constitution IX — **Stacked sections, not tabs**. The deal canvas mirrors the lead canvas layout pattern.
- Constitution VIII — **Bounded permission catalog**. Reuses `deals:create` (existing in `src/lib/auth/rbac.ts`); no new perms added.
- Pattern continuity: same one-way-with-override transition shape as D-320 catalog state machine.

## Operator follow-ups (post-merge)

- [ ] Smoke test: sales_rep on a lead with state=`qualified` clicks "Promote to deal" → redirected to `/dashboard/deals/<new>`; side panel shows the promoted lead in linked leads.
- [ ] Verify `audit_log` entry: `action='deal_promoted_from_lead'` with `diff: { lead_id, deal_label }`.
- [ ] V3.x scope: full deal-edit page + property/unit canvases + auto-link units flow.
