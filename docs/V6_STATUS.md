# V6 Status — implementation tracker

**Date:** 2026-05-14
**Branch:** `v6` (cut from `v5@a6e5f44` on 2026-05-14)
**Scope:** Presales + sales engagement workbench. 22 new directives (D-600 → D-621) across 6 phases, plus REWIRE / REPACKAGE / REMOVE / DORMANT actions on existing V0–V5 directives.
**Source of truth:** [`docs/PRD-v6.0.md`](./PRD-v6.0.md) (Document 2) + [`docs/plans/v6-implementation-order.md`](./plans/v6-implementation-order.md) (Document 1 — **binding authority for sequencing**). Both operator-supplied 2026-05-14.
**Execution plan:** [`docs/plans/v6-plan-v1.md`](./plans/v6-plan-v1.md).

This doc is the operator-facing tracker for V6 directive status. Mirrors `docs/V5_STATUS.md` shape; rows update as each directive ships. Status values: `planned` → `in plan mode` → `building` → `shipped`.

---

## 1. Phase 0 — Stabilization (removal + cleanup)

Procedure: [`docs/runbooks/v6-stabilization-removals.md`](./runbooks/v6-stabilization-removals.md). Branch: `v6-stabilization` cut from `v6`. Each step is its own commit.

| Step | Action | Directive(s) | Status |
|---|---|---|---|
| 0.1 | Drop catalog UI + unreferenced tables | D-223 / D-320 REMOVE | **shipped** (`f2ce9aa`) |
| 0.2 | Drop inventory UI + tables + RPC + cron | D-420 REMOVE | **shipped** (`8880a64`) |
| 0.3 | Drop booking pipeline UI (keep tables) | D-224 REMOVE / D-421 DORMANT | **shipped** (`f371611`) |
| 0.4 | Unmount CP routes (keep tables) | D-221 DORMANT | **shipped** (`4b988a1`) |
| 0.5 | Drop PSCRM + Legal Auditor sister-product hooks | D-442 / D-443 REPACKAGE | **shipped** (`0326b35`) |
| 0.6 | Drop source-specific connector backlog from docs | D-117 DEFER | **shipped** (`e1c33a0`) |
| 0.7 | Fix broken links (`/admin/support/new`, `/dashboard/site-visits`) | — | **shipped** (`149e852`) |
| 0.8 | Rename "Directives" → "AI Workflows" (UI only) | D-017 REPACKAGE | **shipped** (`16ac00e`) |
| 0.9 | Swap sidebar "Voice IQ" → "App Access" | **D-613** | **shipped** (`0883db2`) |
| 0.10 | Update demo seeder to V6 scope | D-225 REPACKAGE | **shipped** (`f69d23b`) |

All Phase 0 steps committed on `v6-stabilization` (cut from `v6@403df17`), each its own commit. Test alignment for the stabilization changes: `f3768c3`.

**Gate 0 — status (2026-05-14):**
- ✅ **Builds clean** — `npm run build` exit 0 on the `v6-stabilization` tip.
- ✅ **Zero references to dropped features** — `grep` sweep across `src/` + `tests/` clean (catalog/inventory libs, post-sales handlers, deal-stage-tracker, booking_pipeline widget, removed perm literals, `/admin/catalog` + `/admin/inventory` links).
- ✅ **Tests green** — `npx vitest run` → 1743/1743 (186 files). The 4 failures the full run first surfaced were assertions on pre-V6 state (sidebar Inventory entry, `SISTER_PRODUCT_KINDS`, the directives "not found" message); realigned in `f3768c3`.
- ✅ **Typecheck** — `npx tsc --noEmit`: 9 pre-existing `tests/e2e/` errors (strict-null + one Deno-style URL import — unrelated to Phase 0), **0 new, 0 in `src/`**.
- ⏳ **Phase-0 migration applied to Supabase** — `supabase/migrations/20260514120000_v6_narrow_sister_product_kind.sql` is authored + committed; **DB application pending** — it is a destructive `DELETE` of pre-V6 sister-product tokens + a CHECK-constraint swap, and needs `DATABASE_URL`. Apply from the repo root: `node scripts/apply_migration.mjs supabase/migrations/20260514120000_v6_narrow_sister_product_kind.sql`.
- ⏳ **Demo seed run** — `scripts/demo/seed.ts` is V6-shaped (verified by review + tsc); a live run needs `SUPABASE_*` env.

## 2. Phase 1 — Core comms + lead intake

| ID | Directive | Status | Depends on |
|---|---|---|---|
| D-603 | Wire integration adapters into agent dispatch (THE BIG ONE) | planned | D-432, D-433, D-434, D-435, D-439 |
| D-604 | Marketing Intelligence Hub (MIH) inbound API — `/api/sister/v1/leads` | planned | D-440, D-443, baseline 122 |
| D-610 | Pre-sales Auto-Allocation Engine | planned | D-007, D-018, teams (D-001) |
| D-608 | Project ↔ Sales-Person Mapping | planned | D-018 |
| D-602 | Site Visit Module — list, detail, coordinator role, status workflow | planned | D-012, D-222 |
| D-605 | Command Center home — real data | planned | D-009, D-410, realtime publication |
| D-617 | Cmd+K shortcut completion | planned | D-008 |

**Gate 1:** Real outbound message leaves the system; MIH POST → lead created → auto-allocated → on rep dashboard within 5s; Site Visit tab loads with filtering; Command Center shows real org-scoped KPIs.

## 3. Phase 2 — AI-native behaviors

| ID | Directive | Status | Depends on |
|---|---|---|---|
| D-607 | Brochure Repository | planned | D-020, Supabase Storage |
| D-600 | Brochure Agent | planned | D-130, D-322, D-603, D-607, D-614 |
| D-609 | Click-to-call on canvas | planned | D-433, D-603 |
| D-601 | Site Visit Booking Agent | planned | D-130, D-602, D-603, D-608 |
| D-614 | Predefined Message Templates | planned | D-322 |
| D-615 | AI Agent Approval Workflow (manager → org admin) | planned | D-019, D-322 |

**Gate 2:** Brochure loop + Site Visit loop work end-to-end; manager-authored workflow → org-admin approval → live.

## 4. Phase 3 — Manager + org admin UX

| ID | Directive | Status | Depends on |
|---|---|---|---|
| D-611 | AI Workflow Builder (N8N-style) | planned | D-011, D-017 |
| D-612 | Team-Scoped Dashboards | planned | D-021 |
| D-616 | Customer Recovery Team | planned | D-003 |
| D-606 | Super Admin V6 capabilities | planned | D-004, D-202, D-302 |

**Gate 3:** Workflow builder drag-drop-test-publish works; team dashboard publishes scoped; super-admin impersonation audit-trailed.

## 5. Phase 4 — Polish

| ID | Directive | Status | Depends on |
|---|---|---|---|
| D-618 | Realtime updates across lists | planned | postgres realtime |
| D-619 | Notifications system (in-app + email + WhatsApp) | planned | D-603 |
| D-620 | Unified contact timeline | planned | D-410 |
| D-621 | Mobile-responsive admin + dashboard | planned | — |

**Gate 4:** Pilot-ready. First builder onboarded.

## 6. Phase 5 — GA hardening

| Step | Action | Status |
|---|---|---|
| 5.1 | Full RLS audit re-run (all V6 tables) | planned |
| 5.2 | Extend `tests/integration/rls-audit.test.ts` to V6 tables | planned |
| 5.3 | `tests/e2e/v2-acceptance.spec.ts` → `v6-acceptance.spec.ts` | planned |
| 5.4 | Pen-test cycle (D-330 refresh against V6 surface) | planned |
| 5.5 | Tag `v6.0` | planned |
| 5.6 | First pilot onboarding via `scripts/seed-pilot-org.sh` (V6) | planned |

**Gate 5:** Pen-test pass + RLS audit 100% + first pilot signed off → V6.0 GA.

---

## 7. Existing-directive action matrix (implementation-order §2)

How V0–V5's 69 shipped directives map onto V6. Full table in [`v6-implementation-order.md` §2](./plans/v6-implementation-order.md).

| Action | Meaning | Count | Notable |
|---|---|---|---|
| **KEEP** | Ships in V6 as-is | ~40 | D-001/002 (multi-tenancy, graph), D-009 (gateway), D-130–D-134 (Voice IQ), D-300–D-330, D-432–D-440 (live adapters + tokens) |
| **REWIRE** | Code exists, needs connecting | 6 | D-004, D-008, D-012, D-415, D-432, D-433, D-434, D-435 — adapters wired into dispatch via D-603 |
| **REPACKAGE** | Code exists, UX rename / scope adjust | 8 | D-003 (+4 roles), D-011/D-017 (→ AI Workflows), D-021 (team-scoped), D-222, D-225, D-321, D-442, D-443 |
| **REMOVE** | Deleted, irreversible | D-223, D-224, D-320, D-420 | Catalog + booking-pipeline widget + catalog editing + RE inventory |
| **DORMANT** | Unmounted, tables kept, revival path preserved | D-221, D-421 | CP portal + booking pipeline stage machine |
| **DEFER** | Planned, never built, dropped from active plan | D-111, D-114, D-117, D-122, D-123, D-124, D-422, D-423, D-424, D-441 | Reporting layer, source connectors, Legal Auditor, NL Cmd+K, bulk CSV, demand letters, PSCRM read API |

---

## 8. Cumulative schema changes on V6

All additive (implementation-order §6 + PRD §4 data models). None applied yet — Phase 0 lands first. Migration filenames are the implementation-order §6 planned names; actual timestamps assigned at directive build time.

| Migration | Directive | Adds | Applied |
|---|---|---|---|
| `20260520120000_role_extensions.sql` | D-003 ext | `base_role` enum adds `presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `site_visit_coordinator` | pending |
| `20260520120100_brochure_repository.sql` | D-607 | `brochures` table + RLS | pending |
| `20260520120200_site_visits_v6.sql` | D-602 | `site_visits` extended (`cab_*`, `driver_*`, `vehicle_number`, `pickup_*`, `assigned_sales_rep_id`, `coordinator_id`) + `site_visit_coordinator_claims` | pending |
| `20260520120300_project_sales_mapping.sql` | D-608 | `project_sales_assignments` + RLS; `profiles.on_leave` | pending |
| `20260520120400_presales_allocation_rules.sql` | D-610 | `lead_allocation_rules` + `lead_allocation_state` + RLS | pending |
| `20260520120500_team_dashboards.sql` | D-612 | `team_dashboard_assignments` + RLS | pending |
| `20260520120600_mih_lead_inbound.sql` | D-604 | `nodes.source_external_id` + `nodes.source_payload` + dedup index; `mih_inbound_log` | pending |
| `20260520120700_message_template_policies.sql` | D-614 | `agent_message_policies` | pending |
| `20260520120800_ai_workflow_versioning.sql` | D-611 | `directives.version` / `parent_id` / `compiled_dag` / `test_payloads` / `last_test_passed_at` / `lifecycle_status` | pending |
| `20260520120900_super_admin_impersonation_log.sql` | D-606 | `super_admin_impersonation_log` + `platform_defects`; `organizations.feature_flags` | pending |
| _(D-600)_ | D-600 | `agent_approval_queue` extended: `kind`, `attachments`, `error` | pending |

**Phase 0 migration — `20260514120000_v6_narrow_sister_product_kind.sql`** (D-442 / D-443, step 0.5): narrows `org_sister_product_tokens.product_kind` to `marketing_intelligence_hub` only. Implementation-order §5.5 wrote this as an `ALTER TYPE` enum migration, but `product_kind` is a `text` column with a CHECK constraint (D-440), so the migration is a DROP/ADD CONSTRAINT + a forward-only `DELETE` of pre-V6 token rows. **Status: authored + committed, DB application pending** (destructive — needs `DATABASE_URL`; apply via `scripts/apply_migration.mjs`). Catalog / inventory / booking-pipeline migrations from V0–V5 are **not** dropped — tables + RPCs retained for the revival path, marked obsolete in their directive docs.

---

## 9. Test counts

```
v5 baseline entering v6:    ~1675 unit tests (full vitest run as of v5@a6e5f44)
v6 Phase 0 (shipped):       1743 tests / 186 files green — catalog + inventory +
                            booking-pipeline + post-sales suites removed;
                            sidebar / token / directives suites realigned
v6 Phase 1:                 ~ +120 unit + 4 integration + 2 E2E (target)
v6 Phase 2:                 ~ +150 unit + 6 integration + 4 E2E (target)
v6 Phase 3:                 ~ +180 unit + 8 integration + 3 E2E (target)
v6 current:                 1743 unit tests green (Phase 0 complete)
```

New test suites required (implementation-order §7): `brochure-agent`, `site-visit-agent`, `mih-inbound`, `allocation-engine`, `sales-mapping`, `workflow-builder/compile`, `dashboards/team-scoping`, `platform/impersonation`, plus `site-visit-end-to-end` + `mih-to-presales` integration suites and `v6-brochure-loop` + `v6-site-visit-loop` E2E specs.

---

## 10. Sign-off checklist for V6.0 launch (implementation-order §11)

- [x] Phase 0 stabilization merged to `v6` (2026-05-14) — 10 steps + test alignment; Gate 0 build / tsc / vitest / grep all green. Migration apply + demo-seed run pending (DB-side, see §1).
- [ ] Phase 1 Gate 1 acceptance complete (~Week 3)
- [ ] Phase 2 Gate 2 acceptance complete (~Week 6)
- [ ] Phase 3 Gate 3 acceptance complete (~Week 9)
- [ ] Phase 4 Gate 4 acceptance complete (~Week 11)
- [ ] RLS audit 100% on V6 tables
- [ ] Pen-test report green
- [ ] V6 acceptance Playwright suite green
- [ ] First paying customer signed
- [ ] Tag `v6.0` cut on `main`

---

## 11. Branch & merge model (implementation-order §12)

- **V6 horizon branch:** `v6` (long-lived, cut from `v5@a6e5f44` on 2026-05-14).
- **Per-phase branches:** `v6-phase-N` cut from `v6`, merged back via Gate review. (`v6-stabilization` for Phase 0.)
- **Per-directive feature branches:** `feature/<NNN>-<slug>` cut from the current phase branch, PR'd back via Gate 5 of the Vibe OS pipeline.
- **Bug fixes during V6 horizon:**
  - V5 live-pilot fixes → push to `v5`, forward-port to `v6` weekly.
  - V6 in-flight fixes → push to phase branch, merge up.
- **Watchdog branch for V6 post-merge:** `watchdog/v6-postmerge` — create when the first V6 directive merges. Auto-reverts post-merge regressions.
- **Merge to main:** at the `v6.0` tag once §10 sign-off checklist completes.

---

## 12. Foundation commit

`docs(v6): V6 planning baseline` — first commit on `v6`, lands the planning docs (this file, PRD-v6.0, implementation-order, v6-plan-v1, baseline 122, the two runbooks) + the archive banner on PRD-v3.0. No code, no migrations. Phase 0 coding starts after.
