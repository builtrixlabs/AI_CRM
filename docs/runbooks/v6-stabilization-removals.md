# V6 Stabilization Removals Runbook (Phase 0)

**Audience:** the agent (or engineer) executing V6 Phase 0.
**Goal:** get to a clean, buildable, V6-shaped baseline before any feature work.
**Status:** Active — applies to V6 Phase 0 (Gate 0).
**Authority:** [`docs/plans/v6-implementation-order.md`](../plans/v6-implementation-order.md) §4 (Phase 0) + §5 (removal checklist) — **binding**. This runbook expands those sections into an ordered procedure; it does not add or reorder steps.

---

## 0. Pre-flight

Before starting:

- [ ] On branch `v6` (cut from `v5@a6e5f44`, 2026-05-14). Confirm: `git branch --show-current` → `v6`.
- [ ] Cut the working branch: `git checkout -b v6-stabilization` from `v6`.
- [ ] `npm install` clean; `npm run build` green on the `v6` tip (baseline before any removal).
- [ ] `npx vitest run` — record the baseline test count (~1675) so the post-removal delta is verifiable.
- [ ] Each step below is **its own commit** so a revert is surgical (implementation-order §5).

**Removal posture (implementation-order §5, §8):**
- **REMOVE** = delete code + strip references. UI + lib + components + tests go. **Migrations are NOT dropped** — tables are marked obsolete here and left intact for the revival path.
- **DORMANT** = unmount routes, keep code + tables. Revival path preserved.
- Before each removal, run a `grep` reference sweep (PRD §7 risk #5) — nothing outside the feature should import it. If something does, that's a finding: resolve the coupling before deleting.

---

## 1. Step 0.1 — Catalog removal (REMOVE: D-223, D-320)

**Delete:**
```
src/app/(admin)/admin/catalog/         # entire folder
src/components/canvas/                 # any catalog-specific component
src/lib/catalog/                       # entire folder
tests/components/(catalog)*            # catalog component tests
tests/lib/catalog/*                    # catalog lib tests
```

**Strip from `src/lib/auth/rbac.ts`:**
```
"catalog:admin_override"
"properties:view", "properties:create", "properties:edit", "properties:hold", "properties:release"
"units:view", "units:create", "units:edit"
```

**Sidebar:** drop the Catalog entry from `CommandCenterSidebar.PRIMARY_NAV`.

**DB:** NO drop migration. Mark the catalog migrations obsolete in `V6_STATUS.md` §8; leave tables intact (revival path).

**Verify:** `grep -r "catalog\|properties:\|units:" src/` returns nothing outside obsolete migration files. `npm run build` green.

**Commit:** `chore(v6): remove catalog browser + editing (D-223, D-320)`

---

## 2. Step 0.2 — Inventory removal (REMOVE: D-420)

**Delete:**
```
src/app/(admin)/admin/inventory/                     # entire folder
src/lib/inventory/                                   # entire folder
src/components/inventory/                            # entire folder
src/lib/inngest/functions/inventory-expire-holds.ts  # also de-register from inngest/route.ts
```

**Strip from `rbac.ts`:**
```
"inventory:hold", "inventory:block", "inventory:book",
"inventory:sell", "inventory:register", "inventory:possess"
```

**DB:** mark migrations `20260511190000_re_inventory.sql` + `20260511191000_re_inventory_revoke_authenticated.sql` obsolete in `V6_STATUS.md` §8. Tables, `transition_unit_state` RPC, and `expire_inventory_holds` schedule stay (revival path); UI + cron registration gone. Export `nodes` rows where `node_type IN ('project','tower','unit')` before unmounting if a pilot org has live inventory data.

**Sidebar:** drop Inventory from `CommandCenterSidebar`.

**Note:** the `project` node-type reference is retained — D-608 (project ↔ sales-person mapping) needs project names.

**Verify:** `grep -r "inventory" src/` clean; Inngest route no longer registers `inventory-expire-holds`. `npm run build` green.

**Commit:** `chore(v6): remove RE inventory module UI + cron, retain tables (D-420)`

---

## 3. Step 0.3 — Booking pipeline UI removal (REMOVE widget / DORMANT engine: D-224, D-421)

**Delete:**
```
src/components/canvas/deal-stage-tracker.tsx
src/components/dashboard/booking-pipeline-widget.tsx
```

**Also:** remove the stage column from `/dashboard/deals`.

**Keep (revival path):** `src/lib/booking/` stays but is no longer imported from any route. `deal_stage` enum, `nodes.current_stage`, `stage_transitions` table, and the `transition_stage` RPC all stay — unreferenced.

**D-321 follow-on:** the deal canvas is REPACKAGE, not REMOVE — it simplifies to a thin "lead became a customer" wrapper. That scope adjustment is its own directive, not part of this step; here, only strip the stage-tracker UI.

**Verify:** `grep -r "deal-stage-tracker\|booking-pipeline-widget\|BookingPipelineWidget" src/` clean. `npm run build` green.

**Commit:** `chore(v6): unmount booking pipeline UI, retain tables + RPC (D-224, D-421)`

---

## 4. Step 0.4 — Channel Partner portal dormancy (DORMANT: D-221)

**Route:** `src/app/(cp)/cp/` — either wrap the layout in `redirect("/auth/sign-in")`, OR move the folder to `src/app/(cp).disabled/` and have `layout.tsx` throw `notFound()`. Result: `/cp/*` returns 404 / redirects.

**Role:** keep `channel_partner` in the `base_role` enum (DB). New orgs simply cannot assign it. Per PRD §2, `channel_partner` → 401 in V6.

**Demo seeder:** drop the 1 CP submission seed row (handled fully in step 0.10).

**Verify:** `/cp/` returns 404 or redirects. `channel_partner` still present in the enum. `npm run build` green.

**Commit:** `chore(v6): unmount channel-partner portal routes, keep role + tables (D-221)`

---

## 5. Step 0.5 — PSCRM + Legal Auditor sister-product dormancy (REPACKAGE: D-442, D-443)

**Touch:**
```
src/lib/integrations/sister-products/event-kinds.ts   # drop PSCRM + Legal Auditor event kinds
src/lib/events/post-sales/                            # remove inbound handlers
src/app/api/sister/events/inbox/route.ts              # drop "post_sales_crm" + "legal_auditor" branches
```

**DB migration** (additive-safe enum narrowing — author via the `migration-supabase-safe` skill):
```sql
ALTER TYPE product_kind RENAME TO product_kind_old;
CREATE TYPE product_kind AS ENUM ('marketing_intelligence_hub');
-- remap org_sister_product_tokens.product_kind: existing post_sales_crm / legal_auditor
-- tokens are revoked (set revoked_at) before the column is recast; MIH tokens are recast as-is.
DROP TYPE product_kind_old;
```
This is the only Phase-0 migration. It is reversible by re-widening the enum (revival path). Apply via `node scripts/apply_migration.mjs` per `CLAUDE.md`.

**Platform UI:** `/platform/sister-products` shows MIH tokens only.

**Keep:** D-440 token infrastructure, the `/api/sister/events/inbox` route shell, and the `lead.ingested` handler — D-604 builds on these.

**Verify:** `grep -r "post_sales_crm\|legal_auditor\|post-sales" src/` returns nothing in active code paths. `product_kind` enum has one value. `npm run build` green; sister-product token tests pass minus PSCRM/Legal cases.

**Commit:** `chore(v6): narrow sister-product hooks to MIH only (D-442, D-443)`

---

## 6. Step 0.6 — Source-specific connector backlog cleanup (DEFER: D-117)

D-117's source connectors (Meta / Google / JustDial / Sulekha / MagicBricks / 99acres / Housing) were **never built**. Nothing to delete in code — just remove the references from docs:

- `docs/PRD-v3.0.md` §3.1 — the source-connector planning section.
- `docs/V4_STATUS.md` — the D-117 row / table reference.

The universal webform endpoint (D-417) stays as the fallback ingestion path. Baseline 121 (source-connectors contract) stays on disk as historical record but is superseded by baseline 122 (MIH inbound).

**Verify:** `grep -rn "D-117\|source connector" docs/` shows only historical / superseded references, no active plan items.

**Commit:** `docs(v6): drop deferred source-connector backlog from active docs (D-117)`

---

## 7. Step 0.7 — Fix broken links

Two main links currently 404:
- `/admin/support/new`
- `/dashboard/site-visits`

**For this step:** either build a minimal placeholder page OR remove the link from nav. `/dashboard/site-visits` is the more important one — it becomes a real surface in **D-602** (Phase 1). For Phase 0, the minimum is: the link must not 404. Recommended — point the nav entry at a minimal "coming in Phase 1" placeholder so the route resolves, then D-602 replaces it.

**Verify:** no nav link 404s. `npm run build` green; any link smoke test passes.

**Commit:** `fix(v6): resolve broken /admin/support/new + /dashboard/site-visits links`

---

## 8. Step 0.8 — Naming swap: "Directives" → "AI Workflows" (REPACKAGE: D-017)

UI-only rename. **No engine change** — the `directives` table, `directive_invocations`, and all backend identifiers stay.

Rename everywhere in the UI layer: nav labels, page titles, breadcrumbs, toasts, button text. `/admin/directives` route path may stay or alias to `/admin/ai-workflows` — the full route rebuild is D-611 (Phase 3); here it is a label swap only.

**Verify:** `grep -ri "directive" src/app src/components` shows only backend identifiers (table names, types), no user-facing "Directive" strings. `npm run build` green.

**Commit:** `refactor(v6): rename "Directives" → "AI Workflows" in UI (D-017)`

---

## 9. Step 0.9 — Sidebar swap: "Voice IQ" → "App Access" (D-613)

This is the one D-600-series directive in Phase 0.

- `CommandCenterSidebar.PRIMARY_NAV`: rename the "Voice IQ" entry to "App Access" and point it at `/admin/apps` (was `/admin/integrations/voice-iq`).
- `/admin/apps` already exists (D-501 ported `AppAccessCard`). Verify it renders real connection status for CRM, Voice IQ, MIH, and "coming soon" for others.
- The Voice IQ deep-link stays reachable at `/admin/integrations/voice-iq` — it is just no longer in the sidebar.

**Verify:** sidebar shows "App Access" → lands on `/admin/apps`. `/admin/integrations/voice-iq` still reachable directly. `npm run build` green.

**Commit:** `feat(D-613): swap sidebar "Voice IQ" entry for "App Access"`

---

## 10. Step 0.10 — Update demo seeder to V6 scope (REPACKAGE: D-225)

Update `scripts/demo/seed.ts` (and `scripts/seed-pilot-org.sh` if it seeds the same shapes) to produce a V6-shaped org:

- **Strip:** inventory seeding (projects/towers/units beyond the bare project-name node D-608 needs), booking-pipeline stages, catalog rows, the 1 CP submission row.
- **Keep / add:** the four new V6 roles (`presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `site_visit_coordinator`) once the D-003 role-extension migration lands — for Phase 0 the seeder may stub these until that migration exists in Phase 1; note the dependency in the seeder.
- Seed shape should match the PRD §10 pilot scenario org ("Demo Builders Pvt Ltd"-style).

**Verify:** `node scripts/demo/seed.ts` against a scratch DB produces an org with no inventory / booking-pipeline / catalog data and no errors.

**Commit:** `chore(v6): reshape demo seeder to V6 scope (D-225)`

---

## 11. Gate 0 — acceptance

Phase 0 is complete only when **all** of these are green:

- [ ] `npm run build` clean on the `v6-stabilization` tip.
- [ ] Zero references to dropped features — `grep` sweeps from steps 0.1–0.6 all clean.
- [ ] `npx vitest run` passes, minus the ~150 removed catalog / inventory / booking-pipeline tests. No *new* failures.
- [ ] `npx tsc --noEmit` clean for changed files.
- [ ] Demo seed produces a V6-shaped org (step 0.10 verify).
- [ ] The single Phase-0 migration (`product_kind` narrowing) applied to Supabase and verified.
- [ ] `v6-stabilization` merged to `v6`; post-merge `v6` build green.
- [ ] `docs/V6_STATUS.md` §1 — all Phase 0 rows updated `planned` → `shipped`.

When Gate 0 is green, Phase 1 starts — first directive **D-603** (wire integration adapters), per [`v6-plan-v1.md`](../plans/v6-plan-v1.md) §2.

---

## 12. Rollback

Per implementation-order §8:

- Each removal is its own commit — revert is `git revert <sha>` of that single commit.
- **No migrations were dropped** — catalog / inventory / booking-pipeline tables and RPCs are intact. Revival is "re-mount the UI + re-add the perms", not "recreate the schema".
- The `product_kind` enum narrowing (step 0.5) is reversible by re-widening the enum and un-revoking tokens.
- Removed UI surfaces are recoverable from git history on the `v5` branch tip (`a6e5f44`).
