# Tasks — 007-lead-lifecycle

Ordered for TDD execution. Estimated working sessions: **4-5**.

---

## Group A — library (state machine + api helpers)

### A1. [setup] Install shadcn Select + Textarea

- `npx shadcn add select textarea` (Dialog already in repo from D-001).
- Verify `npm run build` still passes.

### A2. [unit] LEAD_STATES + LeadState type

- `src/lib/leads/types.ts` — `LEAD_STATES` literal-of-6, `LeadState` derived.
- Test asserts the catalog matches `ALLOWED_STATES.lead` from D-002's
  `src/lib/nodes/states.ts` (no drift).

### A3. [unit] State machine

- `src/lib/leads/transitions.ts` — `TRANSITIONS` graph,
  `TERMINAL_STATES`, `allowedTransitions`, `isTerminal`,
  `assertTransitionAllowed`, `IllegalTransitionError`.
- Tests: 9 allowed transitions explicitly; terminals have empty allowed
  set; assertTransitionAllowed throws on illegal pair; matrix test of
  all 6×6 = 36 (from, to) pairs.

### A4. [unit] Zod payload schemas

- `src/lib/leads/schemas.ts` —
  `createLeadInputSchema`, `updateLeadInputSchema`,
  `transitionInputSchema` (with `.superRefine` requiring `reason`
  iff target ∈ TERMINAL_STATES).
- Tests: each schema accepts a valid payload; rejects bad shape;
  transition schema enforces reason requirement.

### A5. [unit] createLead helper

- `src/lib/leads/api.ts` `createLead` — wraps D-002's `createNode` with
  `node_type='lead'`, `state='new'`, `label = label ?? phone`.
- Test (mock supabase): happy path; label defaults to phone when not
  given; created_by + created_via plumb through; one audit row.

### A6. [unit] transitionLead helper

- `src/lib/leads/api.ts` `transitionLead` — reads current state,
  asserts transition allowed, runs `UPDATE nodes SET state, updated_*`,
  inserts one audit row with `action='state_change'` +
  `diff: { from, to, reason? }`.
- Tests (mock supabase): happy forward path; happy terminal-with-reason;
  IllegalTransitionError on bad (from, to); cross-tenant rejection
  (returns null when service-role read can't find the lead in the
  caller's org).

### Commit checkpoint A

- [ ] `npm run test` ✓; `npm run build` ✓.
- [ ] Commit: `feat(leads): state machine + create/transition helpers (D-007 group A)`

---

## Group B — server actions

### B1. [unit] createLeadAction

- 401 unauth → returns `{ ok:false, error:'permission' }`.
- Missing `leads:create` → `{ ok:false, error:'permission' }`.
- Bad input → `{ ok:false, error:'validation', fieldErrors }`.
- Happy path → `{ ok:true, data:{ id } }` + redirect responsibility
  documented (action returns id; UI does the redirect).

### B2. [unit] updateLeadAction

- 401 / 403 / 422 / 200 paths covered. Cross-tenant lead_id (forged) →
  service-role lookup confirms lead exists in user's org; if not, 403.

### B3. [unit] transitionLeadAction

- Forward transition (no reason) → 200.
- Terminal transition with reason → 200.
- Terminal transition without reason → 422.
- Illegal transition → 422.
- Cross-tenant lead_id → 403.

### Commit checkpoint B

- [ ] All B tests pass.
- [ ] Commit: `feat(leads): server actions for create/edit/transition (D-007 group B)`

---

## Group C — UI components

### C1. [unit] transition-reason-dialog

- Renders Textarea + Submit. Empty input rejected (form validation).
  On submit: calls action with `{ lead_id, target_state, reason }`.

### C2. [unit] transition-footer

- For each lead state, renders the right button set
  (`allowedTransitions`).
- Forward button click → calls action directly.
- Terminal button click → opens `<TransitionReasonDialog>`.
- Terminal-state lead → footer shows "(Terminal — reactivation in V1)".

### C3. [unit] edit-lead-form

- Initial values reflect `lead.label` + `lead.data`.
- Cancel reverts to view (parent toggles).
- Submit calls `updateLeadAction`; field errors surface inline.

### C4. [unit] edit-mode-button

- Renders only when `canEdit`. Click toggles parent state.

### C5. [unit] new-lead-dialog

- Trigger button + Dialog open/close.
- Submit valid form → action called with FormData; on success closes;
  on validation error keeps open + renders inline.
- Permission failure → renders "permission denied" banner.

### C6. [unit] lead-canvas-extras

- Default props (canEdit=false, canTransition=false) → no edit button,
  no footer (D-006 read-only behavior preserved).
- canEdit=true + viewing → edit button visible; clicking enters edit
  mode; pressing cancel returns to view.
- canTransition=true → footer rendered with the right buttons.
- Demo route uses defaults → no extras.

### Commit checkpoint C

- [ ] All C tests pass.
- [ ] Commit: `feat(canvas): edit mode + transition footer + new-lead dialog (D-007 group C)`

---

## Group D — page wiring + integration + e2e + memory

### D1. [page] /dashboard add "+ New lead"

- `src/app/(dashboard)/dashboard/page.tsx` — gate on `leads:create`
  (resolve via getCurrentUser + permissions resolver). Render
  `<NewLeadDialog>` button.

### D2. [page] /dashboard/leads/[id] pass canEdit / canTransition

- `src/app/(dashboard)/dashboard/leads/[id]/page.tsx` — resolve user
  perms; pass `canEdit` and `canTransition` (both = `leads:edit`).

### D3. [integration] full lead lifecycle against real DB

- `tests/integration/lead-create-edit-transition.test.ts` —
  seed sales_rep in workspace W; createLead → assert nodes row +
  audit_log row (`action='node_create'`); updateLead → assert
  nodes.data updated + audit (`action='node_update'`); transitionLead
  new→contacted → contacted→qualified → qualified→lost(reason)
  → assert state + 3 audit rows with `action='state_change'` and the
  right diff shapes; cross-tenant rep cannot transition.

### D4. [e2e@smoke] lead-create-flow

- Sign in as a seeded sales_rep; from /dashboard click "+ New lead";
  fill phone + source; submit; land on `/dashboard/leads/<id>` with
  state badge "new"; demo banner not present.

### D5. [e2e@smoke] lead-edit-and-transition

- Sign in; navigate to a seeded lead in state 'new'; click Edit;
  change notes; Save; click "Mark contacted"; state badge shows
  "contacted"; click "Mark lost"; reason dialog opens; submit reason;
  footer shows terminal copy.

### D6. [doc] memory updates

- `memory/decisions.md` — D-007.1..D-007.x entries:
  - State machine in TS, not DB CHECK (same precedent as D-002)
  - `transitionLead` separate from `updateNodeData` (different audit
    diff shape)
  - Sticky terminals in V0; reactivate is V1
  - Per-field inline editing deferred (V1); whole-canvas edit-mode toggle
  - Stacked PR off feature/006 while D-006 PR is open
- `memory/learned/ai-crm/patterns.md`:
  - `state-machine-as-pure-record` (TRANSITIONS as Readonly<Record<S, S[]>>)
  - `server-action-result-discriminated-union` (ActionResult shape)
  - `terminal-transition-requires-reason` (superRefine pattern)
  - `whole-canvas-edit-mode-toggle` (vs per-field inline)

### D7. [verify] V5 Gate 4

- `npm run test`, `npm run test:integration`, `npm run test:smoke`,
  `npm run build`. Coverage report ≥ 80 / ≥ 90.

### D8. [security] Gate 4 scan

- security-scanner agent against the new files.

### D9. [deploy] preview

- Push triggers Vercel; existing env covers D-007.

### D10. [merge] PR

- `gh pr create --base feature/006-intelligent-canvas --head feature/007-lead-lifecycle`
  (stacked). Once D-006 merges to v1, retarget D-007's PR base → v1
  and rebase if needed.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(leads): state machine + create/transition helpers (D-007 group A)` |
| B | `feat(leads): server actions for create/edit/transition (D-007 group B)` |
| C | `feat(canvas): edit mode + transition footer + new-lead dialog (D-007 group C)` |
| D | `feat(leads): page wiring + integration tests + decisions/patterns (D-007 group D)` |

Final PR title: `feat: D-007 lead lifecycle (create + edit + 9 transitions)`

---

## Reviewer questions for Plan Mode

1. **Lead-only scope.** D-007 ships 9 transitions on the lead node only.
   Deal canvas + deal-side transitions (site_visit_scheduled →
   site_visit_done → negotiation → booked) are V1. OK?
2. **Sticky terminals in V0.** Lost / on_hold / junk are dead-ends
   until V1. OK?
3. **`transitionLead` is separate from D-002's `updateNodeData`** because
   the audit diff shape differs (`{from, to, reason}` vs
   `{before, after}`). Two paths now exist for `nodes` mutations.
   Acceptable, or should we fold transitions into a richer
   `updateNodeData` signature?
4. **Whole-canvas edit-mode toggle** vs per-field inline. V0 ships the
   toggle; per-field is V1. OK?
5. **Stacked PR off feature/006.** D-006 PR #6 is still OPEN. D-007's PR
   targets `feature/006-intelligent-canvas` until D-006 merges; then
   we rebase + retarget to v1. OK?
6. **shadcn install: Select + Textarea.** Dialog is already present.
   First Select / Textarea instances. OK?
7. **`leads:edit` covers both field-edit and state-transitions.** If we
   later want transitions without field edits (e.g., for a
   workspace_admin to override), we'd add a `leads:transition` perm.
   Acceptable for now?
8. **Terminal transitions require a reason; forward transitions don't.**
   RERA-friendly audit. OK or should ALL transitions require a reason?
9. **State machine in pure TS** (`src/lib/leads/transitions.ts`),
   not a DB CHECK. Same trade-off as D-002. OK?
10. **No "promote to deal" at qualified.** Forward transitions from
    qualified are terminal-only in V0. The promotion flow is V1.
