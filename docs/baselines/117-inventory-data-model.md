# Baseline 117 — RE inventory data model

**Status:** PROVISIONAL (lives under `docs/baselines/` during V4 horizon; promotes to `baseline/117-*` when V4 reaches main and the operator unblocks the baseline-write hook).
**Owner directives:** D-120 (PRD scope) → D-420 (this directive's runtime).
**Lands:** D-420 (`feat(D-420): RE inventory — project/tower/unit hierarchy + 7-state availability machine`, PR #59, commit `a395c6f`).
**Authority:** PRD v3.0 §3 P4 + §3 P8. Supersedes D-320's 4-state unit catalog where they overlap (legacy `property` rows continue to validate but new inventory is `project` + `tower` typed).

This baseline freezes the data model + state machine + permission catalog for RE inventory. Subsequent directives (D-421 customer-facing canvas, D-121 booking pipeline, D-124 bulk import) MUST conform to these contracts and MAY NOT rename node-types, redefine states, change override semantics, or weaken the cross-tenant guarantees.

---

## 1. Hierarchy

```
Organization
  └── Project           (node_type='project')
       ├── Tower        (node_type='tower';  data.project_id → project.id)
       │    └── Unit    (node_type='unit';   data.tower_id   → tower.id   [optional]
       │                                    data.project_id → project.id [required])
       │
       └── (or) Unit    plot / non-towered developments link unit → project directly
                        with data.tower_id = null
```

**Floor** is a level on each unit (`data.floor: integer`), not its own node. Floors emerge by group-by; no `node_type='floor'` exists. (Rationale: PRD §3 P8 lists project/tower/unit as canvas-eligible node types — floor is a query dimension, not an entity.)

**Legacy compatibility.** D-320 catalog rows with `node_type='property'` continue to validate. New inventory MUST use `node_type='project'`. A separate tidy-up directive (post-V4-GA) may migrate the leftover `property` rows; until then, the admin Catalog page and the admin Inventory page coexist.

---

## 2. Node-type catalog additions

```sql
-- D-420 migration: nodes.node_type CHECK extended to admit 'project' + 'tower'.
node_type IN (
  'lead','contact','deal',
  'project','tower','property',
  'unit',
  'site_visit','call','activity','document','note'
)

-- custom_views.entity_type CHECK mirrored so saved views over project / tower
-- entities are admissible.
```

`NODE_TYPES` literal in `src/lib/nodes/types.ts` MUST keep the same set. Adding or removing a type requires a follow-up amendment directive (Constitution VI).

---

## 3. Project schema (Zod, `nodes.data`)

```ts
// src/lib/nodes/schemas/project.ts
{
  name:                       string (1..200),
  city:                       string (1..100),
  address?:                   string | null (max 500),
  rera_number?:               string | null (max 100),
  possession_date_committed?: string | null (ISO-or-text, max 40),
  possession_date_revised?:   string | null (ISO-or-text, max 40),
  oc_status?:                 'not_applied' | 'applied' | 'received' | 'na' | null,
  cc_status?:                 'not_applied' | 'applied' | 'received' | 'na' | null,
  brochure_url?:              URL | null (max 2000),
  layout_url?:                URL | null (max 2000),
  notes?:                     string | null (max 2000),
  custom?:                    Record<string, unknown>   // D-112 custom-fields slot
}
.strict()
```

Lifecycle (PRD §3 P8 — Pre-launch / Launch / Construction / OC / Handover) is **NOT enforced** by D-420; the project row is stateless at the column level. Project lifecycle lands with the customer-facing project canvas (D-421+) — when it does, it MUST add states to `ALLOWED_STATES.project` in `src/lib/nodes/states.ts` (Constitution VI amendment), and the new state graph MUST live in `src/lib/inventory/project-lifecycle.ts` (pure, mirrored to a SQL graph if a transition RPC is added).

---

## 4. Tower schema (Zod, `nodes.data`)

```ts
// src/lib/nodes/schemas/tower.ts
{
  project_id:        uuid,                       // FK to nodes.id (node_type='project')
  name:              string (1..120),
  total_floors?:     integer (0..300) | null,
  units_per_floor?:  integer (0..60) | null,
  notes?:            string (max 2000) | null,
  custom?:           Record<string, unknown>
}
.strict()
```

Tower is stateless. Inherits its parent project's lifecycle. Cross-tenant guard at `createTower` time asserts the parent project is in the caller's org; if not, the call throws.

---

## 5. Unit schema (Zod, `nodes.data`)

```ts
// src/lib/nodes/schemas/unit.ts — superset of D-320 legacy + D-420 new fields
{
  // Hierarchy linkage (one of project_id or property_id required by refine)
  project_id?:           uuid,                   // D-420
  property_id?:          uuid,                   // D-320 legacy
  tower_id?:             uuid | null,            // D-420

  unit_no:               string (1..40),
  floor?:                integer (-5..300) | null,

  // Legacy D-320 fields (bounds preserved for round-trip)
  bhk?:                  integer (1..10),
  price?:                number (0..10_000_000_000),

  // D-420 metadata (PRD §3 P4 superset)
  unit_type?:            'studio' | '1bhk' | '2bhk' | '2.5bhk' | '3bhk' | '3.5bhk'
                       | '4bhk'  | '5bhk' | 'penthouse' | 'villa' | 'plot'
                       | 'commercial' | 'other',
  carpet_area_sqft?:     number (0..100_000) | null,
  builtup_area_sqft?:    number (0..100_000) | null,
  saleable_area_sqft?:   number (0..100_000) | null,
  facing?:               'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW' | null,
  view?:                 string (max 120) | null,
  corner_or_mid?:        'corner' | 'mid' | 'end' | null,
  floor_rise_factor?:    number (0..100) | null,
  base_price?:           integer (0..10_000_000_000) | null,
  price_per_sqft?:       number (0..1_000_000) | null,
  plc?:                  integer (0..10_000_000_000) | null,    // Preferred Location Charge
  parking_count?:        integer (0..20) | null,
  rera_unit_id?:         string (max 120) | null,

  custom?:               Record<string, unknown>
}
.strict()
.refine(d => Boolean(d.project_id || d.property_id),
        { message: "unit requires project_id (D-420) or property_id (D-320 legacy)" })
```

**Invariants enforced at create time** (in `src/lib/inventory/units-api.ts`):
- The referenced `project_id` row exists in the caller's organization (else throw).
- If `tower_id` set: the tower exists in the caller's organization AND `tower.data.project_id === unit.data.project_id` (else throw).

---

## 6. The 7-state availability machine

State alphabet (`INVENTORY_STATES` in `src/lib/inventory/transitions.ts`):

```
['available', 'held', 'blocked', 'booked', 'sold', 'registered', 'possessed']
```

Forward graph (`ALLOWED_FORWARD` — every state lists itself as a same-state no-op):

```
available  → held | blocked | booked          (+ available)
held       → blocked | booked | available     (+ held)            // release is forward
blocked    → booked | available               (+ blocked)         // release is forward
booked     → sold                              (+ booked)
sold       → registered                        (+ sold)
registered → possessed                         (+ registered)
possessed  → (terminal)                        (+ possessed)
```

**Backward edges** (e.g. `booked → held`, `sold → booked`, `possessed → registered`) and **non-adjacent forward jumps** (e.g. `available → sold`, `held → registered`) require `catalog:admin_override` (which is held by `org_admin`, `org_owner`, and explicit grants).

Same-state transitions are a silent no-op (returns `{ ok: true, noop: true }`).

**TTLs.**

| State | Default TTL | Set by | Reverts to |
|---|---|---|---|
| `held` | 24 hours | RPC arg `p_held_hours` (default 24) | `available` (by `expire_inventory_holds` cron) |
| `blocked` | 7 days | RPC arg `p_blocked_days` (default 7) | `available` (by `expire_inventory_holds` cron) |

Per-org TTL overrides are out of scope for V1 — `DEFAULT_HOLD_HOURS=24` and `DEFAULT_BLOCK_DAYS=7` are hardcoded constants in `src/lib/inventory/transitions.ts`. Future per-org tuning lands via `platform_flags` or a settings UI.

---

## 7. Transition contract — `transition_unit_state` RPC

```sql
-- SECURITY DEFINER, search_path = public, pg_temp
-- GRANT EXECUTE ... TO authenticated, service_role
transition_unit_state(
  p_unit_id        uuid,
  p_to_state       text,
  p_actor_id       uuid,
  p_actor_role     text,
  p_reason         text DEFAULT NULL,
  p_has_override   boolean DEFAULT false,
  p_held_hours     integer DEFAULT 24,
  p_blocked_days   integer DEFAULT 7
) RETURNS jsonb
```

**Semantics (must hold for every implementation):**

1. **Row lock.** `SELECT … FROM nodes WHERE id = p_unit_id AND node_type='unit' AND deleted_at IS NULL FOR UPDATE`. Concurrent transitions on the same unit serialize at the DB level — first transaction wins, the losing one observes the new state and (typically) returns `illegal_transition`.
2. **Cross-tenant guard.** If the caller is not `super_admin` and `app_org_id() <> row.organization_id`, return `{ ok: false, error: 'cross_tenant' }` without mutating.
3. **Idempotent same-state.** If `from = p_to_state`, return `{ ok: true, new_state, noop: true }` without writing audit_log.
4. **Graph validation.** Use the inlined forward graph (mirrored from `ALLOWED_FORWARD` in TS). If the target isn't in the source's forward set AND `p_has_override = false`, return:
   - `{ ok: false, error: 'backward_no_override' }` when `to → from` is a forward edge (backward case)
   - `{ ok: false, error: 'illegal_transition' }` otherwise (non-adjacent forward)
5. **TTL computation.** Set `state_expires_at = now() + (p_held_hours hours)` for `held`; `now() + (p_blocked_days days)` for `blocked`; clear (`NULL`) for everything else.
6. **Mutation.** Update `state`, `state_expires_at`, `updated_at`, `updated_by`, `updated_via='manual'`.
7. **Audit row.** INSERT one `audit_log` with `action='unit_state_transition'`, `actor_id=p_actor_id`, `actor_role=p_actor_role`, `organization_id=row.organization_id`, `table_name='nodes'`, `record_id=p_unit_id`, `diff={from, to, reason, override, state_expires_at}`.
8. **Return.** `{ ok: true, new_state, from_state, state_expires_at }`.

**Error envelope** (always `jsonb`, never SQL exceptions):
```
{ ok: false, error: 'unknown_state' | 'not_found' | 'cross_tenant'
                  | 'illegal_transition' | 'backward_no_override' }
```

The TS wrapper at `src/lib/inventory/state-api.ts::transitionUnitState` is the canonical caller. Convenience functions `holdUnit / blockUnit / bookUnit / markSold / markRegistered / markPossessed / releaseUnit` MUST set `p_to_state` to the corresponding state and pass `has_override` through unchanged.

---

## 8. Hold-expiry contract — `expire_inventory_holds` RPC

```sql
-- SECURITY DEFINER, search_path = public, pg_temp
-- GRANT EXECUTE ... TO service_role ONLY (revoked from authenticated + anon)
expire_inventory_holds(p_limit integer DEFAULT 500) RETURNS integer
```

**Semantics:**

1. `SELECT … FOR UPDATE SKIP LOCKED LIMIT p_limit` over rows where `node_type='unit' AND state IN ('held','blocked') AND state_expires_at IS NOT NULL AND state_expires_at < now() AND deleted_at IS NULL`, ordered by `state_expires_at ASC` (oldest expired first).
2. For each row: set `state='available'`, `state_expires_at=NULL`, `updated_at=now()`, `updated_by='00000000-…'` (system UUID), `updated_via='system'`.
3. Append one `audit_log` row per revert with `action='unit_hold_expired'`, `actor_type='system'`, `actor_role='inventory_hold_expiry_cron'`, `diff={from, to:'available', expired_at}`.
4. Return integer count of expired rows.

**Caller.** Hourly Inngest cron at `src/lib/inngest/functions/inventory-expire-holds.ts` (id `inventory-expire-holds`, trigger `{ cron: "0 * * * *" }`). The cron MUST use the service-role Supabase client; calling from any other path returns `permission denied` because `authenticated` and `anon` lack EXECUTE.

Cadence change is a one-line edit. If customer experience demands tighter than hourly, that's a config decision, not a contract change.

---

## 9. Permission catalog

D-420 adds six permissions in `src/lib/auth/rbac.ts`:

| Permission | Granted to |
|---|---|
| `inventory:hold` | `sales_rep`, `manager`, `workspace_admin`, `org_admin`, `org_owner` |
| `inventory:block` | `manager`, `workspace_admin`, `org_admin`, `org_owner` |
| `inventory:book` | `workspace_admin`, `org_admin`, `org_owner` |
| `inventory:sell` | `workspace_admin`, `org_admin`, `org_owner` |
| `inventory:register` | `workspace_admin`, `org_admin`, `org_owner` |
| `inventory:possess` | `workspace_admin`, `org_admin`, `org_owner` |

Existing perms re-used:
- `properties:view` — gates `/admin/inventory` + child pages.
- `properties:create` — gates project + tower creation forms.
- `units:create` — gates unit creation form.
- `properties:release` — gates the `→ available` transition from `held`/`blocked`.
- `catalog:admin_override` — required for backward + non-adjacent forward transitions. Belt-and-suspenders: the RPC also rejects when `p_has_override=false` and the transition isn't in the forward set.

**Permission gating order** (Constitution VIII bounded catalog):

1. Server action / API handler verifies the caller holds the right perm. Reject with `{ ok: false, error: 'permission' }` before even calling the RPC.
2. RPC enforces the *graph* (`p_has_override` must match the perm gate above).
3. RLS on `audit_log` rejects writes from any client that isn't service-role; the RPC's `SECURITY DEFINER` runs as the function-owner role which has the audit-write grant.

---

## 10. Audit log shape

```jsonb
-- audit_log row written by transition_unit_state RPC
{
  actor_id:         <p_actor_id>,
  actor_type:       'user',
  actor_role:       <p_actor_role>,
  organization_id:  <row.organization_id>,
  table_name:       'nodes',
  record_id:        <unit_id>,
  action:           'unit_state_transition',
  diff: {
    from:             '<source state>',
    to:               '<target state>',
    reason:           '<p_reason or null>',
    override:         <p_has_override>,
    state_expires_at: '<ISO timestamp or null>'
  }
}

-- audit_log row written by expire_inventory_holds RPC
{
  actor_id:         '00000000-0000-0000-0000-000000000000',
  actor_type:       'system',
  actor_role:       'inventory_hold_expiry_cron',
  organization_id:  <row.organization_id>,
  table_name:       'nodes',
  record_id:        <unit_id>,
  action:           'unit_hold_expired',
  diff: {
    from:       '<held | blocked>',
    to:         'available',
    expired_at: '<original state_expires_at>'
  }
}
```

Constitution IV (append-only). No UPDATE/DELETE policies on `audit_log`. Revisions are new rows with `supersedes` pointing to the prior id.

---

## 11. Migrations of record

| File | Date applied | Adds |
|---|---|---|
| [`20260511190000_re_inventory.sql`](../../supabase/migrations/20260511190000_re_inventory.sql) | 2026-05-11 ✓ | `nodes.node_type` CHECK adds `project` + `tower`; `custom_views.entity_type` mirrored; `nodes.state_expires_at timestamptz` + partial index; `transition_unit_state` + `expire_inventory_holds` RPCs |
| [`20260511191000_re_inventory_revoke_authenticated.sql`](../../supabase/migrations/20260511191000_re_inventory_revoke_authenticated.sql) | 2026-05-11 ✓ | Explicit `REVOKE EXECUTE ON expire_inventory_holds FROM authenticated, anon` |

Verification script: [`scripts/verify_d420.mjs`](../../scripts/verify_d420.mjs) — 12 independent checks, all PASS on live.

---

## 12. Conformance checklist for follow-up directives

Any directive that touches inventory MUST:

- [ ] Use `INVENTORY_STATES` (TS) and the inlined SQL graph (RPC) — never hardcode the state alphabet or the forward edges anywhere else.
- [ ] Call `transition_unit_state` for any unit-state change. Direct UPDATEs to `nodes.state` for `node_type='unit'` are forbidden outside the RPC.
- [ ] Cross-tenant guard every read/write by `organization_id` (Constitution II).
- [ ] Stamp `created_by` / `updated_by` / `created_via` / `updated_via` on every write (Constitution III).
- [ ] Add new permissions to `PERMISSIONS` in `rbac.ts` explicitly (Constitution VIII bounded catalog). Never silently widen.
- [ ] Update this baseline if the contract changes — bump version, add changelog entry, link the amending directive.

---

## 13. Out-of-scope (deferred to later directives)

- **Customer-facing project / tower / unit canvases** — D-421+.
- **Project state machine** (Pre-launch / Launch / Construction / OC / Handover) — D-421+.
- **Bulk CSV inventory import** — D-124.
- **Per-org TTL overrides** — V2 (via platform_flags or settings UI).
- **Demand-letter generation on `booked → sold`** — D-121 (booking pipeline owns demand letters).
- **Voice IQ inventory hooks** (DOE directive D-23 "auto-update project dashboard tile on Sold") — DOE engine owns side-effects; baseline 117 emits the audit row, downstream listeners react.
- **Brochure / floor-plan storage upload UI** — surfaces with the customer-facing canvas in D-421.
- **`property` → `project` row migration / type rename** — post-V4-GA tidy-up directive; until then both are admissible.

---

## 14. Promotion to `baseline/117-*`

This file lives at `docs/baselines/117-inventory-data-model.md` while the V4 horizon is open. Promotion to `baseline/117-inventory-data-model.md` (the hook-protected location) requires:

1. V4 → main merge.
2. Operator authorization to unblock the baseline-write hook (or operator-authored direct copy).
3. No outstanding amendments — every follow-up directive (D-421, D-124) that changes a contract here MUST update this doc first, with the change applied to `baseline/117-*` simultaneously at promotion time.
