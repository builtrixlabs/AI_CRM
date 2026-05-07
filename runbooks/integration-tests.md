# Runbook — Running D-001 integration tests

The integration tests under `tests/integration/` exercise real RLS against a
Supabase database. They can't run locally without DB access; they're tagged
RED-by-default until the env is wired.

## What you need

1. **Supabase project** (we have one — `bwumqahgwobwghlmzcrl`, AI CRM, Mumbai).
2. **DB password** (Supabase Dashboard → Project Settings → Database → Connection string).
3. **Service role key** (Supabase Dashboard → Project Settings → API).
4. **Auth hook enabled** — wire `public.custom_access_token_hook` so JWTs carry
   `organization_id` and `base_role` claims. Two ways:
   - **Dashboard:** Auth → Hooks → "Custom Access Token" → select
     `public.custom_access_token_hook`.
   - **Local supabase only** (`supabase/config.toml`):
     ```toml
     [auth.hook.custom_access_token]
     enabled = true
     uri = "pg-functions://postgres/public/custom_access_token_hook"
     ```

## One-time setup

```powershell
# 1. Fill secrets in .env.local
#    SUPABASE_URL=https://bwumqahgwobwghlmzcrl.supabase.co
#    SUPABASE_PUBLISHABLE_KEY=sb_publishable_1BSB1fQwcW5GvStH7fkJUg_UR_NGhfR
#    SUPABASE_SERVICE_ROLE_KEY=<from dashboard>
#    DATABASE_URL=postgresql://postgres:<pw>@db.bwumqahgwobwghlmzcrl.supabase.co:5432/postgres

# 2. Apply migrations to the linked project (creates a preview branch on PR push;
#    locally targets the linked project's main DB).
supabase db push        # or: supabase migration up --linked

# 3. Apply the channel-partner test fixture (TEST DB ONLY).
psql "$env:DATABASE_URL" -f tests/fixtures/cp-test-table.sql

# 4. Enable the auth hook (dashboard click, see above).
```

## Running

```powershell
# Load .env.local into the shell, then:
npm run test:integration
```

Expected outcome (4 files, ~10 cases, ~30s total):
- `audit-log-immutable.test.ts` — UPDATE / DELETE rejected
- `rls-org-isolation.test.ts` — Org A and Org B users see only their own rows
- `rls-super-admin-zero.test.ts` — super_admin sees 0 rows from operational tables
- `rls-channel-partner.test.ts` — CP A sees own 2 submissions, CP B sees own 1

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Integration tests need SUPABASE_SERVICE_ROLE_KEY` thrown at startup | env not loaded — try `dotenv -e .env.local -- npm run test:integration` |
| AC-9 / AC-10 tests fail with `data` containing rows from other orgs | auth hook not enabled; JWT lacks `organization_id` claim — `auth.org_id()` returns NULL → predicate `= NULL` is always-NULL → returns nothing... wait that should be safe. If failing the OTHER way (sees too much), check that RLS is enabled (`SELECT relrowsecurity FROM pg_class WHERE relname='profiles'` should be `t`). |
| AC-12 / AC-13 (audit_log immutability) — UPDATE seems to succeed | `service_role` is configured with `bypassrls = true` (NOT default on managed Supabase). Check: `SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'`. Should be `false`. |
| `cp_submissions does not exist` in B9 | Fixture not applied. `psql $DATABASE_URL -f tests/fixtures/cp-test-table.sql` |
| Tests leave dangling test users | `afterAll` ran on failure but cleanup partial. Manually: `DELETE FROM profiles WHERE email LIKE '%@test.builtrix.in'; DELETE FROM auth.users WHERE email LIKE '%@test.builtrix.in';` |

## Why these tests can't run as part of `npm test`

Unit tests (`tests/lib/**`) run in <1s with no I/O. Integration tests:
- Hit a real database (network latency)
- Need credentials that change per environment
- Mutate state (creating / deleting users)

Mixing the two would slow the dev loop and tie unit tests to env config. They're
in separate vitest configs and run via `npm run test:integration`.
