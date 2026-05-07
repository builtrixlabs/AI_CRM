# Spec — 007-lead-lifecycle

## Acceptance criteria

### Lead create

- [ ] **AC-1** A "+ New lead" button is visible on `/dashboard` for any
      user holding `leads:create`. For `read_only` and a `channel_partner`
      without `cp:submit_lead`, the button is hidden.
- [ ] **AC-2** Clicking opens a shadcn `Dialog` titled "Create lead".
      Form fields: `phone` (text, required, min 7 chars), `source`
      (Select with options from `LEAD_SOURCES`), `email` (optional),
      `notes` (Textarea, optional).
- [ ] **AC-3** Submit calls `createLeadAction(formData)`. On success, the
      dialog closes and the page redirects to `/dashboard/leads/<new-id>`.
- [ ] **AC-4** Invalid input → server-action error returned in form
      state (Server Action returns `{ ok:false, fieldErrors }`); errors
      render inline next to each field; no DB row written.
- [ ] **AC-5** Permission denial → action returns `{ ok:false, error:
      'permission' }`; UI shows "You don't have permission to create
      leads." Dialog stays open.
- [ ] **AC-6** New lead's `state` defaults to `'new'`,
      `created_by = user.id`, `created_via = 'manual'`,
      `organization_id = user.org_id`,
      `workspace_id = user.workspace_ids[0]` (V0 — first workspace).
      `audit_log` row from D-002's `createNode` is written automatically.

### Lead edit

- [ ] **AC-7** On `/dashboard/leads/<id>`, an "Edit" button is visible
      only if the user holds `leads:edit`.
- [ ] **AC-8** Clicking "Edit" replaces the Canvas Header + Field block
      with `<EditLeadForm>` showing the same field set as create plus
      label (auto-derived from phone in create; user-editable in edit).
      Activity Stream + slot placeholders remain rendered as in view mode.
- [ ] **AC-9** "Save" calls `updateLeadAction(lead_id, formData)` →
      `updateNodeData` (D-002). Validation failure surfaces inline; on
      success, the canvas re-renders in view mode with updated values.
- [ ] **AC-10** "Cancel" reverts the form to its initial values and
      returns to view mode without persistence.

### Stage transitions

- [ ] **AC-11** A "Move to" footer panel renders below the Agent panel
      slot. The visible buttons match exactly `allowedTransitions(state)`
      from `src/lib/leads/transitions.ts`.
- [ ] **AC-12** From state `new`: 5 buttons —
      Contacted, Qualified, Lost, On hold, Junk.
      From `contacted`: 4 — Qualified, Lost, On hold, Junk.
      From `qualified`: 3 — Lost, On hold, Junk.
- [ ] **AC-13** Forward transitions (Contacted, Qualified) call
      `transitionLeadAction({ lead_id, target_state })` directly.
- [ ] **AC-14** Terminal transitions (Lost, On hold, Junk) open a
      sub-dialog asking for a reason (Textarea, required, min 1 char).
      Submit calls the action with `{ lead_id, target_state, reason }`.
- [ ] **AC-15** Each transition writes one `audit_log` row with
      `action='state_change'` and
      `diff: { from: <state>, to: <state>, reason?: <text> }`.
      `node.state` updates; `node.updated_at`, `updated_by`,
      `updated_via='manual'` set.
- [ ] **AC-16** From a terminal state (`lost`, `on_hold`, `junk`), the
      footer renders "(Terminal — reactivation in V1)" copy and zero
      action buttons.
- [ ] **AC-17** State badge in the Header re-renders the new state
      after the transition completes (Next.js revalidates the page).

### Quality gates

- [ ] **AC-18** All untagged tests pass; D-001 / D-002 / D-003 / D-004 /
      D-005 / D-006 suites still green.
- [ ] **AC-19** Coverage ≥ 80 lines / ≥ 90 branches on
      `src/lib/leads/`,
      `src/components/canvas/edit-mode.tsx`,
      `src/components/canvas/transition-footer.tsx`,
      `src/components/dashboard/new-lead-dialog.tsx`.
- [ ] **AC-20** `npm run build` ✓.

---

## Data model

**No new tables, no new columns, no migration.** D-002's `nodes` table
(with `state` column + provenance + `data jsonb`) covers everything
D-007 needs.

---

## API contracts

### `src/lib/leads/transitions.ts`

```ts
import type { LeadState } from "./types";

/** All transitions allowed in V0 (lead-only — deal lifecycle is V1). */
export const TRANSITIONS: Readonly<Record<LeadState, readonly LeadState[]>>;

export const TERMINAL_STATES: ReadonlySet<LeadState>;

export function allowedTransitions(from: LeadState): readonly LeadState[];

export function isTerminal(state: LeadState): boolean;

export class IllegalTransitionError extends Error {
  constructor(public readonly from: LeadState, public readonly to: LeadState);
}

/** Throws `IllegalTransitionError` if (from, to) is not in TRANSITIONS. */
export function assertTransitionAllowed(from: LeadState, to: LeadState): void;
```

`TRANSITIONS` constant:

```ts
{
  new:        ["contacted", "qualified", "lost", "on_hold", "junk"],
  contacted:  ["qualified", "lost", "on_hold", "junk"],
  qualified:  ["lost", "on_hold", "junk"],
  lost:       [],
  on_hold:    [],
  junk:       [],
}
```

### `src/lib/leads/types.ts`

```ts
export const LEAD_STATES = [
  "new",
  "contacted",
  "qualified",
  "lost",
  "on_hold",
  "junk",
] as const;

export type LeadState = (typeof LEAD_STATES)[number];
```

### `src/app/(dashboard)/dashboard/_actions/leads.ts`

```ts
"use server";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: "permission" | "validation" | "unknown"; fieldErrors?: Record<string, string>; message?: string };

export async function createLeadAction(formData: FormData): Promise<ActionResult<{ id: string }>>;
export async function updateLeadAction(lead_id: string, formData: FormData): Promise<ActionResult>;
export async function transitionLeadAction(formData: FormData): Promise<ActionResult>;
```

All three actions:
1. `getCurrentUser()` → 401 if null.
2. `requirePermission(user, 'leads:create' | 'leads:edit')` →
   `{ ok:false, error:'permission' }` if missing.
3. Validate FormData with the relevant Zod schema.
4. Call into `createNode` / `updateNodeData` (D-002).
5. Return `{ ok:true }` (with `id` for create).

`transitionLeadAction` additionally:
- Reads `lead_id` and `target_state` from FormData.
- Reads current state from the DB.
- Calls `assertTransitionAllowed(current, target)`; rejects with
  `{ ok:false, error:'validation', message:'illegal transition' }`.
- For terminal `target_state`, requires a `reason` field
  (≥ 1 char) — validation error if missing.
- Calls `updateNodeData` with `state: target_state` AND a synthetic
  audit row appended in the same call. Since `updateNodeData` already
  writes one audit row per call, we extend the diff to carry
  `{ from, to, reason? }` rather than the default `{ before, after }`.
  Implementation note: D-007 may add a new helper
  `transitionLead(lead_id, target_state, reason?, actor)` to
  `src/lib/leads/api.ts` that wraps `updateNodeData` with the right
  diff shape — keeps the audit format consistent.

### `src/lib/leads/api.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateLeadInput = {
  organization_id: string;
  workspace_id: string;
  created_by: string;
  data: { phone: string; source: string; email?: string; notes?: string };
  label?: string;        // defaults to phone
};

export async function createLead(
  input: CreateLeadInput,
  client?: SupabaseClient
): Promise<{ id: string }>;

export async function transitionLead(
  input: {
    lead_id: string;
    target_state: LeadState;
    actor: string;          // user.id
    reason?: string;
  },
  client?: SupabaseClient
): Promise<void>;
```

`createLead` is a thin wrapper around `createNode` that derives the
`label` (default = phone), forces `node_type='lead'`, sets state='new'.

`transitionLead` reads the current state, calls
`assertTransitionAllowed`, then calls a service-role UPDATE on the node
+ writes an audit row with the right shape. (We don't reuse
`updateNodeData` directly because it overwrites the audit diff with
`{ before, after }`; we want `{ from, to, reason }`.)

---

## UI surface

### `/dashboard` (existing, modified)

Add a "+ New lead" button (visible iff `leads:create`). Renders the
client `<NewLeadDialog>` component with a Server Action wired to
`createLeadAction`.

### `/dashboard/leads/[id]` (existing, modified)

Server page now resolves the user's permission set and passes
`canEdit: boolean` and `canTransition: boolean` to `<LeadCanvas>`.
The canvas mounts:
- `<EditModeButton>` in the Header when `canEdit`.
- `<EditLeadForm>` when in edit mode (replacing Header + FieldBlock).
- `<TransitionFooter>` after the Agent panel slot when `canTransition`.

`canEdit` and `canTransition` both gate on `leads:edit`. (Same perm in
V0; if we later split, we add `leads:transition`.)

### Components

```
src/components/dashboard/new-lead-dialog.tsx           Client dialog + form
src/components/canvas/edit-mode-button.tsx             "Edit" toggle in header
src/components/canvas/edit-lead-form.tsx               Editable Header+FieldBlock
src/components/canvas/transition-footer.tsx            Buttons row + reason sub-dialog
src/components/canvas/transition-reason-dialog.tsx     Reason textarea + submit
```

`<LeadCanvas>` gains 3 new optional props: `canEdit`, `canTransition`,
and `editLeadAction`/`transitionLeadAction` callbacks. Defaults preserve
D-006's read-only behavior; demo route stays read-only.

### shadcn primitives

Required (install if missing): `Dialog`, `Select`, `Textarea`, `Form`
(or build forms with native + shadcn `Input`/`Label`).

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | Stacked PR off `feature/006`. If D-006 changes during review, D-007 needs a rebase. | Keep D-007 surgical — it adds files, doesn't touch canvas internals. Rebase risk is low. |
| RQ-2 | `transitionLead` bypasses `updateNodeData`'s audit diff format to use `{ from, to, reason }`. Two audit-write paths now exist for nodes. | Encapsulate in `src/lib/leads/api.ts`; add an integration test asserting the diff shape end-to-end. Document in baseline 110 amendment? — No: D-007 doesn't amend baselines; the diff schema isn't fixed in a baseline. |
| RQ-3 | Sticky terminals (no reactivate). User reports "I marked junk by accident." | V0 acceptance — fix in V1 with a `reactivateLead` action gated by `leads:edit`. Document in spec. |
| RQ-4 | Cross-workspace lead creation (`workspace_ids[0]`) — for users with multiple workspaces, may not match expectation. | V0 picks first; add a workspace selector in V1. Documented. |
| RQ-5 | Server Action revalidation. After a transition, the canvas needs to re-render with the new state. | Use `revalidatePath('/dashboard/leads/${id}')` in the action. Tested in integration. |
| RQ-6 | shadcn `Dialog`/`Select`/`Textarea` install — first instance in repo. | Use the V5 `shadcn-component-install` skill (`npx shadcn add dialog select textarea`). Pin to a known-good version; verify build. |
| RQ-7 | `leads:edit` is shared across "edit fields" and "transition state". A future requirement to allow transition without field edits would need a new perm. | Document; add `leads:transition` if/when it splits. Catalog change is one literal in `rbac.ts`. |
| RQ-8 | An out-of-tenant `lead_id` in a Server Action FormData — RLS protects the SELECT but `updateNodeData` runs via service role. | The action calls `getCurrentUser` first; the lead read inside `transitionLead` runs through service-role + an explicit `organization_id = user.org_id` check. Tested in integration. |
| RQ-9 | Race condition: two reps transitioning the same lead concurrently. Last-write-wins. | Acceptable for V0. V1 may add an optimistic-concurrency `expected_state` parameter. |
| RQ-10 | A user deletes the lead row (via D-002's `softDeleteNode` from the API) while another is on the canvas. The canvas continues to show stale data. | V0: stale renders harmlessly; the next mutation fails and surfaces an error. Activity Stream Realtime delivery for `DELETE` is out of scope (D-006 only listens for INSERTs). |
