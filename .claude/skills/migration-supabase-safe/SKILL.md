---
name: migration-supabase-safe
description: Use this skill when authoring a Supabase database migration. Enforces additive-only changes by default and produces an explicit rollback for every forward step.
---

# Migration Supabase Safe

When invoked, follow these steps:

1. Decide migration name: `<NNN>_<verb>_<subject>.sql` under `supabase/migrations/` (e.g. `0042_add_budgets_table.sql`).
2. Use `templates/additive-migration.sql` as the starting point.
3. Default to **additive** changes: new tables, new nullable columns, new indexes (with `CONCURRENTLY` where supported).
4. For any **destructive** change (DROP, ALTER COLUMN type, NOT NULL on existing column), require:
   - A preceding migration that backfills/removes existing rows
   - An explicit operator confirmation in the directive
5. Always pair with a corresponding RLS update if the table has user-owned rows (use `supabase-rls-policy` skill).
6. Test locally: `supabase db reset` then `supabase db push`. Confirm types regen: `supabase gen types`.
7. Generated TS types live at `src/types/database.types.ts` — re-run on schema change.

## Refuse without explicit operator OK

- `DROP TABLE` on a table with > 0 rows
- `ALTER COLUMN ... TYPE` that narrows the type
- `ADD COLUMN ... NOT NULL` without a default on a non-empty table
- Changing primary key columns
- Removing or renaming a column referenced by foreign keys without updating dependents

## Rollback

Every migration ships with a `-- rollback:` block at the bottom describing the reverse SQL. Do NOT auto-execute the rollback; surface it for operator review.

## Authority

- BASELINE 002 (Auth & RBAC Core) — schema changes affect RLS
- POLICY 002 (Execution Gating)
