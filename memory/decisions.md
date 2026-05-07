# Architectural Decisions

Append-only record of decisions made during the build. Each entry: date,
directive, decision, alternatives considered, rationale.

---

## 2026-05-07 — D-001 Multi-tenancy foundation

### D-001.1 Provenance enforcement: column NOT NULL with app-set defaults

**Decision:** Every domain table carries provenance columns
(`created_by/at/via`, `updated_by/at/via`, `source_event_id`,
`ai_confidence`, soft-delete trio) as NOT NULL columns with `DEFAULT now()`
where applicable. App code is responsible for setting `_by` and `_via`
fields on every write.

**Alternatives considered:**
- Postgres trigger that auto-fills `created_by` from `auth.uid()` and `via` from a session var. **Rejected** for D-001: triggers are harder to debug and obscure where state changes. Revisit only if app-side discipline drifts.
- Shared base type via PostgreSQL inheritance. **Rejected** — Supabase tooling and ORMs don't handle table inheritance well.

**Rationale:** explicit > implicit; column constraints catch missing fields at
INSERT time; tests can assert provenance presence by SELECTing the columns.

### D-001.2 Audit log writes from app code, not triggers

**Decision:** Every state-changing path writes to `audit_log` explicitly via
the service-role client (`src/lib/supabase/admin.ts`). No Postgres triggers
on domain tables.

**Alternatives considered:**
- Postgres triggers on every domain table that INSERT into audit_log. **Rejected** for D-001: triggers can't capture `actor_role`, `agent_tier`, `prompt_version`, `nl_input`, or `compiled_artifact` (Constitution IV fields) — those live in the app context.

**Rationale:** Constitution IV requires rich audit context that only the
app layer holds. Trigger-based audit deferred indefinitely.

### D-001.3 PLATFORM_ONLY override semantics: silent filter at resolve time

**Decision:** `effectivePermissions` silently filters allow-overrides for
`PLATFORM_ONLY_PERMISSIONS` when the base role is not `super_admin`. The
override row may still exist in `role_permission_overrides` (when D-003 lands)
but never grants the permission at runtime.

**Alternatives considered:**
- Throw at resolve time. **Rejected** — would crash request handling on bad data; silent filter is failure-quiet.
- Reject at write time only. **Adopted in addition** — D-003 admin UI will validate before insert; resolve-time filter is defense-in-depth.

**Rationale:** double-defense — write-time validation prevents bad data;
runtime filter contains existing bad data without taking down the app.

### D-001.4 Org isolation via Supabase Auth Hook + JWT claim

**Decision:** A Supabase Auth Hook (`public.custom_access_token_hook`)
populates `organization_id` and `base_role` claims into every issued JWT.
RLS policies read these via `auth.org_id()` and `auth.is_super_admin()`
helper functions. super_admin's `organization_id` claim is empty (`NULL`),
so `= auth.org_id()` predicates fail naturally → 0 rows.

**Alternatives considered:**
- Server-side custom token wrapper that re-signs JWTs after sign-in. **Rejected** — custom signing infrastructure to maintain.
- Pass `organization_id` from app code on every query as a request-level GUC. **Rejected** — every server action would need to remember to set it; one missed call = isolation hole.

**Rationale:** the Auth Hook approach is what Supabase recommends (their own
docs use it for tenant claims); RLS predicates become declarative; the hook
runs on every token issue → no app-code burden.

### D-001.5 Branch strategy: feature/* off v1, not off main

**Decision:** Feature work for D-001 onward branches off `v1`. PRs merge
into `v1`. `v1` → `main` only when V0 is shipped.

**Rationale:** `main` is treated as "released" once V0 ships; `v1` is the
work-in-progress trunk during V0. Avoids cluttering `main` with
in-progress changes.

### D-001.6 Channel-partner isolation tested via placeholder fixture

**Decision:** D-001 tests the `submitted_by_user_id = auth.uid()` RLS
pattern against a `cp_submissions` test fixture (in
`tests/fixtures/cp-test-table.sql`) — the production `leads` table arrives
in D-002. The fixture is applied to TEST DB only.

**Rationale:** Constitution X1 (channel partner isolation) is existential
risk. Testing the pattern *now* against a stand-in catches the bug class
that D-002 might re-introduce; D-002's plan must replicate the same pattern.

### D-001.7 Patched V5 source bugs (filed for upstream)

**Decision:** Two V5 framework bugs were patched in our consumer copy:

1. `package.json` `prepare` script used `node -e "...require('husky')()"` which throws on Node 24. Patched to `node -e "if(...skip)" && husky`.
2. `baseline/009-pre-commit-contract.md` shipped realistic-format example secrets (Stripe-formatted live-key strings from Stripe's own docs) that GitHub Push Protection treated as real secrets. Patched to obvious placeholders.

**Action:** report both upstream so future scaffolds don't inherit them.
Track at: TBD (V5 upstream issue tracker).

### D-001.8 Next.js 16 `middleware` → `proxy` deprecation

**Decision:** D-001 ships with `src/middleware.ts` despite the Next.js 16
deprecation warning. Migration to `proxy.ts` is a follow-up directive
(low risk; same API).

**Rationale:** the warning doesn't block. Stability over chasing the
latest Next convention before it stabilizes.

---
