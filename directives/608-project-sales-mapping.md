# Directive 608 — Project ↔ Sales-Person Mapping

**Kind:** feature (V6 Phase 1, step 1.4 — the lookup D-601 site-visit auto-assign depends on)
**Status:** AUTHORIZED — operator cleared Phase 1 to run end-to-end 2026-05-14 ("implement all these features without stopping … completing phase 1").
**Branch target:** `v6-phase-1`
**Generated:** 2026-05-14T12:20:00Z
**Source:** `docs/PRD-v6.0.md` §D-608 (lines 605-637); `docs/plans/v6-implementation-order.md` §4 step 1.4.
**Builds on:** D-002 (graph `nodes` model — projects are `node_type='project'` rows, `projectSchema`), D-018 (users / `profiles`), D-003 (RBAC catalog), D-602 (the V6 role enum + the org-scoped-table RLS pattern).

---

## Problem

When a customer books a site visit at a project, D-601 (Phase 2) needs to know which sales rep to auto-assign. There is no project ↔ sales-rep mapping. D-608 builds it: a manager configures who works which project, with exactly one primary rep and an on-leave fallback, and exposes the `resolveSalesRepForProject()` lookup that D-601 will call.

D-608 ships:

1. **Migration** `20260514150000_project_sales_mapping.sql` — `project_sales_assignments` table (org, project, sales rep, `is_primary`) + RLS; a partial unique index enforcing **at most one primary per (org, project)**; `profiles.on_leave` boolean column.
2. **Lib** `src/lib/projects/sales-mapping.ts` — `listProjects`, `listOrgReps`, `listProjectAssignments`, `addAssignment`, `removeAssignment`, `setPrimaryRep`, and the headline `resolveSalesRepForProject()` — primary rep first; if the primary is `on_leave`, the oldest available non-primary rep; `null` if none available.
3. **RBAC** — new permission `projects:assign_sales` → `manager` + `org_admin`.
4. **UI** — `/admin/projects` (project list) + `/admin/projects/[id]/sales-team` (assignment manager). Reached from a new "Projects" card on the `/admin` cockpit.
5. **Server actions** — add / remove / mark-primary, each gated on `projects:assign_sales`.

---

## Architecture decisions

- **Projects are `nodes` rows.** A project is a `node_type='project'` node (`projectSchema` — `data.name`, `data.city`, …); D-420's inventory UI was removed but the project node type stays (implementation-order §2.4: "Keep only project-name reference (D-608)"). `project_sales_assignments.project_id` carries `REFERENCES nodes(id) ON DELETE CASCADE` — the PRD's data model comments "references nodes.id"; D-608 makes it a real FK for referential integrity (a minor, safe enhancement over the comment).
- **"At most one primary" via a partial unique index.** `UNIQUE (organization_id, project_id) WHERE is_primary` enforces it at the DB. `setPrimaryRep` clears every assignment's `is_primary` for the project, then sets the target's — a brief no-primary window the index permits (zero primaries is legal; the PRD's "exactly one" is an operator workflow goal, "at most one" is the enforceable DB invariant).
- **Fallback lookup, on-leave aware.** `resolveSalesRepForProject` returns the primary if available, else the oldest-assigned available non-primary rep, else `null`. `null` is a valid result — D-601 then creates the visit with `assigned_sales_rep_id=null` and notifies the coordinator (PRD §D-601 AC-5). The lookup joins `profiles.on_leave` in JS via a second `.in()` query (no PostgREST embedding).
- **RLS gates org isolation only; the app gates the permission.** `manager` is not `app_is_org_admin_or_super()`, so the table's write policies cannot use that helper (it would lock managers out). RLS enforces `organization_id = app_org_id()`; the `projects:assign_sales` permission is enforced in the server actions — the same posture as D-602's `site_visit_coordinator_claims`.
- **D-601 dependency is one-directional.** The PRD lists D-608 depending on D-601, but D-601 *consumes* `resolveSalesRepForProject`; D-608 *provides* it. D-608 is fully buildable now; D-601 (Phase 2) wires the lookup into the site-visit booking agent.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** A `manager` opens `/admin/projects/[id]/sales-team`, adds reps, marks one primary, removes one — each via a `projects:assign_sales`-gated server action; the page reflects the change.
- [ ] **AC-2** `resolveSalesRepForProject(org, project)` returns the primary rep when available; when the primary has `on_leave=true`, it returns the oldest-assigned available non-primary rep; when no rep is available it returns `null`.
- [ ] **AC-3** RLS scopes `project_sales_assignments` to the org — a cross-tenant SELECT/INSERT is impossible; proven by `tests/integration/project-sales-mapping.test.ts`.
- [ ] **AC-4** The partial unique index makes a second `is_primary=true` row for the same `(org, project)` a DB error; `setPrimaryRep` transitions cleanly (clear-all then set-one).
- [ ] **AC-5** `projects:assign_sales` is in the literal `PERMISSIONS` catalog, held by `manager` + `org_admin`, and gates every D-608 server action + both pages.
- [ ] **AC-6** Tests: `sales-mapping.test.ts` (CRUD + the fallback lookup matrix), an RTL test for the assignment manager component, `project-sales-mapping.test.ts` integration (RLS + atomic primary). `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-7** All 10 V6 stopping-criteria gates pass. Migration `20260514150000_project_sales_mapping.sql` applies.

---

## Non-goals (deferred)

- **Round-robin / skill-based / calendar-aware assignment** — PRD §D-608 out-of-scope; D-608 is primary-plus-fallback only.
- **A project CRUD surface** — D-608 lists existing project nodes and configures their sales team; creating/editing projects is not in scope (the inventory module that created them was removed; project seeding is operator/seed-script territory for V6).
- **D-601 wiring** — the site-visit booking agent that calls `resolveSalesRepForProject` is Phase 2.
- **Auto-reassignment when a rep goes on leave** — PRD §D-608 out-of-scope; the fallback is evaluated at lookup time, not eagerly on the `on_leave` flip.

---

## Stack

- **New:** `supabase/migrations/20260514150000_project_sales_mapping.sql`, `src/lib/projects/sales-mapping.ts`, `src/app/(admin)/admin/projects/page.tsx`, `src/app/(admin)/admin/projects/[id]/sales-team/page.tsx`, `src/app/(admin)/admin/projects/[id]/sales-team/actions.ts`, `src/components/projects/sales-team-manager.tsx`, `scripts/verify_608.mjs`, plus tests.
- **Modified:** `src/lib/auth/rbac.ts` (`projects:assign_sales` perm + role assignment), `src/app/(admin)/admin/page.tsx` (a "Projects" card in the cockpit Customization grid).
- **Reuses:** `getCurrentUser` / `resolveForUser`, `getSupabaseAdmin`, the admin-page perm-gate pattern (`/admin/views`), the discriminated-union server-action pattern, the `@/components/ui/*` primitives, the additive-migration + org-RLS pattern from D-602.
- **DB:** one new table + one new `profiles` column. No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-608** — the table shape, the primary-plus-fallback rule, the `projects:assign_sales` RBAC, and the `/admin/projects/[id]/sales-team` surface are specified there.
- **Implementation-order §4 step 1.4** — "Foundation for D-601 site-visit auto-assign."
- **Constitution II** — `project_sales_assignments` carries `organization_id` + RLS + a cross-tenant integration test; every lib query filters by org.
- **D-002 / baseline 110** — projects are `nodes`; D-608 references them, adds no new node type.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260514150000_project_sales_mapping.sql`, then `node --env-file=<parent>/.env scripts/verify_608.mjs`.
- [ ] **Seed projects** — D-608 has no project-creation UI; a V6 org needs `node_type='project'` rows (via the demo seeder or operator import) before `/admin/projects` shows anything.
- [ ] **Smoke** `/admin/projects/[id]/sales-team` as a `manager`: add 3 reps, mark one primary, flip a rep's `on_leave`, confirm `resolveSalesRepForProject` falls back.

---

## Risks & decisions

- **Empty `/admin/projects` until projects are seeded.** D-608 ships no project-creation UI (out of scope — see Non-goals). A fresh V6 org has no project nodes, so the list is empty with a clear empty state pointing the operator at the seeder. This is expected, not a bug.
- **`setPrimaryRep`'s brief no-primary window.** Clearing all `is_primary` then setting one leaves a sub-millisecond window with zero primaries. The partial unique index permits zero primaries, and `resolveSalesRepForProject` handles "no primary" by falling through to the non-primary list — so a concurrent lookup during the window degrades to the fallback path, never errors.
- **`on_leave` is a profile-wide flag, not per-project.** A rep on leave is unavailable for *every* project's auto-assign. PRD §D-608 models it exactly this way (`profiles.on_leave`). Per-project availability would be a richer model — explicitly out of V6 scope.
- **No FK from `project_id` to a "projects-only" constraint.** `project_sales_assignments.project_id REFERENCES nodes(id)` — `nodes` is polymorphic, so the FK does not itself guarantee the row is a project. The lib's `listProjects` filters `node_type='project'`; a manager can only pick real projects through the UI. A stray non-project `project_id` inserted out-of-band would simply never resolve a rep — fail-safe, not fail-open.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every `sales-mapping.ts` query runs on `getSupabaseAdmin()` and filters by `organization_id`; the integration test proves cross-tenant isolation.
- **`server-action-result-discriminated-union`** — the add/remove/set-primary actions return `{ ok: true } | { ok: false, reason }`; no throwing across the boundary.
- **`injectable-supabase-client-for-tests`** — every `sales-mapping.ts` function takes an optional `client` last-arg.
- **`rls-org-isolation-app-permission-gate`** (from D-602) — the table's RLS enforces org isolation only; the `projects:assign_sales` permission is gated in the server action, because `manager` is not an org-admin-tier role.
- **`additive-only-migrations`** — `IF NOT EXISTS` table + index + column; explicit `ROLLBACK:` block; no destructive change.
