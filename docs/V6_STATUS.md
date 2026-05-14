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
| D-603 | Wire integration adapters into agent dispatch (THE BIG ONE) | **shipped** `#83` | D-432, D-433, D-434, D-435, D-439 |
| D-604 | Marketing Intelligence Hub (MIH) inbound API — `/api/sister/v1/leads` | **built** | D-440, D-443, baseline 122 |
| D-610 | Pre-sales Auto-Allocation Engine | **built** | D-007, D-018, teams (D-001) |
| D-608 | Project ↔ Sales-Person Mapping | **built** | D-018 |
| D-602 | Site Visit Module — list, detail, coordinator role, status workflow | **built** | D-012, D-222 |
| D-605 | Command Center home — real data | **built** | D-009, D-410, realtime publication |
| D-617 | Cmd+K shortcut completion | **built** | D-008 |

**Gate 1:** Real outbound message leaves the system; MIH POST → lead created → auto-allocated → on rep dashboard within 5s; Site Visit tab loads with filtering; Command Center shows real org-scoped KPIs.

**D-603 shipped 2026-05-14** — PR [#83](https://github.com/builtrixlabs/AI_CRM/pull/83), squash `5606620` → `v6-phase-1`. `pickProvider() → "mock"` replaced with `resolveOrgAdapter`; email + sms + whatsapp follow-up dispatch resolve the real per-org adapter; no config → deferred (the "configure your <channel> integration" queue card). **No migration — Gate 4 (migrations) = N/A.** +39 unit + 1 cross-tenant integration test (1743 → 1782 green); `tsc` clean on changed files; security scan clean; `v6-phase-1` post-merge build green (`ai-2v6y2t3qn`). The deployed `/admin/agents/queue` route was verified rendering for an authenticated org_admin via `scripts/demo/verify-d603-queue.ts`; the interactive click-through smoke and per-org live-credential testing are deferred per operator (2026-05-14) — the latter needs `INTEGRATION_ENCRYPTION_KEY` on the preview env.

**D-602, D-604, D-605, D-608, D-610, D-617 built 2026-05-14** — the remaining six Phase-1 directives, built end-to-end in one operator-authorized run on `claude/lucid-tu-6c9e0d` (cut from `v6-phase-1`). Per-directive directive files are in `directives/602…617-*.md`. State: **built + tested + typechecked + migrations applied & verified on Supabase** for all six; the branch is pushed to `origin`. Remaining gates (Vercel preview, live UI verification, PR review/merge to `v6-phase-1`, post-merge build) are operator-side once the branch is reviewed.

- **D-602** Site Visit Module — site visits stay `nodes` rows (no `site_visits` table — PRD shorthand reconciled); **7-state workflow** amends `baseline/110` §III (`draft→scheduled→confirmed→in_progress→completed→cancelled→no_show`); `site_visit_coordinator_claims` table (atomic per-(org,day) claim) + the four V6 `base_role` enum values land here. List + detail pages, coordinator banner, status control. Migrations `20260514130000_v6_role_extensions.sql` + `20260514130100_site_visit_v6.sql` applied, `verify_602.mjs` 11/11 PASS. **Operator follow-up: `baseline/110` §III doc edit is hook-blocked — operator-owned.**
- **D-604** MIH inbound API — `POST /api/sister/v1/leads` implements `docs/baselines/122-mih-inbound-contract.md` verbatim (3-layer auth, Zod body, dedup by `external_id` then phone, 100/sec fail-open rate limit, idempotency). `nodes.source_external_id` + `nodes.source_payload` + `mih_inbound_log` table. Migration `20260514140000_mih_lead_inbound.sql` applied, `verify_604.mjs` 8/8 PASS. **Operator follow-up: tick `docs/baselines/122` §11 sign-off boxes.**
- **D-605** Command Center home — real data — all six `/dashboard` widgets rebuilt prop-driven, fed by `getCommandCenterData` (one role-scoped lead fetch, JS-aggregated KPIs/volume/states/hot-5); `PulseFeed` is a realtime client subscription; empty-state copy added. **No migration.**
- **D-608** Project ↔ Sales-Person Mapping — `project_sales_assignments` (+ partial-unique "one primary per project" index) + `profiles.on_leave`; `resolveSalesRepForProject` lookup (primary → on-leave fallback → null) is the surface D-601 will call; `/admin/projects` + per-project sales-team UI. Migration `20260514150000_project_sales_mapping.sql` applied, `verify_608.mjs` 7/7 PASS.
- **D-610** Pre-sales Auto-Allocation Engine — `lead_allocation_rules` + `lead_allocation_state` + `team_members` tables; `allocateLead` engine (rule match → user/round-robin/first-available target → raw lead-node update + audit); `presalesAllocationOnLeadCreated` Inngest function subscribes to `lead.created` with per-org concurrency=1 for race-free round-robin; `/admin/allocation-rules` UI (teams + members + rules). Migration `20260514160000_presales_allocation.sql` applied, `verify_610.mjs` 11/11 PASS.
- **D-617** Cmd+K shortcut completion — all 12 placeholder shortcuts resolved: 8 lead filters → `/dashboard/leads?canned=<slug>` (new `canned-views.ts` + `DashboardListPage` `adHocFilters` prop), site-visits → D-602's `?bucket=today`, open-deal/contact → real D-410 list pages, send-feedback → new `/dashboard/settings/feedback` form (persists to `audit_log`); the `placeholder` command kind + route + `account-keyboard-shortcuts` removed. **No migration.**

**Phase-1 verification:** full `npx vitest run` → **1898/1898 green** (206 files; +116 over the 1782 D-603 baseline). `npx tsc --noEmit` → 0 errors in changed files (9 pre-existing `tests/e2e/` strict-null errors unrelated). Five new `scripts/verify_60*.mjs` checkers all PASS against live Supabase.

> **Naming note:** D-602's directive lands the four V6 `base_role` values (`presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `site_visit_coordinator`) — implementation-order §6 attributed `role_extensions.sql` to "D-003 ext", but D-602 is the first Phase-1 directive that needs a new role and D-610 needs `presales_rep`, so the four were bundled into D-602's `20260514130000_v6_role_extensions.sql`.

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
v6 Phase 1 (D-603):         1782 tests / 189 files green (+39 unit + 1 integration)
v6 Phase 1 (D-602/604/605/  1898 tests / 206 files green (+116 over the D-603
  608/610/617 built):       baseline). New default-run suites: sitevisits
                            (list/coordinator/detail + 7-state), mih (schema/
                            ingest) + sister/v1/leads route, command-center/data
                            + 6 widget suites, projects/sales-mapping, leads/
                            allocation-engine + inngest/presales-allocation,
                            leads/canned-views, feedback-form, allocation-manager.
                            New integration suites (excluded from default run):
                            site-visit-coordinator-claims, mih-inbound,
                            project-sales-mapping, mih-to-presales.
v6 Phase 2:                 ~ +150 unit + 6 integration + 4 E2E (target)
v6 Phase 3:                 ~ +180 unit + 8 integration + 3 E2E (target)
v6 current:                 1898 unit tests / 206 files green (Phase 0 + all Phase 1)
```

New test suites required (implementation-order §7): `brochure-agent`, `site-visit-agent`, `mih-inbound`, `allocation-engine`, `sales-mapping`, `workflow-builder/compile`, `dashboards/team-scoping`, `platform/impersonation`, plus `site-visit-end-to-end` + `mih-to-presales` integration suites and `v6-brochure-loop` + `v6-site-visit-loop` E2E specs.

---

## 10. Sign-off checklist for V6.0 launch (implementation-order §11)

- [x] Phase 0 stabilization merged to `v6` (2026-05-14) — 10 steps + test alignment; Gate 0 build / tsc / vitest / grep all green. Migration apply + demo-seed run pending (DB-side, see §1).
- [~] Phase 1 — all 7 directives built (D-603 shipped `#83`; D-602/604/605/608/610/617 built 2026-05-14, branch `claude/lucid-tu-6c9e0d` pushed). 1898/1898 vitest green, tsc clean, 4 migrations applied + verified on Supabase. **Remaining for Gate 1 acceptance:** Vercel preview build, live UI verification, PR review/merge to `v6-phase-1`, post-merge build — operator-side once the branch is reviewed.
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
