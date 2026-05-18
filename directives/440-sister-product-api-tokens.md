# Directive 440 — Per-org sister-product API tokens

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/440-sister-product-tokens` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 2.1](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)

## 1. Problem

Phase 1 closed the per-org messaging multi-tenancy story. Phase 2 turns AI_CRM into a **platform** — Post-Sales CRM (PSCRM), lead-sources, Legal Auditor, and future sister apps consume our data + push events to us. The first prerequisite is **per-org bearer tokens** issued by super_admin, scoped to a single org + a single sister product.

Pattern mirrors Voice IQ's secret model (D-132 `org_integration_secrets`) but with bearer-token semantics: tokens are not signing secrets, they authenticate the calling app. Each token belongs to (organization_id, product_kind).

## 2. Scope (in)

1. **Migration** `supabase/migrations/20260513150000_org_sister_product_tokens.sql`
   - Table `org_sister_product_tokens` (id PK, organization_id FK, product_kind CHECK ∈ {post_sales_crm, lead_sources, legal_auditor}, token_hash, last4, created_by, last_used_at NULL, revoked_at NULL, revoked_by NULL).
   - Unique on `token_hash`; partial index `WHERE revoked_at IS NULL` for the hot verify path.
   - RLS: super_admin-only SELECT (via `public.app_is_super_admin()`); INSERT/UPDATE/DELETE denied (server actions via service role).
2. **Verify script** `scripts/verify_d440.mjs` — checks table + indexes + RLS + super_admin policy.
3. **Token module** `src/lib/integrations/sister-products/token.ts`
   - `issueToken(admin, orgId, productKind, createdBy)` — generates a 32-byte URL-safe base64 token, stores SHA-256 hash + last4; returns the plaintext **once**.
   - `verifyToken(admin, token)` — SHA-256 hash + partial-index lookup; updates `last_used_at` fire-and-forget; returns null on missing/revoked.
   - `revokeToken(admin, id, revokedBy)` — soft-revoke.
   - `listTokens(admin, orgId?)` — admin browser, hash never exposed.
4. **Auth middleware** `src/lib/auth/sister-product-auth.ts`
   - `authenticateSisterProductRequest(req)` reads `Authorization: Bearer <token>`, verifies via the token module, returns `{ org_id, product_kind }` or a structured error suitable for a 401 response.
5. **Super admin UI** `src/app/(platform)/platform/sister-products/page.tsx` + `issue-form.tsx` + `actions.ts`
   - Lists all (active + revoked) tokens grouped by org with `last4`, `product_kind`, `last_used_at`, `revoked_at`.
   - "Issue new token" form picks org + product_kind, returns plaintext **shown once** with a copy button + "can't be retrieved later" warning.
   - Revoke action soft-revokes immediately.
6. **Platform layout nav** — add a "Sister products" entry to `src/app/(platform)/layout.tsx`'s NAV.
7. **Tests**
   - `tests/lib/integrations/sister-products/token.test.ts` — issue/verify roundtrip, IV uniqueness (different tokens hash differently), verify-revoked-returns-null, hash-collision-resistance, base64-url safety.
   - `tests/lib/auth/sister-product-auth.test.ts` — missing header → error, malformed → error, valid token → resolved context, revoked token → error.

## 3. Out of scope

- Token rotation UI (revoke + re-issue is the rotation path for D-440).
- D-441 `/api/sister/v1/*` routes that *consume* these tokens — separate directive.
- D-442 outbound events / D-443 inbound events — separate directives that also key off these tokens but ship their own endpoints.
- Per-product scoping policy beyond `product_kind` (e.g., per-route ACLs inside a token) — D-441 enforces "this token can only read these resources" at the route layer.

## 4. Per-org integration model — locked

The token is bound to `(organization_id, product_kind)`. Every consumer of the token resolves the calling org via the token, never trusts an `org_id` query param. Cross-tenant fail-closed by design.

## 5. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** every file in §2.
2. **Tested:** new vitest green.
3. **Typechecked:** clean for changed files.
4. **Migrations:** `20260513150000_org_sister_product_tokens.sql` applied + `verify_d440.mjs` 7/7 PASS.
5. **Pushed:** PR opened against v5.
6. **Vercel preview green.**
7. **UI verified on live preview:** sign-in renders; `/platform/sister-products` reachable for super_admin (operator self-verifies).
8. **PR merged to v5.**
9. **Post-merge v5 build green.**
10. **Status logged in V5_STATUS.md.**
