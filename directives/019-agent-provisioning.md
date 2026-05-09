# Directive 019 — Agent provisioning surface

**Kind:** feature (V1)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch)
**Created:** 2026-05-09
**Builds on:** D-009 (agent_service_accounts + runtime), D-017 (single-dispatcher action pattern)

## Problem

`/admin/agents` is a placeholder. Agents (`Lead Enrichment Agent`) run today globally, but org_admins can't:
- See which agents are active for their org
- Suspend an agent (e.g. while debugging a noisy run)
- Lower the per-org `max_tier` ceiling below the global default

D-019 ships a per-org config layer.

## Success criteria

- [ ] **AC-1** New table `agent_org_configs(organization_id, agent_type, enabled, max_tier_override, suspended_at, suspended_reason)` with provenance + RLS (own-org SELECT + INSERT/UPDATE gated by `agents:provision`).
- [ ] **AC-2** `runAgent` reads the per-org config: if `enabled=false` → return `error: "validation", message: "agent suspended"`. If `max_tier_override` is set, the effective ceiling is `min(global, override)`.
- [ ] **AC-3** Page at `/admin/agents` lists every agent in the global registry plus a `status` column (Provisioned / Suspended / Not provisioned).
- [ ] **AC-4** Per-row: toggle suspended, set max_tier override, "Provision" if no row exists.
- [ ] **AC-5** Single dispatcher `agentsAction(formData)` with intents `provision | toggle | set_tier`.
- [ ] **AC-6** Permission: `agents:provision` for mutations; page is gated by the same.
- [ ] **AC-7** Every mutation writes one `audit_log` row (`agent_provisioned` / `agent_suspended` / `agent_tier_set`).
- [ ] **AC-8** Cross-tenant guard: every mutation filters by caller's `organization_id`.

## Tests

- [ ] Unit tests for lib helpers (provision/toggle/setTier) including cross-tenant + invalid-agent_type.
- [ ] Action layer tests with mocked `getCurrentUser`.
- [ ] Patch existing `tests/lib/agents/runtime.test.ts` to cover suspend + override.

## Non-goals

- Editing the global `agent_service_accounts.max_tier` (super_admin only, separate flow).
- Scheduling / cron config per-agent.
- Rate-limiting overrides.

## Stack

Next.js 16 + shadcn (Card/Select/Switch via form-submit) + new migration + Supabase service-role + caller_org_id app-layer guard.
