# Directive 004 — Super Admin Surfaces

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §4 D-004 + docs/PRD.md §4
**Authority:** memory/constitution.md (Principles II tenant isolation, IV audit, VII stack discipline, IX Canvas-as-interface — but platform surface is the documented exception per PRD §3.1: "tenant-management table view (not a canvas)")

---

## Problem

D-001 ratified the multi-tenancy schema; D-003 ratified the permission catalog. Now `super_admin` (Builtrix internal staff) needs the actual surfaces to provision new orgs, monitor platform health, and respond to support tickets — without touching any operational data inside any org. Per PRD §4 + §13, **provisioning a new org from `/platform/organizations/new` is the V1 Definition-of-Done gate**.

D-004 ships the 5 primary `/platform/*` routes fully and the remaining 5 as honest placeholders that point forward.

## Success criteria

- [ ] super_admin can sign in, land on `/platform`, see total-orgs / active-orgs counts and the amber zero-operational-access banner.
- [ ] super_admin can list every org at `/platform/organizations` with name, slug, plan_tier, created_at, and a search filter on name/slug.
- [ ] super_admin can submit the form at `/platform/organizations/new` and atomically provision: organization row, default workspace, org_admin profile, default subscription, initial onboarding_state, and one `audit_log` row with `action='create_organization'`. The org_admin receives a Supabase magic-link email.
- [ ] super_admin can drill into any org at `/platform/organizations/[id]` and see read-only Info / Admins / Subscription / Recent Audit sections (NOT operational data — no leads, no deals).
- [ ] super_admin can read the platform-wide audit log at `/platform/audit` filtered by org, action type, or date range.
- [ ] Subscription management, analytics, costs, tickets, and settings ship as placeholder pages with "Coming directive D-XXX" copy and (where applicable) a stub server action.
- [ ] Every server action gates on `requirePermission(user, '<perm>')` from `src/lib/auth/permissions.ts`. Attempts by non-super_admin (org_admin, sales_rep, etc.) return 403 / redirect.
- [ ] RLS proves super_admin reads zero operational rows even from `/platform/organizations/[id]` drill-down — that page reads from `organizations` (allowed), `profiles WHERE base_role='org_admin' AND organization_id=$id` via the service-role admin client (audited), and `audit_log` (already-permitted via `audit_log_select_org` + super_admin platform-row policy).
- [ ] Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/platform/`. All untagged tests pass.

## Constraints

- **Stack** (Constitution VII): Next.js 16 + React 19 + TS strict + Supabase + shadcn/ui (this directive INSTALLS shadcn — first time). No new deps beyond shadcn primitives.
- **No tabs** (Constitution IX): the per-org drill-down uses **sections** stacked on the page, not tabs. PRD §4.3's "tabs" reference is overridden by the constitution.
- **Migration**: additive only. New tables: `subscriptions` (one row per org, defaults to `starter`); `support_tickets` (placeholder for D-XXX inbox).
- **Audit**: every state-changing server action writes to `audit_log` per Constitution IV.
- **Provisioning is server-action only**: the form does not POST to a route; uses Next.js Server Actions.
- **Magic-link delivery**: uses Supabase `auth.admin.inviteUserByEmail` — no separate email integration in D-004.
- **TDD** (V5 D-06): each task = RED test → minimal impl → REFACTOR.

## Out of scope (explicit non-goals)

- Custom email templates / branding for the welcome email (post-V1)
- Subscription plan modification UI (read-only in D-004; modification in D-005 + a billing directive)
- Real-time analytics dashboard with charts (placeholder; full impl in D-XXX after we have ≥1 paying org)
- Per-org × service API spend chart (placeholder; needs Model Gateway in D-009)
- Ticket reply UI with markdown editor (placeholder)
- Settings page beyond a heading (post-V1)
- Provisioning the agent service accounts on plan tier (D-009 ships agents)
- Bulk operations (suspend N orgs, etc.)
- Audit log export (CSV) — V1 if a customer asks
- Per-tab nested routes inside drill-down (Constitution IX — no tabs)

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md`:

- **tenant-isolation-via-jwt-claim** — `subscriptions` and `support_tickets` RLS scoped by `public.app_org_id()`.
- **provenance-as-not-null-columns** — both new tables inherit the standard provenance set.
- **append-only-via-trigger** — `audit_log` already enforced; provisioning writes go through the existing immutability contract.
- **belt-and-suspenders-platform-only** — server actions check `requirePermission(user, 'organizations:create')` AND the DB RLS rejects the INSERT if the caller isn't service-role.
- **cached-resolver-set-per-request** — middleware can resolve permissions once and pass into server actions.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/004-super-admin-surfaces/`.
- Estimate: **L** (10 routes, 1 server action, 2 migrations, shadcn install, ~12 unit tests, ~6 integration tests, 4-6 working sessions).
- Reviewer: confirm the **5-fully-shipped + 5-placeholder** scope. Each placeholder should still gate on a `requirePermission` so adding the body later is a small change.
- Constitution IX vs PRD §4.3 tabs: Plan picks no-tabs (sections). Surface this in the PR if reviewer disagrees.
