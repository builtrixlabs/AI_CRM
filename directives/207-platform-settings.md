# Directive 207 — `/platform/settings` global feature flags

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-207

---

## Problem

`/platform/settings` is a placeholder. Super-admin needs runtime-tunable global flags (force-MFA platform-wide, demo-mode bypass, default token budgets) without redeploying.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New table `platform_flags` (key text PK, value jsonb, description text, updated_at, updated_by). Append-only on `key` (UPSERT only).
- [ ] **AC-2** Seed defaults: `force_mfa: false`, `demo_mode: true`, `voice_iq_platform_enabled: true`, `default_token_budget_per_org_per_month: 5_000_000`.
- [ ] **AC-3** RLS: super_admin SELECT + INSERT + UPDATE; service-role bypass.
- [ ] **AC-4** Library `src/lib/platform/flags.ts`: `getFlag<T>(key, default?)`, `setFlag(key, value, actor)`, `listFlags()`.
- [ ] **AC-5** Page `/platform/settings/page.tsx` (Server Component, super_admin gate): replaces placeholder. Renders the flags as a list. Boolean → checkbox toggle; numeric → input field; string → text input.
- [ ] **AC-6** Server action `setFlagAction(key, value)` — gated, audit-logged.

## Tests

- [ ] **AC-7** Unit tests for `getFlag` (happy path, missing key returns default, type coercion to T).
- [ ] **AC-8** Unit tests for `setFlag` (audit row, upsert behavior).
- [ ] **AC-9** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Per-org override of platform flags — V3.
- Rich types (lists, structs) — flags are string / number / boolean for v2.

## Stack

shadcn Input/Card/Button + Postgres jsonb + super_admin RLS.
