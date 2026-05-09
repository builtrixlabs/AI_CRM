# Directive 201 — `/admin/billing` standalone page

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-201
**Builds on:** D-005 (cockpit cards), D-203 (PLAN_TIERS), D-206 (support_tickets.kind).

---

## Problem

Plan / usage / limits are crammed into the cockpit. Org admins want a dedicated billing surface + a self-service "request upgrade" flow.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New page `/admin/billing/page.tsx` (Server Component, `billing:view` gate). Renders current plan card + tier limits + usage bars (active users / workspaces / leads-30d).
- [ ] **AC-2** "Request plan upgrade" form — choose target tier + reason. Submit creates a `support_tickets` row with `kind='plan_upgrade_request'`, body referencing target tier + reason.
- [ ] **AC-3** Server action `requestPlanUpgradeAction` — gated on `org_owner` / `org_admin`, audit-logged.
- [ ] **AC-4** Layout: `/admin` left-nav adds "Billing" link.
- [ ] **AC-5** Cockpit subscription card stays (no breaking change) — billing page is the deeper detail.

## Tests

- [ ] **AC-6** Lib test: requestPlanUpgrade writes ticket + audit row.
- [ ] **AC-7** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Stack

shadcn Card + Input + Textarea + existing PLAN_TIERS + support_tickets.
