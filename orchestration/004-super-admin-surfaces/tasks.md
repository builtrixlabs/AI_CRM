# Tasks — 004-super-admin-surfaces

Ordered for TDD execution. Estimated working sessions: **4-6**.

---

## Group A — Schema + permission gates

### A1. [migration] subscriptions

- Write `20260507150000_subscriptions.sql` per spec.

### A2. [migration] support_tickets

- Write `20260507150100_support_tickets.sql`.

### A3. [integration] RLS for new tables

- `tests/integration/platform-tables-rls.test.ts`:
  - rep A inserts a subscription via service-role; rep B sees 0 (cross-org).
  - super_admin reads subscriptions via authenticated client → 0 rows.
  - org_admin can SELECT own org's subscription, cannot insert one (write is service-role only).

### Commit checkpoint A

- [ ] All migrations applied; D-001/D-002/D-003 + new RLS test pass.
- [ ] Commit: `feat(db): subscriptions + support_tickets tables (D-004 group A)`

---

## Group B — shadcn + platform layout

### B1. [install] shadcn primitives

- `bash scripts/v5/install-shadcn.sh` (or `npx shadcn@latest add button input label card badge separator table form dialog`).
- Verify `src/components/ui/*.tsx` exists and `npm run build` still green.

### B2. [layout] platform shell

- Create `src/app/(platform)/layout.tsx` with the amber banner + left nav links (using shadcn primitives).
- `npm run build` green; `/platform` placeholder still loads.

### B3. [unit] verify shadcn render in tests

- Smoke test: import `Button` from `@/components/ui/button`, render via `@testing-library/react`, assert it's a button. Confirms the install doesn't break test infra.

### Commit checkpoint B

- [ ] `npm run build` ✓
- [ ] All existing tests still pass.
- [ ] Commit: `chore(ui): install shadcn primitives + platform layout shell (D-004 group B)`

---

## Group C — Provisioning + read-side queries

### C1. [unit] provisionOrganizationSchema (Zod)

- `tests/lib/platform/provision.test.ts`: schema validates good input, rejects bad slug / missing email / unknown plan_tier.

### C2. [unit] provisionOrganization happy path

- Mocked supabase admin client + auth admin: 6 inserts in order, 1 audit row, returns `{ organization_id, org_admin_user_id, magic_link_sent: true }`.

### C3. [unit] provisionOrganization rollback paths

- Slug collision (organizations INSERT fails) → no other rows touched.
- Auth invite failure (after profile insert) → DELETE profile + DELETE workspace + DELETE organization in reverse order; no audit row written for the failed attempt; thrown error propagates.

### C4. [unit] requirePermission gate

- Non-super_admin caller → `PermissionDenied` thrown synchronously; no DB calls made.

### C5. [unit] listOrgs / platformCounts / getOrgDetail / recentAuditRows

- `tests/lib/platform/queries.test.ts` mocks the supabase admin client and verifies each helper's query shape (filters applied, limit/offset, audit-log filter combinators).

### C6. [integration] real-DB provisioning

- `tests/integration/platform-provisioning.test.ts`: super_admin (seeded) calls `provisionOrganization` against `bwumqahgwobwghlmzcrl`; verifies all 5 rows exist + 1 audit row.
- Cleanup uses the Date.now() unique-slug pattern.

### C7. [integration] platform isolation

- `tests/integration/platform-isolation.test.ts`: seed an org with 1 lead node; super_admin calls `getOrgDetail(orgId)` and the returned object contains zero lead-related fields. Verifies the helper queries the right tables only.

### Commit checkpoint C

- [ ] All Group C unit + integration tests green.
- [ ] Commit: `feat(platform): provisioning + read-side queries (D-004 group C)`

---

## Group D — Pages + E2E + verify + PR

### D1. [page] `/platform` home

- 3 KPI cards (Total orgs / Active / Org admins). Uses `platformCounts()` server-side.
- Existing placeholder text replaced.

### D2. [page] `/platform/organizations`

- Server component renders a shadcn Table + Input search filter (using URL params for SSR).
- Calls `listOrgs({ search, limit: 50, offset })`.

### D3. [page + action] `/platform/organizations/new`

- Server-action form with shadcn Form components.
- On submit: server action calls `provisionOrganization`, redirects on success, returns errors on failure.

### D4. [page] `/platform/organizations/[id]`

- 4 stacked sections (Card components): Info / Admins / Subscription / Recent audit.
- Calls `getOrgDetail(id)` once per render (single round-trip).

### D5. [page] `/platform/audit`

- Filter form (org dropdown, action, date range) submitted to URL params.
- `recentAuditRows` returns 500 most recent for the filter.

### D6. [page] placeholders for subscriptions / analytics / costs / tickets / settings

- Each is a 20-line page with a heading + "Coming directive D-XXX" copy.
- Each gates on `requirePermission` even though there's no body — keeps the contract honest.

### D7. [e2e@smoke] super-admin provisioning

- `tests/e2e/super-admin-provisioning.spec.ts`: sign in as a seeded super_admin, navigate to `/platform/organizations/new`, fill form, submit, land on the detail page, see the provisioned org's name on the page.

### D8. [e2e@regression] super_admin sees zero ops

- `tests/e2e/super-admin-zero-ops.spec.ts`: seed an org with one lead containing a unique label "OPS_DATA_MARKER"; super_admin drills into the org via `/platform/organizations/[id]`; assert the rendered page does NOT contain "OPS_DATA_MARKER".

### D9. [doc] memory updates

- Append D-004.1..N to `memory/decisions.md`:
  - .1: stacked sections > tabs (Constitution IX over PRD §4.3)
  - .2: manual rollback (no Postgres transactions in supabase-js)
  - .3: shadcn primitives installed + path conventions
  - .4: super_admin reads write `read_sensitive` audit rows
- Append patterns: `provisioning-with-manual-rollback`, `read-sensitive-audit-on-platform-reads`, `stacked-sections-not-tabs`.

### D10. [verify] V5 Gate 4

- `npm run test` → ≥ 170 unit tests pass.
- `npm run test:integration` → ≥ 35 integration tests pass.
- `npm run test:smoke` + `:regression` → all e2e green.
- `npm run build` → ✓.

### D11. [deploy] Vercel preview

- Push branch; Vercel auto-builds. No new env vars needed.

### D12. [merge] PR

- `gh pr create --base v1 --head feature/004-super-admin-surfaces`.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(db): subscriptions + support_tickets tables (D-004 group A)` |
| B | `chore(ui): install shadcn primitives + platform layout shell (D-004 group B)` |
| C | `feat(platform): provisioning + read-side queries (D-004 group C)` |
| D | `feat(platform): super_admin pages + e2e + verify (D-004 group D)` |

Final PR title: `feat: D-004 super_admin surfaces`

---

## Reviewer questions for Plan Mode

1. **5 fully-shipped + 5 placeholder routes.** Plan ships home, organizations, organizations/new, organizations/[id], audit FULLY; subscriptions, analytics, costs, tickets, settings as placeholders. OK, or should I expand any of the latter into D-004 too?
2. **No tabs in the drill-down.** Constitution IX wins over PRD §4.3 — stacked sections instead. Acceptable?
3. **Manual rollback on provisioning failure.** Supabase JS client doesn't expose transactions; we compensate with reverse-order deletes. Tests cover every failure point. Acceptable, or want a Postgres function (`CREATE FUNCTION provision_org(...)`) to do it atomically?
4. **`auth.admin.inviteUserByEmail` for the welcome email.** Uses Supabase's built-in email; no custom branding. Branding deferred to a later directive. OK?
5. **Plan-tier resource limits** are recorded but not enforced in D-004. OK to defer enforcement to D-009 (LLM token caps) and D-005 (user/workspace count)?
6. **Audit `read_sensitive` rows on platform reads.** Every super_admin drill-down read writes one audit row. May add latency. Plan accepts; D-014 may revisit.
