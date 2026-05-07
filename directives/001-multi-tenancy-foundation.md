# Directive 001 — Multi-Tenancy Foundation

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §3.3 — first build prompt for V0
**Authority:** memory/constitution.md (Principles II tenant isolation, III provenance, IV audit log, V DOE, VI baseline immutability, VII stack discipline)

---

## Problem

Builtrix CRM is a multi-tenant SaaS for Indian real-estate organizations. Before any feature can be built, the data plane must guarantee that:

1. Every record belongs to exactly one organization and one workspace.
2. Cross-tenant access is **architecturally impossible** (RLS-enforced), not policy-prevented.
3. Every state change is provenanced and audited (immutable, append-only `audit_log`).
4. Surface routing is hard-separated between `super_admin` (`/platform`), `org_admin` (`/admin` + `/settings`), operational roles (`/dashboard`), and `channel_partner` (scoped `/dashboard` subset).

This directive lays that foundation. Nothing about leads, deals, canvas, or agents lives here — those build on top of it.

## Success criteria

- [ ] super_admin lands on `/platform`; attempts to load `/dashboard/*` or `/admin/*` are hard-redirected.
- [ ] org_admin lands on `/admin`; attempts to load `/platform/*` are hard-redirected.
- [ ] operational roles (workspace_admin / manager / sales_rep / read_only) land on `/dashboard`; attempts to load `/platform/*` or `/admin/*` are hard-redirected.
- [ ] channel_partner can only see records they submitted (`submitted_by_user_id = self`); cross-CP access returns 0 rows.
- [ ] Bootstrap script provisions the first super_admin via Supabase magic-link and logs `bootstrap_super_admin` to `audit_log`.
- [ ] `audit_log` rejects UPDATE and DELETE for every role (including `service_role`).
- [ ] Every domain table (organizations, workspaces, teams, profiles, user_app_roles) carries the full provenance field set per Constitution III.
- [ ] Three-layer RBAC resolver (`base UNION bridge UNION allow EXCEPT deny`) produces correct effective permissions across the seven test cases listed in `orchestration/001-.../spec.md`.
- [ ] Coverage: ≥80% lines / ≥90% branches on `src/lib/auth/`. All untagged tests pass.
- [ ] Security: 0 CRITICAL after auto-fix.

## Constraints

- **Stack** (Constitution VII): Next.js 16 App Router + React 19 + TypeScript strict + Supabase Postgres + RLS + Supabase Auth + Vercel + Vitest + Playwright. No alternates.
- **Migrations**: additive only. No destructive changes. Soft-delete via `deleted_at`/`deleted_by`/`deleted_reason`.
- **Provenance** (Constitution III): every domain table inherits `created_at/by/via`, `updated_at/by/via`, `source_event_id`, `ai_confidence`, soft-delete trio.
- **Audit** (Constitution IV): every state change appends one row to `audit_log`. Schema matches Constitution IV verbatim.
- **RLS** (Constitution II): every domain table has positive AND negative tests. `super_admin` provably reads zero operational rows.
- **No UI beyond redirect targets**: `/platform`, `/admin`, `/dashboard`, and a 403 page. Each is a one-line placeholder ("Coming next directive — D-002 graph data model" etc.).
- **Idempotency**: bootstrap script is idempotent — re-running on the same email is a no-op (with audit row).
- **TDD** (V5 D-06): each task = RED test → minimal impl → REFACTOR.

## Out of scope (explicit non-goals)

- Agent runtime, tier ceilings, agent service accounts (D-009)
- Graph data model — `nodes`, `edges`, `node_signals`, pgvector (D-002)
- RBAC permission catalog (~120 perms × 9 roles), role_permission_overrides table (D-003)
- super_admin surfaces beyond a placeholder `/platform` (D-004)
- org_admin cockpit + onboarding wizard (D-005)
- Intelligent Canvas component (D-006)
- Lead lifecycle (D-007), Cmd+K (D-008), Model Gateway (D-009)
- Custom fields, custom views, custom dashboards (D-112+)
- Integration framework (email/whatsapp/telephony)
- Billing / subscriptions surface

## Learned patterns applied

`memory/learned/ai-crm/patterns.md` does not exist yet — this is the first feature directive for this product. No prior patterns to apply.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks live at `orchestration/001-multi-tenancy-foundation/`.
- Estimate: **L** (5 migrations + middleware + RBAC resolver + bootstrap script + ~12 tests; 3-5 working sessions).
- This is a baseline-tier deliverable. After ratification it cannot be modified except via a constitution-amendment-style migration directive (Constitution VI).
- Reviewer: confirm scope matches install-plan §3.3 verbatim and does not creep into D-002+ territory.
