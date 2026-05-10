# Runbook — D-312 audit retention prune + time-series analytics

**One-time setup** when promoting D-312 to a deployable environment.

---

## 1. Apply the migration

```sh
npx supabase link --project-ref bwumqahgwobwghlmzcrl
npx supabase db push
```

Migration `20260510120400_audit_retention_and_prune.sql`:
- Seeds 4 platform_flags rows: `retention_days_api_audit_log` (90), `retention_days_event_inbox_log` (30), `retention_days_webhook_deliveries` (60), `retention_min_floor` (100).
- Creates 3 SECURITY DEFINER prune functions, each granted to `service_role` only.
- Adds indexes on the date columns.

## 2. Validate the SECURITY DEFINER + trigger-disable path

The prune functions for `api_audit_log` and `event_inbox_log` need to disable the append-only trigger briefly. This is a privileged operation that may fail on restricted Supabase plans. Test once after deploy:

```sql
-- As service_role (Supabase SQL editor uses superuser):
select * from prune_api_audit_log(0, 0);
-- Returns one row: (scanned, deleted)
```

If `deleted` reflects the row count, the trigger-disable path works. If you get `permission denied for table api_audit_log` or similar, the prune fn needs an alternative implementation (V3.x — manual partition-drop).

## 3. Inngest cron will fire daily at 03:00 UTC

`audit-prune` runs at 03:00 UTC. First run after deploy: monitor in Inngest dashboard.

Audit-log query for the cron's runs:
```sql
select action, table_name, diff, created_at
from audit_log
where action = 'retention_prune'
order by created_at desc
limit 30;
```

Expect 3 rows per day (one per pruned table) with `diff: { scanned, deleted, retention_days }`.

## 4. Tune retention via platform_flags

```sql
-- Bump api_audit_log retention from 90 to 180 days
update public.platform_flags
   set value = '180'::jsonb
 where key = 'retention_days_api_audit_log';
```

Effective at next 03:00 UTC cron run.

## 5. Time-series analytics

`/platform/analytics?days={30|60|90}` shows trends:
- **Bookings / day** — sparkline + total + CSV export.
- **Site visits completed / day** — sparkline + total + CSV export.

Query strategy: per-day buckets driven by `nodes.updated_at` and `data.scheduled_at`. For v3 MVP this is the proxy; V3.x can join `audit_log` for true transition history.

CSV download triggers `exportKpiCsvAction` server action; super-admin only.

## 6. Per-route cost categorization

`/platform/costs` table now has 3 categorization columns:
- **Inbox** — calls to `/api/events/inbox*` (Voice IQ webhook deliveries we receive).
- **Lookup** — calls to `/api/admin/leads/lookup*` (Voice IQ lead resolution).
- **Other** — everything else.

Categorization happens at query time via `categorizePath()`. Adding a new product surface to the breakdown:

```ts
// src/lib/platform/costs.ts
export function categorizePath(path: string | null | undefined): CallCategory {
  if (!path) return "other";
  if (path.startsWith("/api/events/inbox")) return "voice_iq_inbox";
  if (path.startsWith("/api/admin/leads/lookup")) return "voice_iq_lookup";
  // V3.x: add more categories here as new routes ship.
  return "other";
}
```

## 7. Rollback

D-312 is **safely rollback-able**:

1. Revert the deploy on Vercel.
2. Inngest stops running the audit-prune cron.
3. Already-pruned rows are gone — no restore (this is the point of pruning).
4. The `prune_*` SQL functions sit dormant.

To explicitly drop them:

```sql
DROP FUNCTION IF EXISTS public.prune_api_audit_log(int, int);
DROP FUNCTION IF EXISTS public.prune_event_inbox_log(int, int);
DROP FUNCTION IF EXISTS public.prune_webhook_deliveries(int, int);
DELETE FROM public.platform_flags WHERE key LIKE 'retention_%';
```

## 8. Operator follow-ups (post-merge)

- [ ] `npx supabase db push` to apply 20260510120400.
- [ ] Manually run `select prune_webhook_deliveries(60, 100);` once to verify the cron path against prod (no append-only trigger involved — safest test).
- [ ] Monitor Inngest dashboard at first 03:00 UTC after deploy.
- [ ] Watch for the new `/platform/analytics?days=...` view; export CSV once to confirm download flow.

## 9. Known gaps (V3.x)

- **No per-org `retention_days_*` overrides** — single global value per table.
- **No tier-aware retention** — `enterprise` tier doesn't get longer retention than `starter`.
- **Restore-from-archive not built** — pruned rows are gone forever. Cold-storage S3 export V3.x.
- **Conversion rate not surfaced as a sparkline** — only bookings/day + sv_completed/day. Conversion as a derived quotient is V3.x.
- **Voice IQ adoption + plan-tier-mix as time series** — not feasible without org-history table; V3.x.

## 10. References

- Spec: [directives/312-audit-retention-and-time-series.md](../../directives/312-audit-retention-and-time-series.md)
- Plan: [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §4 D-312
- Library: [src/lib/platform/{retention,analytics,costs}.ts](../../src/lib/platform)
- Migration: [supabase/migrations/20260510120400_audit_retention_and_prune.sql](../../supabase/migrations/20260510120400_audit_retention_and_prune.sql)
- Cron: [src/lib/inngest/functions/audit-prune.ts](../../src/lib/inngest/functions/audit-prune.ts)
