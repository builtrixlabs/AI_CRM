# Directive 420 — RE Inventory (Project/Tower/Floor/Unit hierarchy + 7-state availability machine)

**Kind:** feature (V4 / PRD v3.0 D-120)
**Status:** AUTHORIZED — operator approved 2026-05-11 ("Phase A internal work: D-420 — biggest single piece of customer value left in Phase A")
**Branch target:** `v4`
**Source:** `docs/PRD-v3.0.md` §3 P4 + §3 P8 + §4 D-120; `docs/plans/v4-plan-v1.md` Phase A4
**Builds on:** D-002 (nodes / graph), D-007 (lead state-machine pattern), D-018 (audit log shape), D-320 (existing property/unit catalog + 4-state machine), D-413 (list-page-as-engine-host pattern)

---

## Problem

PRD v3.0 §3 P4 declares RE inventory **non-negotiable and missing entirely from horizontal CRMs**. The pre-V4 codebase ships a flat catalog (Property → Unit) with a 4-state lifecycle (`available → held → booked → sold`) — that's the D-320 slice. PRD v3.0 mandates:

1. **Full Project / Tower / Floor / Unit hierarchy.** Builders sell at the tower level; managers operate at the project level. A flat property has no place for tower-specific PLC, view, facing, or floor-rise pricing — the dimensions a buyer actually picks on.
2. **A 7-state unit availability machine** with explicit Held/Blocked TTLs and override semantics:
   ```
   Available → Held (reversible, ~24h TTL)
            → Blocked (rep-confirmed soft block, ~7d TTL)
            → Booked (token paid; irreversible without manager override)
            → Sold (sale agreement signed)
            → Registered (sale deed registered)
            → Possessed (handover complete)
   ```
3. **Concurrent booking attempts serialized at DB level** — two reps booking the same unit must not both succeed.
4. **Project + Unit metadata** (RERA, possession-date committed+revised, OC/CC, unit type, carpet/built-up/saleable, facing, view, floor-rise factor, base price, ₹/sqft, PLC, parking, RERA-unit-id).

D-420 ships **entirely internal** — no external service deps, no operator §10 decision blocking, no third-party credentials. Customer-facing Project / Unit canvases (PRD §3 P8) are deferred — admin pages plus the existing dashboards list surface (extended via D-413) are sufficient for the V1-acceptance gate ("≥ 1 customer with full project inventory loaded").

D-420 lands:

1. **Migration** — extend `nodes.node_type` CHECK to include `project` and `tower`; extend `custom_views.entity_type` to match. Add `nodes.state_expires_at` (TTL for held/blocked). Two RPCs: `transition_unit_state(...)` (row-lock + transition graph + audit) and `expire_inventory_holds()` (cron-callable; reverts expired held/blocked → available).
2. **State-machine module** at `src/lib/inventory/transitions.ts` — pure functions, 7 states, allowed-transitions graph, override-required predicate, typed error class. Same shape as D-007 (lead) and D-320 (4-state unit).
3. **Inventory lib** at `src/lib/inventory/` — typed CRUD for project/tower/unit with full PRD §3 P4 metadata fields, plus state-transition wrappers (`holdUnit`, `blockUnit`, `bookUnit`, `markSold`, `markRegistered`, `markPossessed`, `releaseUnit`).
4. **Permission catalog extension** — 6 new perms (`inventory:hold`, `inventory:block`, `inventory:book`, `inventory:sell`, `inventory:register`, `inventory:possess`) wired into existing role-permission maps. `catalog:admin_override` continues to gate backward / non-adjacent forward transitions.
5. **Admin UI extension** — `/admin/catalog/[id]` gains a "Towers" panel (list + create); each unit row gets the 7-state badge + a transition action dropdown gated on the perm matrix. Hold/block-eligible units surface their `state_expires_at` countdown.
6. **Tests** — pure state-machine, transition RPC (happy path + override + concurrent lock), TTL expiry, lib helpers, admin UI smoke.
7. **Cron wiring** — Inngest function `inventory.expireHolds` runs hourly; calls `expire_inventory_holds()` RPC.

Customer-facing Project / Unit canvases, RERA registry import, brochure/floor-plan storage UI, and demand-letter integration (D-121's surface) are all separate follow-up directives importing D-420's primitives.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Migration `<ts>_re_inventory.sql` (additive only):
  - **`nodes.node_type` CHECK extended** to include `'project'` and `'tower'` (drop + recreate constraint; idempotent via `DO $$ ... $$` block guard).
  - **`custom_views.entity_type` CHECK extended** to include `'project'` and `'tower'` (drop + recreate constraint).
  - **`nodes.state_expires_at timestamptz NULL`** — TTL for `held`/`blocked` unit states. Indexed via partial index `(state_expires_at) WHERE state_expires_at IS NOT NULL AND deleted_at IS NULL`.
  - **RPC `transition_unit_state(p_unit_id uuid, p_to_state text, p_actor_id uuid, p_actor_role text, p_reason text, p_has_override boolean, p_held_hours integer DEFAULT 24, p_blocked_days integer DEFAULT 7) RETURNS jsonb`**:
    - `SECURITY DEFINER`, `SET search_path = public, pg_temp`.
    - `SELECT … FROM nodes WHERE id = p_unit_id AND organization_id = app_org_id() AND node_type = 'unit' AND deleted_at IS NULL FOR UPDATE` — row lock for the duration of the transition.
    - Asserts transition allowed via inlined SQL graph (mirrors the JS state machine).
    - If `to_state IN ('held','blocked')` → sets `state_expires_at = now() + interval` (hours for held, days for blocked).
    - If transitioning OUT of `held`/`blocked` → clears `state_expires_at`.
    - Writes one `audit_log` row with `action='unit_state_transition'`, `diff = { from, to, reason, override }`, `actor_id`, `actor_role`, `organization_id`.
    - Returns `jsonb_build_object('ok', true, 'new_state', p_to_state, 'state_expires_at', state_expires_at)` on success.
    - Returns `jsonb_build_object('ok', false, 'error', 'illegal_transition'|'override_required'|'not_found'|'cross_tenant')` on failure (no row mutation).
  - **RPC `expire_inventory_holds(p_limit integer DEFAULT 500) RETURNS integer`**:
    - `SECURITY DEFINER`.
    - Finds rows where `node_type='unit' AND state IN ('held','blocked') AND state_expires_at < now() AND deleted_at IS NULL`, locks them `FOR UPDATE SKIP LOCKED`, sets `state='available'`, `state_expires_at=NULL`, writes `audit_log` row with `action='unit_hold_expired'`. Returns the count of expired rows.
  - **Grants:** `GRANT EXECUTE ON FUNCTION transition_unit_state(...)` to `authenticated`; `GRANT EXECUTE ON FUNCTION expire_inventory_holds(...)` to `service_role` only (cron caller).
  - `NOTIFY pgrst, 'reload schema';` at the tail.

- [ ] **AC-2** State-machine module at `src/lib/inventory/transitions.ts`:
  - `INVENTORY_STATES` literal tuple: `['available','held','blocked','booked','sold','registered','possessed']`.
  - `ALLOWED_FORWARD: Readonly<Record<UnitState, UnitState[]>>` — encodes:
    - `available → [available, held, blocked, booked]`
    - `held → [held, blocked, booked, available]` (returning to available is forward — release)
    - `blocked → [blocked, booked, available]` (release allowed)
    - `booked → [booked, sold]`
    - `sold → [sold, registered]`
    - `registered → [registered, possessed]`
    - `possessed → [possessed]`
  - `isForwardTransition(from, to)`, `isOverrideRequired(from, to)`, `assertTransitionAllowed(from, to, has_override)` — same shape as D-320's `transitions.ts`. Backward (e.g., `booked → held`) and non-adjacent (e.g., `available → sold`) both require override.
  - `IllegalUnitTransitionError extends Error` — `reason: 'unknown_state' | 'illegal_transition' | 'backward_no_override'`.
  - Default TTLs: `DEFAULT_HOLD_HOURS = 24`, `DEFAULT_BLOCK_DAYS = 7` (exported constants; admin UI reads).

- [ ] **AC-3** Inventory lib at `src/lib/inventory/`:
  - **`types.ts`** — `Project`, `Tower`, `Unit`, `UnitState`, `ProjectMetadata`, `UnitMetadata` types; Zod schemas for create/patch payloads (`projectCreateSchema`, `towerCreateSchema`, `unitCreateSchema`, `unitPatchSchema`).
  - **`projects-api.ts`**:
    - `createProject({ org_id, workspace_id, name, city, rera_number?, possession_date_committed?, possession_date_revised?, oc_status?, cc_status?, brochure_url?, layout_url?, ...metadata }, actor_id, client?)` — inserts a `nodes` row with `node_type='project'`. Returns `{ project_id }`.
    - `listProjects(org_id, filters?, client?)` — `node_type='project'`, optional city/state filter, returns row + aggregated tower-count + unit-count + by-state-counts.
    - `getProjectDetail(org_id, project_id, client?)` — full project metadata + tower list + per-state unit counts.
  - **`towers-api.ts`**:
    - `createTower({ org_id, workspace_id, project_id, name, total_floors?, units_per_floor?, ...metadata }, actor_id, client?)` — inserts `nodes` row with `node_type='tower'` and `data.project_id`.
    - `listTowersForProject(org_id, project_id, client?)`.
    - `getTowerDetail(org_id, tower_id, client?)` — tower + per-state unit counts under it.
  - **`units-api.ts`**:
    - `createUnit({ org_id, workspace_id, project_id, tower_id?, unit_no, floor?, unit_type, carpet_area_sqft?, builtup_area_sqft?, saleable_area_sqft?, facing?, view?, corner_or_mid?, floor_rise_factor?, base_price?, price_per_sqft?, plc?, parking_count?, rera_unit_id?, ...metadata }, actor_id, client?)` — inserts `nodes` row with `node_type='unit'`, `state='available'`, full data shape.
    - `listUnitsForProject(org_id, project_id, filter?, client?)` — used by admin catalog detail page.
    - `listUnitsForTower(org_id, tower_id, filter?, client?)`.
    - `getUnitDetail(org_id, unit_id, client?)` — unit + state + state_expires_at + provenance.
  - **`state-api.ts`**:
    - `transitionUnitState({ org_id, unit_id, to_state, actor_id, actor_role, reason?, has_override }, client?)` — wraps the RPC call; returns the parsed `jsonb` result.
    - Convenience wrappers: `holdUnit`, `blockUnit`, `bookUnit`, `markSold`, `markRegistered`, `markPossessed`, `releaseUnit` — each calls `transitionUnitState` with the right `to_state` and `has_override=false` (override is set explicitly by caller).
  - **`index.ts`** — barrel exports.
  - All functions accept an injected `SupabaseClient` for tests; production wires `getSupabaseAdmin`.
  - **Cross-tenant guard:** every read filters `organization_id`. Every write stamps `organization_id` from the caller's session. RPCs assert `organization_id = app_org_id()` inside the function body.

- [ ] **AC-4** Permission catalog extension at `src/lib/auth/rbac.ts`:
  - Add 6 new permissions: `inventory:hold`, `inventory:block`, `inventory:book`, `inventory:sell`, `inventory:register`, `inventory:possess`.
  - Grant matrix:
    - `sales_rep` — `inventory:hold` (only).
    - `manager` — `inventory:hold`, `inventory:block`.
    - `workspace_admin` — `inventory:hold`, `inventory:block`, `inventory:book`, `inventory:sell`, `inventory:register`, `inventory:possess`.
    - `org_admin` / `org_owner` — all six (via ORG_ADMIN_PLANE).
    - Backward / non-adjacent forward transitions continue to require `catalog:admin_override` (no new perm).
  - Lib's `transitionUnitState` does NOT enforce perms — that's the server-action layer's job (per existing pattern). The RPC enforces the *transition graph*; the UI enforces *who can call which transition*.

- [ ] **AC-5** Admin UI — extend `/admin/catalog/[id]/page.tsx` and add `/admin/catalog/[id]/towers/`:
  - **Project detail page** (`/admin/catalog/[id]`) gains:
    - A "Towers" card listing tower rows (name, total units, by-state-count badges) with a "+ Add tower" dialog (label, total_floors, units_per_floor; perm: `properties:create` — already exists).
    - Units table gains a 7-state badge column (color tints below) and a per-row action dropdown (Hold / Block / Book / Sold / Registered / Possessed / Release / Admin-override-revert) filtered by the caller's perms.
    - State badge for `held`/`blocked` shows a countdown chip when `state_expires_at` is set ("expires in 18h" / "expires in 4d").
  - **Tower detail page** (`/admin/catalog/[id]/towers/[towerId]/page.tsx`) — list units under the tower, same table shape; no new functionality vs project detail beyond filtering scope.
  - **State action handler** — server action `transitionUnitAction(formData)` calls `transitionUnitState`, returns discriminated-union result, surfaces error toast on failure.
  - **State badge tints (Tailwind):**
    - `available` — emerald
    - `held` — amber
    - `blocked` — orange
    - `booked` — blue
    - `sold` — purple
    - `registered` — indigo
    - `possessed` — neutral
  - **Permission gating:**
    - View: `properties:view` (existing).
    - Create tower: `properties:create` (existing — towers are sub-properties).
    - State transitions: per-action perm map above. Action dropdown options filtered to perms the caller holds.
    - Override revert: requires `catalog:admin_override` (existing).

- [ ] **AC-6** Cron wiring — `src/lib/inngest/functions/inventory-expire-holds.ts`:
  - Inngest function `inventory/expire-holds` triggered by `{ cron: "0 * * * *" }` (hourly).
  - Calls `expire_inventory_holds()` RPC via service-role client.
  - Logs the returned count to the existing structured logger.
  - Registered in `src/lib/inngest/functions/index.ts` alongside the existing cron functions.

- [ ] **AC-7** Tests (unit + integration; minimum count delta ≥ 30):
  - **`tests/lib/inventory/transitions.test.ts`** (pure state machine):
    - Every state's forward set passes `isForwardTransition`.
    - Same-state is allowed without override.
    - Backward (e.g., `booked → held`, `sold → booked`) fails without override, passes with override.
    - Non-adjacent forward (e.g., `available → sold`) fails without override, passes with override.
    - `assertTransitionAllowed` throws `IllegalUnitTransitionError` with the correct `reason`.
    - Unknown state on either side throws with `reason='unknown_state'`.
  - **`tests/lib/inventory/state-api.test.ts`** (RPC wrapper):
    - Happy path: mocked client returns `{ ok: true, new_state, state_expires_at }`; `transitionUnitState` parses and returns.
    - `override_required` error path.
    - `illegal_transition` error path.
    - `cross_tenant` error path (org-id mismatch).
    - `holdUnit`/`blockUnit` set `state_expires_at` in result.
    - `releaseUnit` clears `state_expires_at`.
  - **`tests/lib/inventory/projects-api.test.ts`** (CRUD):
    - `createProject` validates Zod schema, inserts with full provenance.
    - `listProjects` filters by org; aggregates tower-count + unit-count.
    - `getProjectDetail` returns null on cross-tenant.
  - **`tests/lib/inventory/towers-api.test.ts`** — same shape for towers.
  - **`tests/lib/inventory/units-api.test.ts`** — same shape for units; verifies the full PRD §3 P4 metadata fields round-trip through Zod + insert.
  - **`tests/app/admin-catalog-towers.test.tsx`** (RTL): project detail page renders the Towers card; "+ Add tower" surface visible to `properties:create` holders.
  - **`tests/app/admin-catalog-unit-state.test.tsx`** (RTL): unit row renders the 7-state badge; action dropdown options filtered by caller perms; held-unit shows countdown chip.

- [ ] **AC-8** Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/inventory/**` + new admin pages.

- [ ] **AC-9** Verification script `scripts/verify_d420.mjs`:
  - Asserts `nodes.node_type` CHECK admits `'project'` and `'tower'`.
  - Asserts `nodes.state_expires_at` column + index present.
  - Asserts `transition_unit_state` and `expire_inventory_holds` RPCs callable (via `pg_proc` query).
  - Asserts `audit_log` `action='unit_state_transition'` records a sample transition (test fixture rolled back after verification).
  - Exit code 0 on full pass; 1 otherwise. Same shape as `verify_d413.mjs` and `verify_d417.mjs`.

- [ ] **AC-10** All 10 V4 stopping-criteria gates pass (CLAUDE.md §STOPPING CRITERIA).

---

## Non-goals (deferred to follow-up directives)

- **Customer-facing Project / Tower / Unit canvases** (PRD §3 P8 — for reps + buyers). Admin pages + D-413 list engine cover the V1 acceptance gate ("≥ 1 customer with full project inventory loaded"). Customer canvases are a separate D-421 directive.
- **Project state machine** (Pre-launch / Launch / Construction / OC / Handover). Per PRD §3 P8 project has its own lifecycle — out of D-420 scope; default `state='active'` placeholder. Lands with the customer-facing project canvas in D-421.
- **Bulk inventory import (CSV)** — D-124 owns the entity-agnostic bulk import. Once D-124 lands, project/tower/unit are importable via field mapping.
- **RERA registry sync** — pulling unit-level metadata from the public RERA portal. External integration; deferred.
- **Brochure / floor-plan storage upload UI** — Supabase storage hooks exist; the upload surface lands with the customer-facing canvas (D-421).
- **Booking pipeline integration (Token → Possession)** — D-121's surface. D-420 ships the unit-side states; D-121 stitches them to the deal-side stage transitions.
- **Demand-letter generation on `booked → sold`** — D-121 owns demand letters.
- **Per-org TTL configuration** for held / blocked durations. V1 uses the hardcoded 24h / 7d defaults from `transitions.ts`. Per-org overrides land via D-114 (settings) or a platform-flag pattern.
- **Inventory dashboard tiles** (PRD §3 P6 — "Project Inventory" pre-built dashboard). D-114's surface; D-420 emits the underlying state-count materializable rows.
- **Voice IQ inventory mentions** (D-23 DOE directive: "When inventory state changes to Sold, auto-update the project dashboard tile"). DOE workflow owns the side-effect; D-420 emits the state-transition audit event that the workflow listens to.
- **Mobile / responsive polish** — admin UI is desktop-first per Constitution VII (no native mobile). Tablet rendering pass deferred.

---

## Stack

- **New files:**
  - `supabase/migrations/<ts>_re_inventory.sql`
  - `src/lib/inventory/{types,transitions,projects-api,towers-api,units-api,state-api,index}.ts`
  - `src/lib/inngest/functions/inventory-expire-holds.ts`
  - `src/app/(admin)/admin/catalog/[id]/towers/[towerId]/page.tsx`
  - `src/app/(admin)/admin/catalog/[id]/towers/page.tsx` (optional — towers tab; may inline on project detail)
  - `src/components/inventory/unit-state-badge.tsx`
  - `src/components/inventory/unit-state-action-menu.tsx`
  - `scripts/verify_d420.mjs`
  - `tests/lib/inventory/{transitions,state-api,projects-api,towers-api,units-api}.test.ts`
  - `tests/app/admin-catalog-towers.test.tsx`
  - `tests/app/admin-catalog-unit-state.test.tsx`
- **Modified files:**
  - `src/lib/auth/rbac.ts` — 6 new perms + grants
  - `src/app/(admin)/admin/catalog/[id]/page.tsx` — Towers card + 7-state badge + action dropdown
  - `src/lib/inngest/functions/index.ts` — register the new cron function
  - `src/lib/catalog/queries.ts` — extend `UnitStatus` union to the 7 states OR re-export from inventory/transitions; keep backward compat with D-320's 4-state code paths
  - `src/lib/catalog/transitions.ts` + `api.ts` — backward-compat shim (4-state machine continues to work for legacy `property` rows; new code uses inventory module)
  - `docs/V4_STATUS.md` — D-420 row → shipped
- **Reuses:** `lib/auth/getCurrentUser`, `lib/auth/permissions`, `lib/supabase/admin`, `components/ui/{card,badge,table,select,dialog}`, existing audit_log shape, Zod for payload schemas, Inngest client.
- **No new runtime deps.** No new npm packages.

---

## Authority

- **Constitution II** — Tenant isolation. RPCs assert `organization_id = app_org_id()`; lib reads filter by org; lib writes stamp org from caller.
- **Constitution III** — Provenance mandatory. Every project/tower/unit row carries `created_by`/`created_at`/`created_via`. Every state transition writes an `audit_log` row.
- **Constitution IV** — Immutable audit trail. State transitions are append-only audit entries (action=`unit_state_transition`, diff = from/to/reason/override).
- **Constitution VI** — Baseline immutability. Inventory data model becomes new baseline `117-inventory-data-model.md` (operator-authored or hook-bypass-authorized as a follow-on; D-420 ships the runtime, baseline doc lands separately).
- **Constitution VII** — Stack discipline. Postgres-native row lock (`FOR UPDATE`) for serialization; no external queue. Inngest for cron (already in stack).
- **Constitution VIII** — Bounded permission catalog. 6 new perms added explicitly to `PERMISSIONS` and role maps — not silently widened.
- **PRD v3.0 §3 P4** — Project/Tower/Floor/Unit hierarchy + 7-state machine + concurrent-booking serialization at DB level.
- **PRD v3.0 §3 P8** — `project`, `tower`, `unit` are first-class node types (unit gets a canvas; tower gets a list view; project gets a canvas — canvas/list surfaces are this directive's admin pages + the deferred D-421).

---

## Operator follow-ups (post-merge)

- [ ] Apply migration: agent runs `node scripts/apply_migration.mjs supabase/migrations/<ts>_re_inventory.sql` (gate 4).
- [ ] Verify schema + RPCs: agent runs `node scripts/verify_d420.mjs` (gate 4).
- [ ] Vercel preview env sync: agent runs `node scripts/vercel-env-sync.mjs <branch>` before gate 6. No new env vars needed for D-420 (uses existing `SUPABASE_*`).
- [ ] Inngest cron registration: redeploy picks up the new function automatically (Inngest reads functions on cold-start).
- [ ] Author baseline `117-inventory-data-model.md` (operator action — hook-blocked surface). The baseline locks the schema + state graph + TTLs; D-420 ships the runtime first because the baseline depends on what we actually built.
- [ ] Smoke test on preview:
  - org_admin opens `/admin/catalog` → existing properties list still renders.
  - Click a property → existing units list renders with new 7-state badges (legacy 4-state rows display as before).
  - "+ Add tower" surfaces for `properties:create` holders.
  - Manual transition: `available → held → booked → sold → registered → possessed`; each step audit-logged.
  - Manual override revert: `sold → held` denied without `catalog:admin_override`; allowed with.
  - Concurrent booking attempt (two browsers, same unit): second attempt sees `illegal_transition` (first won the row lock).
  - Hold expiry: set a unit to `held` with a 1-minute TTL via SQL, wait for the hourly cron OR call the RPC manually, verify the unit returns to `available` with an audit row.

---

## Risks & decisions

- **`property` vs `project` node_type:** D-320 shipped `node_type='property'` for what PRD v3.0 calls "Project". D-420 adds `'project'` and `'tower'` as new node_types alongside `'property'`. New inventory creation flows use `'project'` exclusively. Legacy `'property'` rows continue to work — admin catalog renders both. A future tidy-up directive can migrate `property` → `project` once no live customer data depends on the old type. Risk: minor schema-surface inconsistency until that tidy-up. Accepted for V1 GA.
- **TTL defaults (24h held, 7d blocked):** hardcoded constants in `transitions.ts`. Per-org override not in V1 scope. Risk: a builder customer asks for different TTLs before D-114's settings layer lands. Mitigation: trivial to expose as platform flags via D-200's flag layer if needed pre-D-114.
- **Concurrent booking lock fairness:** `FOR UPDATE` is FIFO under Postgres's default scheduler; first transaction wins. The losing transaction reads the new state and sees `illegal_transition` (because the row is now `booked`). Acceptable. No fairness guarantees beyond Postgres's defaults — V1 doesn't need queue ordering.
- **Hold expiry cron cadence:** hourly. Worst-case a held unit lives ~1h past its TTL before reverting. Acceptable for V1; if customer experience demands tighter, the cron cadence is a one-line config change in Inngest.
- **State-machine asymmetry (`held → available` is forward, `booked → held` requires override):** the PRD's state graph is not strictly linear — release-from-held back to available is a normal rep action, not an admin override. The `ALLOWED_FORWARD` map encodes this. Risk: confusing for someone reading "forward" literally. Mitigation: tests cover every edge explicitly; the directive doc is the source of truth for "what's allowed without override".
- **D-413 entity_type CHECK reality vs doc:** the D-413 doc lists `project|tower|unit` in entity_type but the applied migration ships `property|unit`. D-420's migration corrects this by extending the CHECK to also admit `project` and `tower`. Existing `custom_views` rows for `property` continue to work.
- **Migration safety:** all schema changes are additive (extending CHECK constraints, adding a nullable column, adding two new RPCs). No DROP, no destructive ALTER. Rollback documented in the migration header (the inverse SQL to drop the column + revert the CHECK + drop RPCs).
- **RPC `SECURITY DEFINER` surface:** `transition_unit_state` runs as definer to bypass RLS for the audit_log insert + the row lock. It still asserts `organization_id = app_org_id()` to prevent cross-tenant transitions. `expire_inventory_holds` is grant-restricted to `service_role` so only the cron caller can invoke it.

---

## Acceptance gate checklist (PRD v3.0 §9 mapping)

| PRD requirement | How D-420 satisfies |
|---|---|
| "≥ 1 customer with full project inventory loaded" | Admin can create a project + N towers + M units via the catalog admin pages; the data model holds all PRD §3 P4 metadata fields. Bulk CSV import (D-124) closes the "loaded" word; D-420 ships the destination shape. |
| "Inventory state machine: Available → Possessed (7 states)" | `transitions.ts` + `transition_unit_state` RPC enforce the 7 states with override gating. |
| "Concurrent booking attempts on the same unit are serialized at DB level (row lock)" | RPC opens the transaction with `SELECT … FOR UPDATE` on the unit row. Test `tests/lib/inventory/state-api.test.ts` exercises this. |
| "State transitions audit-logged with provenance" | RPC writes `audit_log` row per transition with actor + from/to + reason + override. Constitution III + IV. |
| Held/Blocked TTLs | `state_expires_at` column + hourly `expire_inventory_holds` Inngest cron. |
