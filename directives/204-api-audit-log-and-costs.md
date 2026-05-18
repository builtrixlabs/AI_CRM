# Directive 204 — `api_audit_log` table + `/platform/costs`

**Kind:** feature (V2 / Phase B — admin completion)
**Status:** AUTHORIZED — operator approved 2026-05-09 (full Phase B batch)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-204
**Authority:** Constitution III (provenance), IV (audit), VII (security)
**Builds on:** D-009 (token_usage_ledger), D-004 (super-admin /platform surfaces)

---

## Problem

Two gaps:
1. We have `audit_log` (state-changing actions) but **no per-request security trail** — who hit what URL, when, with what permission, and got what status. PSCRM has it; we don't.
2. `/platform/costs` is a placeholder. Per-org spend exists in `token_usage_ledger` for AI calls but isn't surfaced anywhere.

D-204 ships both: an `api_audit_log` table for every API request, and the `/platform/costs` page that visualises per-org spend (token costs + API call counts).

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New table `api_audit_log` with: id, ts, method, path, status_code, user_id, organization_id, ip, user_agent, latency_ms, permission_checked, rate_limit_remaining. Append-only via trigger (same pattern as `audit_log` + `token_usage_ledger`).
- [ ] **AC-2** RLS: super_admin SELECT all; org_admin SELECT own-org rows; service-role INSERT.
- [ ] **AC-3** New library `src/lib/platform/api-audit.ts`: `recordApiAudit(args)` (insert) + `listApiAudit(filters, limit)` (read for /platform/costs and future debugging surface).
- [ ] **AC-4** Helper middleware `src/lib/api/audit-wrapper.ts`: `withApiAudit(handler)` HOF that wraps a route handler, captures method/path/latency, and writes one row. Best-effort — failure to log doesn't break the request.
- [ ] **AC-5** Apply `withApiAudit` to existing routes: `/api/events/inbox`, `/api/admin/leads/lookup` (Phase A endpoints — most security-relevant).
- [ ] **AC-6** New library `src/lib/platform/costs.ts`: `getOrgCosts(filters)` returns per-org rollup `{org_id, slug, name, plan_tier, tokens_in_30d, tokens_out_30d, api_calls_30d}`.
- [ ] **AC-7** `/platform/costs/page.tsx` Server Component: replaces placeholder. Renders a table — Org · Plan · Tokens (30d in/out) · API calls (30d). Top row aggregates totals.
- [ ] **AC-8** Empty state when no orgs / no spend yet ("No spend recorded — agents and webhooks light up the ledger as they fire.").
- [ ] **AC-9** RBAC gate: super_admin only.
- [ ] **AC-10** Cmd+K palette gains "Costs" entry pointing at `/platform/costs`.

## Tests

- [ ] **AC-11** Unit tests for `recordApiAudit` (writes row with provided fields; defaults sensible).
- [ ] **AC-12** Unit tests for `withApiAudit` wrapper: latency captured; status_code propagated; logs even on 5xx; doesn't throw on log-write failure.
- [ ] **AC-13** Unit tests for `getOrgCosts` aggregation: sums per org; respects 30-day window.
- [ ] **AC-14** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Real-time charts (sparklines) — V3.
- 30-day retention prune cron — V3 (acceptable for demo; volume manageable).
- Per-route cost categorization (e.g. "openai_completion" vs "embed") — V3.
- Per-day series for analytics — D-205 will roll its own from this data.

## Stack

Next.js 16 route wrapper + Supabase service-role for writes + Postgres trigger for append-only enforcement + shadcn Table + Card.
