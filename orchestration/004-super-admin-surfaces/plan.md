# Plan — 004-super-admin-surfaces

## Files to be created

### Migrations (`supabase/migrations/`)

| File | Lines (~) | Purpose |
|---|---|---|
| `20260507150000_subscriptions.sql` | 65 | subscriptions table + RLS + NOTIFY |
| `20260507150100_support_tickets.sql` | 70 | support_tickets table + RLS + NOTIFY |

### Application code

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/platform/types.ts` | 35 | OrgRow, OrgDetail, AuditFilters, AuditRow, PlatformCounts |
| `src/lib/platform/provision.ts` | 200 | provisionOrganizationSchema (Zod) + provisionOrganization() with manual rollback |
| `src/lib/platform/queries.ts` | 150 | listOrgs, getOrgDetail, platformCounts, recentAuditRows — all using service-role admin client; audit-log a `read_sensitive` row where applicable |
| `src/app/(platform)/layout.tsx` | 70 | shared platform layout — top bar, amber banner, left nav |
| `src/app/(platform)/platform/page.tsx` | 50 | home: 3 KPI cards |
| `src/app/(platform)/platform/organizations/page.tsx` | 80 | list view with search |
| `src/app/(platform)/platform/organizations/new/page.tsx` | 130 | provisioning form |
| `src/app/(platform)/platform/organizations/new/actions.ts` | 60 | the server action wrapping provisionOrganization |
| `src/app/(platform)/platform/organizations/[id]/page.tsx` | 130 | drill-down (4 stacked sections) |
| `src/app/(platform)/platform/audit/page.tsx` | 90 | filterable audit list |
| `src/app/(platform)/platform/subscriptions/page.tsx` | 25 | placeholder |
| `src/app/(platform)/platform/analytics/page.tsx` | 20 | placeholder |
| `src/app/(platform)/platform/costs/page.tsx` | 20 | placeholder |
| `src/app/(platform)/platform/tickets/page.tsx` | 20 | placeholder |
| `src/app/(platform)/platform/settings/page.tsx` | 20 | placeholder |

### shadcn primitives

`bash scripts/v5/install-shadcn.sh` adds `src/components/ui/{button,input,label,card,badge,separator,table,form,dialog}.tsx` plus a `lib/utils.ts` (cn helper) and updates `tailwind.config.ts` if needed.

### Tests

| File | Type | Lines (~) | Purpose |
|---|---|---|---|
| `tests/lib/platform/provision.test.ts` | Vitest unit | 200 | mocked supabase: happy path, slug collision rolls back, invite failure rolls back, requirePermission denial |
| `tests/lib/platform/queries.test.ts` | Vitest unit | 80 | listOrgs filters, platformCounts shape, recentAuditRows filter combinators |
| `tests/integration/platform-provisioning.test.ts` | Real DB | 130 | super_admin provisions an org via the actual service-role path; verifies all 6 inserts + 1 audit row + magic-link request issued |
| `tests/integration/platform-isolation.test.ts` | Real DB | 80 | super_admin viewing /platform/organizations/[id] sees zero leads via the queries.ts helpers |
| `tests/e2e/super-admin-provisioning.spec.ts` | Playwright @smoke | 130 | sign in as super_admin, fill form, submit, land on detail page, see provisioned row |
| `tests/e2e/super-admin-zero-ops.spec.ts` | Playwright @regression | 90 | with 1 lead seeded for an org, super_admin's drill-down page DOM contains no lead-fixture text |

## Files to be modified

| File | Change |
|---|---|
| `package.json` | shadcn deps added by the installer; sonner already present |
| `src/lib/auth/route-policy.ts` | (no change — middleware already enforces super_admin → /platform) |
| `tests/lib/auth/route-policy.test.ts` | (no change) |

## Migrations applied via

```
supabase db push   # applies 20260507150000..20260507150100
```

## Tests (TDD order)

Group order in [tasks.md](tasks.md):

1. **Group A — schema + permission gates** — migrations + integration test for the new tables' RLS. Verify D-001 through D-003 still green.
2. **Group B — shadcn install + layout** — install primitives, build the platform layout shell with banner + nav. No business logic yet. `npm run build` ✓.
3. **Group C — provisioning + read-side queries** — `provisionOrganization`, `listOrgs`, `getOrgDetail`, `platformCounts`, `recentAuditRows`. Unit + integration tests.
4. **Group D — pages + E2E + verify + PR**.

## Coverage estimate

- **Lines** target ≥ 80% on `src/lib/platform/`. Realistic 88% (forms have minimal branches).
- **Branches** target ≥ 90%. Realistic 92%.
- **Stretch**: provisioning fuzzer with `fast-check` over input edge cases. Not blocking.

## Risks (for Plan Mode reviewer)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | shadcn install conflicts with existing Tailwind v4 setup. | Med | Run install in its own commit (Group B); verify build after each step. |
| P-2 | Manual rollback on partial provisioning failure may miss a step. | High | Test exercises every failure point (slug collision after step 1, profile insert failure after step 3, etc.) and asserts state is fully cleaned. |
| P-3 | `auth.admin.inviteUserByEmail` rate limits on Supabase free tier. | Med | Spec.md RQ-2 fallback: `createUser` + `generateLink`. Document. |
| P-4 | Audit row writes for super_admin reads add latency on every drill-down render. | Low | Acceptable for D-004 (super_admin traffic is low). Optimize later if observable. |
| P-5 | Constitution IX (no tabs) vs PRD §4.3 (tabs). | Low | Stacked sections. Document in PR. |
| P-6 | Provisioning sets `organization_id` on the org_admin profile BEFORE the auth user is invited. JWT claim hook uses profiles -> organization_id. If invite fails, the rollback must remove the profile too. | High | Tests cover this; rollback order is reverse of insert order. |
| P-7 | The provisioning server action runs with service-role implicitly (via getSupabaseAdmin). Future maintainers might assume RLS protects them. | Med | JSDoc on provisionOrganization explicitly states "service-role; bypasses RLS; caller MUST gate with requirePermission FIRST". |

## Out-of-scope reaffirmation

D-004 does NOT ship:
- Custom email branding
- Subscription plan modification (read-only here)
- Real charts / time-series analytics
- Cost dashboard with real data (no Model Gateway yet)
- Ticket reply UI
- Settings page beyond the heading
- Bulk org operations
- Audit CSV export
- Per-tab nested routes (Constitution IX)
