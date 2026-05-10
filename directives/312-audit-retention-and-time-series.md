# Directive 312 — Audit retention prune + time-series analytics + cost categorization

**Kind:** feature (V3 / Phase B — billing + delivery + observability; closes Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v3` (carried in PR [apps#42](https://github.com/builtrixlabs/AI_CRM/pull/42))
**Source:** `docs/plans/v3-plan-v1.md` §4 D-312
**Builds on:** D-204 (`api_audit_log`), D-130 (`event_inbox_log`), D-208/D-311 (`webhook_deliveries`), D-205 (`/platform/analytics`)

---

## Problem

Three operational gaps from v2 close out Phase B here:

1. **No retention prune** — `api_audit_log` (D-204), `event_inbox_log` (D-130), and `webhook_deliveries` (D-311 expanded) accumulate forever. Within months a busy org's `api_audit_log` is hundreds of MB; the time-series analytics queries D-312 introduces would slow proportionally.
2. **No time-series view on `/platform/analytics`** — D-205 ships current-snapshot KPIs only. We can't see whether lead-to-booking conversion is trending up or down. Operator needs a 30/60/90-day view + CSV export.
3. **No per-route cost categorization on `/platform/costs`** — D-204 surfaces total-API-call counts and total-token-spend per org, but not "how much of this is Voice IQ inbox vs lookup vs other". Without categorization it's hard to forecast cost impact when one workload type spikes.

D-312 closes all three:

- **Daily prune cron** (Inngest cron at `0 3 * * *` UTC) runs `prune_*` SECURITY DEFINER functions per table. Defaults: `api_audit_log` 90d, `event_inbox_log` 30d, `webhook_deliveries` 60d. Configurable via `platform_flags.retention_days_<table>`. **Min-row safety floor of 100 per table** — never deletes if total row count ≤ 100 (avoids accidentally wiping a fresh deploy).
- **Time-series query** layer adds `getKpisOverWindow(start, end)` returning per-day buckets for the existing 4 KPIs.
- **CSV export** action emits a 1-column-per-bucket CSV.
- **Per-route cost categorization** groups `api_audit_log.path` into 3 buckets (`voice_iq_inbox`, `voice_iq_lookup`, `other`) on `/platform/costs`.

## Success criteria (production target 80/90)

### Schema (additive)

- [ ] **AC-1** Migration `<ts>_audit_retention_and_prune.sql`:
  - Seed `platform_flags` rows (using existing D-207 table):
    - `retention_days_api_audit_log` = `90`
    - `retention_days_event_inbox_log` = `30`
    - `retention_days_webhook_deliveries` = `60`
    - `retention_min_floor` = `100`
  - Three SECURITY DEFINER functions: `prune_api_audit_log(retention_days int, min_floor int)`, `prune_event_inbox_log(...)`, `prune_webhook_deliveries(...)`. Each:
    - Returns `{ scanned int, deleted int }` as record.
    - Reads total row count first; if `<= min_floor`, returns `(scanned, 0)` without deleting.
    - For append-only tables: `ALTER TABLE ... DISABLE TRIGGER <table>_no_delete; DELETE ... WHERE created_at < now() - interval; ALTER TABLE ... ENABLE TRIGGER`.
    - For `webhook_deliveries`: plain DELETE (no append-only trigger).
  - GRANT EXECUTE to `service_role` only.
  - Helpful index: `api_audit_log(created_at)` if not already present (D-204 likely already has this).

### Prune helper

- [ ] **AC-2** New module `src/lib/platform/retention.ts`:
  - `pruneAll(client?)` — reads each `retention_days_*` flag, calls the matching RPC, returns `{ table, scanned, deleted }[]` summary.
  - `pruneOne(table, retention_days, min_floor, client?)` — single-table primitive for tests.

### Inngest cron

- [ ] **AC-3** New function `src/lib/inngest/functions/audit-prune.ts`:
  - `cron: '0 3 * * *'` (daily 03:00 UTC).
  - Calls `pruneAll`, returns the summary, writes one `audit_log` row per table with `action='retention_prune'` and `diff: { table, deleted, retention_days }`.
  - Registered in `src/app/api/inngest/route.ts`.

### Time-series query

- [ ] **AC-4** Extend `src/lib/platform/analytics.ts`:
  - `getKpisOverWindow(start: Date, end: Date, client?): TimeSeriesKpis` — returns `{ days: { date: string, conversion_rate_pct, sv_total, voice_iq_orgs }[] }` with one bucket per day.
  - Single SQL per KPI; uses `generate_series` for empty-day filling.
  - Per-day query under 100ms p95 against the seeded analytics fixture.

### UI

- [ ] **AC-5** `/platform/analytics/page.tsx` extends:
  - Window selector: 30 / 60 / 90 days (default 30).
  - For each KPI, show the trend as a sparkline (inline SVG, no external dep).
  - "Download CSV" button per KPI → server action `exportKpiCsvAction(kpi, days)` that returns a `text/csv` response stream.

- [ ] **AC-6** `/platform/costs/page.tsx` extends:
  - Per-org costs table gains 3 columns: "Inbox calls", "Lookup calls", "Other".
  - Categorization rule: `path LIKE '/api/events/inbox%'` → `voice_iq_inbox`; `path LIKE '/api/admin/leads/lookup%'` → `voice_iq_lookup`; everything else → `other`.

### Tests

- [ ] **AC-7** `tests/lib/platform/retention.test.ts` (mocked DB):
  - `pruneAll` calls all three RPCs in order and aggregates results.
  - Per-table RPC respects min_floor — total < floor returns deleted=0.
  - Failed RPC bubbles up as error in summary entry.

- [ ] **AC-8** `tests/lib/platform/analytics-timeseries.test.ts`:
  - `getKpisOverWindow` returns one row per day in window, including empty days.
  - Conversion rate 0 when no qualified leads in the bucket.

- [ ] **AC-9** Integration-only (live-DB) check documented in runbook — operator runs `select prune_api_audit_log(0, 0)` against a scratch row to confirm the SECURITY DEFINER + trigger-disable path works on the deployed Supabase.

- [ ] **AC-10** Coverage on touched files: ≥80% lines / ≥90% branches.

- [ ] **AC-11** Gate-4 security scan: 0 CRITICAL/HIGH.

## Non-goals (deferred to V3.x)

- **Per-org `retention_days_*` overrides** — global only for v3 MVP. Per-org would need a join in the prune RPC, V3.x.
- **Tier-aware retention** — same retention regardless of plan tier.
- **Restore-from-archive** — pruned rows are permanently gone. Cold storage / S3 export is V3.x.
- **Streaming CSV for huge windows** — 90-day window with 100 orgs is < 1MB; streaming for larger is V3.x.
- **Custom KPI builder UI** — fixed 4 KPIs only.
- **Drill-down on the cost-categorization columns** — just totals for v3 MVP.

## Stack

- **No new runtime deps.**
- **Cron**: Inngest `0 3 * * *` UTC.
- **CSV**: hand-rolled (no `csv-stringify` dep — payload is small, structure is uniform).

## Authority

- Constitution VII — **Provenance** (audit_log entries persist for compliance; `api_audit_log` and `event_inbox_log` are operational telemetry, fair to prune).
- Supersedes: D-204 § non-goals "30-day retention prune cron for `api_audit_log`".
- Supersedes: D-205 § non-goals "Time-series / sparklines"; "CSV export"; "Per-route cost categorization".

## Operator follow-ups (post-merge)

- [ ] Apply migration to AI CRM Supabase prod.
- [ ] Manually run `select prune_webhook_deliveries(60, 100)` once after deploy to verify the cron path.
- [ ] Watch Inngest dashboard at first 03:00 UTC after deploy — function should report `{deleted: N}` per table.
- [ ] If a table's row count is < 100, the function returns `deleted=0` — this is by design (dev/preview environments).
