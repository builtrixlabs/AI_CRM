# Directive 005 — Org Admin Cockpit + Onboarding Wizard

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §4 D-005 + docs/PRD.md §5.2 + §5.3
**Authority:** memory/constitution.md (Principles I, IV audit, IX no-tabs, VII stack discipline)

---

## Problem

D-004 ships the super_admin path: provisioning a new org creates an `org_admin` user + a magic-link. When that org_admin clicks the link they sign in and land on `/admin` — but right now `/admin` is the D-001 placeholder. They have no way to configure their org or onboard their team.

D-005 ships:

1. The `/admin` cockpit per PRD §5.2 — three rows of cards (Account state / Configuration / Customization) plus a dismissable onboarding banner when `onboarding_state.completed = false`.
2. An 8-step onboarding wizard at `/admin/onboarding` per PRD §5.3, where steps 1 (Org details) and 3 (First workspace) are hard-gated; the rest are skippable + revisitable.
3. A sample-lead demo (step 8) that walks through a synthetic lead with **fake** data — no real `nodes` row is created.

**V0 scope reality**: most card targets in the cockpit (`/admin/dashboards`, `/admin/tables`, `/admin/agents`, `/admin/directives`) belong to later directives (D-112 / D-009 / etc.). D-005 ships the cockpit cards as **honest placeholders** that link forward; the cards themselves are real (live counts where possible).

## Success criteria

- [ ] An org_admin who signs in lands on `/admin`. Middleware (D-001) already routes them.
- [ ] `/admin` renders 3 rows × 4 cards (subscription / usage / support / users / integrations / app access / dashboards / tables / agents / directives).
- [ ] If `onboarding_state.completed = false` (default for new orgs), an amber dismissable banner shows on top with "Resume onboarding (step N of 8)".
- [ ] `/admin/onboarding` is a single-page wizard that walks the 8 steps. Steps 1 and 3 cannot be skipped; the "Next" button on those steps refuses to advance until the form validates.
- [ ] Each step's persistence updates either an existing table (organizations / workspaces) or `organizations.onboarding_state` jsonb. Every state-changing step writes one `audit_log` row with `action='onboarding_step_completed'`.
- [ ] `onboarding_state.completed = true` is set when all 8 steps' `completed_steps` array contains every step ID. Banner disappears on next render.
- [ ] Coverage ≥ 80% / ≥ 90% on `src/lib/admin/`. All untagged tests pass.
- [ ] Existing D-001 / D-002 / D-003 / D-004 suites remain green.

## Constraints

- **No tabs** in the cockpit (Constitution IX). Vertical card grid.
- **org_admin can ONLY hit `/admin/*` and `/settings/*` and `/dashboard/*`** — middleware already enforces. `/admin/onboarding` is part of `/admin/*`; gates on `requirePermission(user, 'organizations:edit')`.
- **No new operational data**. The sample-lead demo step uses an in-memory fixture; no `nodes` row is created.
- **Step persistence**: org details (step 1) updates the existing organizations row (RERA, GSTIN); workspace step updates the default workspace (slug + name); other steps record selections in `onboarding_state` jsonb.
- **Audit**: every advance writes one row.
- **TDD** (V5 D-06): each task = RED test → minimal impl → REFACTOR.
- **shadcn primitives** added in D-004 are reused. No new shadcn install in D-005.

## Out of scope (explicit non-goals)

- Custom dashboard builder UI (D-114)
- Custom fields engine UI (D-112)
- Agent provisioning UI (D-009 admin)
- Directive authoring UI (D-011)
- Real integrations setup (email / WhatsApp / telephony) — D-007/D-010/D-012 ship the actual integrations; D-005 records the user's selection
- Branding upload (logo, color) writes to onboarding_state only — file storage in a later directive
- Inviting more than 3 users at step 6 — V1 expands
- Pipeline stage editor — V0 ships the default 7-stage pipeline as fixed; user can confirm but not customize names/order until D-007
- Resume-from-where-you-left-off across sessions beyond the `current_step` field
- Org-side ticket filing (placeholder card only)

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md`:

- **tenant-isolation-via-jwt-claim** — every `/admin/*` server action queries via `app_org_id()` or via service-role with explicit `organization_id = user.org_id` checks.
- **provisioning-with-manual-rollback** — onboarding step 6 (invite team users) reuses the same pattern when a user invite fails.
- **read-sensitive-audit-on-platform-reads** — does NOT apply here; org_admin reading their own org is operational, not platform-tier.
- **belt-and-suspenders-platform-only** — cockpit's "Manage agents" / "Manage directives" cards forbid permissions outside the org_admin set even if URL params try to widen scope.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/005-org-admin-onboarding/`.
- Estimate: **L** (1 migration adding a `branding` column, ~12 files for cockpit + wizard, ~14 unit tests, ~4 integration, 4-6 sessions).
- Reviewer: confirm the 5-fully-shipped + 3-light-step approach (steps 1, 2, 3, 4, 6 fully wired; 5 ships default + a "looks good" confirm; 7, 8 are config/demo with no new tables).
- Onboarding step 5 (pipeline stages) is intentionally read-only for V0 — customisation lands in D-007 with `lead` lifecycle.
