# Directive 018 — Users management surface

**Kind:** feature (V1)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-018..D-021)
**Created:** 2026-05-09
**Source:** Operator request — `/settings/users` placeholder needs full surface
**Authority:** Constitution II (tenant isolation), III (provenance), IV (audit)
**Builds on:** D-001 (profiles + user_app_roles), D-005 (onboarding wizard's invite-flow pattern), D-017 (single-dispatcher action pattern)

---

## Problem

`/settings/users` is a placeholder. Today the only way to add teammates is the onboarding wizard step 6, run once. After onboarding, there's no in-product path to:
- See who's in the org
- Add a new user mid-flight
- Change someone's `base_role`
- Deactivate (soft-delete) a user

D-018 ships the management surface using the existing `profiles` + `user_app_roles` schema. Zero schema changes — only a new lib + actions + page.

## Success criteria

- [ ] **AC-1** Replace `src/app/(settings)/settings/users/page.tsx` placeholder with a Server Component listing all `profiles` in caller's org (`deleted_at IS NULL`), ordered by `created_at`.
- [ ] **AC-2** Permission gate: `settings:manage_users` — redirect to `/403` if absent.
- [ ] **AC-3** Table cols: display_name, email, base_role (badge), workspace count, created_at, actions.
- [ ] **AC-4** Per-row actions: **Change role** (`<Select>` of grantable roles), **Deactivate** (soft-delete confirmation).
- [ ] **AC-5** "+ Invite user" dialog: email, display_name, base_role select. Submit creates auth user + profile row (idempotent on existing email).
- [ ] **AC-6** Single dispatcher `usersAction(formData)` with intents `invite | change_role | deactivate`. Returns `{ ok, error, fieldErrors?, message? }`.
- [ ] **AC-7** Every mutation writes one `audit_log` row (`user_invited` / `user_role_changed` / `user_deactivated`).
- [ ] **AC-8** Cross-tenant guard: every read/write filters by caller's `organization_id`. Targeting another org's user_id returns `validation:not-found`.
- [ ] **AC-9** Refuse to deactivate / role-change a `super_admin` profile (they're not org-scoped).
- [ ] **AC-10** Refuse self-deactivation (operator can't lock themselves out).

## Tests

- [ ] **AC-11** Unit tests for `inviteUser`, `changeBaseRole`, `deactivateUser`: happy path, permission, cross-tenant, self-deactivate guard.
- [ ] **AC-12** Action layer tests with mocked `getCurrentUser`.
- [ ] **AC-13** RTL test for the user-list table renders + the invite dialog opens.
- [ ] **AC-14** Build green; tsc green; coverage on the new files ≥ 80% lines.

## Non-goals

- Email-based invitations (D-018 creates auth user with a temp password the operator shares offline; magic-link invites are V2).
- Per-workspace `app_role` fine-grained editing (only `base_role` for V1).
- Re-activation of deactivated users (V2; for now operator deletes via super_admin).
- Bulk import.

## Stack

Next.js 16 + shadcn (Card/Dialog/Select/Table) + Supabase service-role for mutations + caller_org_id app-layer guard.
