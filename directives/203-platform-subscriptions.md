# Directive 203 — `/platform/subscriptions` plan CRUD + suspend / cancel

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-203
**Builds on:** D-004 (super-admin surfaces), D-204 (audit log writes).

---

## Problem

`/platform/subscriptions` is a placeholder showing static plan cards. Super admins need real per-org control: change a plan tier, suspend an org (sign out users + status='suspended'), cancel with grace period, reactivate.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New library `src/lib/platform/subscriptions.ts`:
  - `listOrgSubscriptions()` returns `[{org_id, slug, name, plan_tier, status, starts_at, current_period_end}]`.
  - `changePlanTier(org_id, new_tier, actor_id)` — updates `subscriptions.plan_tier`. Audit-logged.
  - `suspendOrg(org_id, reason, actor_id)` — sets status='suspended'. Audit-logged.
  - `cancelOrg(org_id, reason, actor_id, grace_days = 30)` — status='cancelled', current_period_end = now + grace.
  - `reactivateOrg(org_id, actor_id)` — status='active'.
- [ ] **AC-2** New library `src/lib/platform/plan-tiers.ts` — hardcoded plan-tier limits (max_users, max_leads_30d, max_properties, max_bookings_per_month, features). Demo-grade; full plan-CRUD table lands V3.
- [ ] **AC-3** New page `/platform/subscriptions/page.tsx` (Server Component, super_admin only): replaces placeholder. Shows the plan-tier reference cards (from `plan-tiers.ts`) + a per-org table with status badge + per-row action menu.
- [ ] **AC-4** Per-row actions (Client Component dialogs): change plan, suspend (requires reason), cancel (requires reason), reactivate. All call server actions, all audit-logged.
- [ ] **AC-5** Suspend / cancel writes one `audit_log` row each with `action='subscription_suspended' | 'subscription_cancelled' | 'subscription_reactivated' | 'plan_tier_changed'`.
- [ ] **AC-6** Suspend doesn't actually sign-out users for v2 (would require touching every Supabase session — V3). It just flips the DB status; middleware can read this in V3 to soft-block.
- [ ] **AC-7** RBAC: super_admin only. Server actions return `permission` error otherwise.

## Tests

- [ ] **AC-8** Unit tests for each lib function (happy path + audit row written).
- [ ] **AC-9** Action layer test: permission denial for non-super_admin.
- [ ] **AC-10** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Subscription_plans CRUD table — V3.
- Stripe / billing integration — V3.
- Email-on-suspend / email-on-cancel — V3.
- Forced sign-out on suspend — V3.

## Stack

shadcn Card / Table / Dialog / Select + Supabase service-role for writes.
