# Directive 007 — Lead lifecycle on Canvas (create + edit + transitions)

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §4 D-007 + docs/PRD.md §8 + Constitution I, III, IV, IX
**Authority:** memory/constitution.md (Principles I tier-bounded, III provenance, IV audit, IX no-tabs)
**Builds on:** D-001 (RLS + middleware), D-002 (nodes API + leadSchema), D-003 (RBAC), D-006 (Lead canvas)
**Stack:** branched off `feature/006-intelligent-canvas` while D-006 PR is open. Will rebase to `v1` after D-006 merges.

---

## Problem

D-006 ships the **read-only** Lead canvas. There's no way to actually
create, edit, or progress a lead through the pipeline yet — `/dashboard`
has a "View demo lead canvas" link and the `/dashboard/leads/[id]` route
404s for everyone because no real leads exist.

D-007 makes the lead canvas **operational**:

1. **Create** — a "+ New lead" entrypoint on `/dashboard` opens a dialog
   that captures the minimum lead fields (phone + source, with optional
   email + notes), validates against `leadSchema` (D-002), and creates a
   `node_type='lead'` row via `createNode` in `state='new'`. Redirects to
   the new lead's canvas. RBAC-gated by `leads:create`.
2. **Edit** — the canvas gains an "Edit" toggle that swaps the Header
   and Field block for editable inputs. "Save" validates with `leadSchema`
   and calls `updateNodeData`. RBAC-gated by `leads:edit`.
3. **Stage transitions** — a footer panel on the canvas surfaces the
   allowed next states given the current state, per a pure state machine
   in `src/lib/leads/transitions.ts`. Each transition writes one
   `audit_log` row via `updateNodeData` with the diff
   `{ from: <state>, to: <state> }`. Terminal transitions (lost / on_hold
   / junk) include a free-form `reason` field captured in the audit row.
4. **Provenance** — every write sets `updated_by`, `updated_via='manual'`.
   Created leads carry `created_by`, `created_via='manual'`, and the
   `source` field as user-declared lead origin (NOT to be confused with
   provenance — `source` is a domain field on the lead's `data`).

**State machine (V0 lead-only):**

```
new        → contacted, qualified, lost, on_hold, junk
contacted  → qualified,            lost, on_hold, junk
qualified  →                       lost, on_hold, junk   (deal promotion is V1)
lost       → (terminal, sticky in V0)
on_hold    → (terminal, sticky in V0)
junk       → (terminal, sticky in V0)
```

Total: **9 active transitions** + 0 reactivations (V0 keeps terminals
sticky; V1 ships "Reactivate to new"). The install-plan §4 prompt's
"all 7 stage transitions" reading included Site Visit Scheduled / Done /
Negotiation / Booked — those are **deal** states (PRD §8.2) and ship
with the **Deal canvas in V1**. D-007 explicitly stays inside the lead
node's lifecycle.

---

## Success criteria

### Create

- [ ] Authenticated sales_rep / manager / org_admin in workspace W sees a
      "+ New lead" button on `/dashboard`. Other roles (read_only,
      channel_partner — without `cp:submit_lead`) do not.
- [ ] Clicking opens a shadcn `Dialog` with: phone (required), source
      (required, Select of `LEAD_SOURCES`), email (optional), notes
      (optional). Submit triggers a Server Action.
- [ ] Server Action validates with `leadSchema`, calls `createNode`
      with `organization_id=user.org_id`, `workspace_id=user.workspace_ids[0]`,
      `node_type='lead'`, `state='new'`, `created_by=user.id`,
      `created_via='manual'`. The dialog closes; the page redirects to
      `/dashboard/leads/<new-id>`.
- [ ] On validation failure, errors render inline next to each field;
      no DB write attempted; dialog stays open.
- [ ] On RBAC failure (forged request without `leads:create`), action
      returns a typed error and the UI shows a "permission denied" inline.

### Edit

- [ ] On `/dashboard/leads/<id>`, an "Edit" button is visible only when
      the user holds `leads:edit` (and is in the lead's tenant per RLS).
- [ ] Clicking "Edit" switches the Canvas Header and Field block into
      input mode (read-only otherwise). "Save" / "Cancel" buttons appear.
- [ ] "Save" runs `leadSchema` against the merged payload, calls
      `updateNodeData` (D-002), writes one `audit_log` row, returns to
      view mode. "Cancel" reverts without persistence.
- [ ] Activity Stream + slot placeholders are not affected by edit mode.

### Transitions

- [ ] A "Move to" footer panel renders on the Canvas. The buttons shown
      are exactly `allowedTransitions(state)` from `src/lib/leads/transitions.ts`.
- [ ] Clicking a forward transition (`→ contacted`, `→ qualified`)
      calls `transitionLeadAction` which updates state, writes one
      `audit_log` row with `action='state_change'` and
      `diff: { from, to }`.
- [ ] Clicking a terminal transition (`→ lost`, `→ on_hold`, `→ junk`)
      opens a sub-dialog asking for a reason; submit calls the action
      with `reason` included in the audit row.
- [ ] Terminal-state leads show "(terminal)" copy in place of the footer;
      no buttons. (Reactivate is V1.)
- [ ] State badge in the Header re-renders the new state immediately on
      success.

### Audit + provenance

- [ ] Every create writes `audit_log` row `action='node_create'` (already
      from D-002's `createNode`) — verified by an integration test.
- [ ] Every edit writes `action='node_update'` with `diff: { before, after }`.
- [ ] Every state transition writes `action='state_change'` with
      `diff: { from, to, reason? }`. The `reason` is required iff the
      transition is to a terminal.
- [ ] Provenance: `updated_by` = current user; `updated_via='manual'`.

### Quality gates

- [ ] All untagged tests pass; D-001 / D-002 / D-003 / D-004 / D-005 /
      D-006 suites still green.
- [ ] Coverage ≥ 80 lines / ≥ 90 branches on `src/lib/leads/`,
      `src/components/canvas/edit-mode.tsx`,
      `src/components/canvas/transition-footer.tsx`,
      `src/components/dashboard/new-lead-dialog.tsx`.
- [ ] `npm run build` ✓.

---

## Constraints

- **Constitution I (bounded authority).** The transition action is
  `leads:edit` for sales_rep+. There is no agent path in D-007 — agents
  performing transitions land in D-009 (Lead Enrichment Agent T1).
- **Constitution III + IV.** Every write goes through D-002's helpers
  (`createNode`, `updateNodeData`) — they own the audit + provenance
  contract. D-007 NEVER touches `audit_log` directly and NEVER bypasses
  the Zod validation in `nodeSchemaFor('lead')`.
- **Constitution IX (no tabs).** Edit mode and the transition footer
  use the same stacked-section paradigm; "Edit" is a state toggle,
  not a tab. The new-lead dialog is a standard modal — modals are not
  tabs.
- **Constitution II (tenant isolation).** The new-lead Server Action
  reads org_id + workspace_id from `getCurrentUser` — never from the
  form. RLS guarantees `leads:create` against the wrong workspace
  fails.
- **Stack discipline (Constitution VII).** shadcn primitives only
  (Dialog, Select, Textarea, Button — install Dialog/Select/Textarea
  if missing). No new motion lib (Framer Motion already locked in D-006).
  No new test deps; RTL + jsdom from D-006 setup.
- **TDD per task** (V5 D-06): RED test → minimal impl → REFACTOR.
- **No deal canvas, no deal creation in D-007.** "Promote to deal" at
  `qualified` state is a follow-up directive (D-007.5 or part of D-008).

---

## Out of scope (explicit non-goals)

- **Deal canvas** (V1).
- **Deal lifecycle transitions** (site_visit_scheduled, site_visit_done,
  negotiation, booked) — deal-side lifecycle, V1.
- **Promote-to-deal** action at qualified state — V1 follow-up.
- **Reactivate from terminal** (lost / on_hold / junk → new) — V1.
- **Soft-delete UI** — `softDeleteNode` exists in D-002 but no UI surface
  in D-007. Deletion is `leads:delete` (workspace_admin+) and lands in
  a future cleanup directive.
- **Bulk lead operations** (CSV import, mass status change) — D-014
  hardening or later. `leads:bulk_import` exists in rbac but no UI.
- **Lead reassignment between reps / workspaces** — `leads:assign` is
  manager+; UI is V1.
- **Cmd+K creation flow** — D-008.
- **Custom fields engine** — D-112.
- **Pipeline stage editor** (renaming / reordering stages) — V0 ships the
  fixed lead state machine. Customisation lands with the L3 customisation
  engine (V2 per Constitution XI).
- **Activity logging on edit** — D-007 records the edit in `audit_log`,
  but does NOT also create an activity-typed node. Activity nodes come
  from inbound channels (D-010 WhatsApp, D-013 Call Audit) and from
  agents (D-009).
- **Optimistic UI** — V0 ships server-action redirects + revalidation;
  optimistic state for transitions is V1.
- **Lead detail surface for super_admin** — RLS hides operational data
  from platform tier (D-001.12). super_admin viewing a lead is forbidden.

---

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md`:

- **node-data-as-jsonb-with-zod-validation** — Server Actions validate
  payloads with `leadSchema.safeParse` before calling D-002 helpers.
- **provenance-as-not-null-columns** — `createNode` / `updateNodeData`
  enforce; D-007 just supplies the right `created_by` / `updated_by`.
- **tenant-isolation-via-jwt-claim** — Server Actions read tenant from
  `getCurrentUser`; RLS scopes the SELECT side as well.
- **belt-and-suspenders-platform-only** — `leads:*` is operational, not
  platform-only. PLATFORM_ONLY rejection still runs at the resolver
  layer (no leakage on misconfigured overrides).
- **cached-resolver-set-per-request** — Server Actions resolve the
  effective permission set once, pass it to every gate (`requirePermission`).
- **provisioning-with-manual-rollback** — N/A here (single insert per
  action).
- **edge-middleware-as-routing-policy** — already enforces
  `/dashboard/*` reachability; D-007 adds NO new middleware seams.
- **single-dispatcher-server-action** — applied for the transition
  action: one `transitionLeadAction(formData)` reads the target state +
  reason from FormData.
- **slot-contract-with-empty-state-default** (D-006) — the canvas's
  Suggested-action slot remains untouched; D-007 doesn't populate it.
- **stacked-sections-with-motion** (D-006) — the new transition footer
  is a sixth stacked section below Agent panel, motion-aware.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/007-lead-lifecycle/`.
- Estimate: **L** — ~12 new files (server actions, state machine,
  dialog, edit-mode component, transition footer, page wiring, tests).
  No migration. ~25 unit tests, ~3 integration, ~3 Playwright @smoke.
  4-6 sessions.
- Reviewer should confirm:
  1. **Lead-only scope.** Deal canvas + deal-side transitions are V1.
     D-007 ships 9 transitions on the lead node only.
  2. **Branched off feature/006 (stacked PR).** D-006's PR #6 is still
     open. D-007 will target `feature/006-intelligent-canvas` until
     D-006 merges to `v1`, then rebase + retarget.
  3. **No "promote to deal" in V0.** Once a lead reaches `qualified`,
     forward transitions to terminal-only (lost/on_hold/junk). The deal
     creation flow comes later. OK?
  4. **Sticky terminals** (lost / on_hold / junk are dead-ends in V0). OK?
  5. **`source` field as a domain attribute, not provenance.** The lead's
     `data.source` (LEAD_SOURCES) tracks which marketplace originated
     the lead (magicbricks, 99acres, walkin, ...). Provenance
     `created_via` is "manual" because a sales_rep typed the entry
     into the dialog. Two distinct concepts, both recorded.
  6. **Transition-reason required for terminals only.** Forward
     transitions don't require a reason; terminal transitions do
     (RERA-friendly audit).
  7. **Edit mode toggles the entire canvas, not per-field inline.**
     V0 simplification — one "Edit" button at the top, the Header +
     Field block become editable. Per-field inline editing is V1.
  8. **shadcn primitives to install** — Dialog, Select, Textarea (if
     not already present). Run `npx shadcn add` per V5 skill. OK?
  9. **State machine in pure TS** (`src/lib/leads/transitions.ts`).
     No DB CHECK constraint enforcing the state graph — same trade-off
     as D-002's "states.ts is the source of truth". OK?
