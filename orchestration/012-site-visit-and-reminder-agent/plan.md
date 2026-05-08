# Plan — 012-site-visit-and-reminder-agent

## Files

### Migration
- `supabase/migrations/20260508150000_seed_site_visit_reminder_agent.sql`
  — INSERT one row in `agent_service_accounts` (`agent_type='site_visit_reminder'`, `max_tier='T2'`).

### Library — site visits
- `src/lib/sitevisits/api.ts` — createSiteVisit, transitionSiteVisit, findUpcomingSiteVisits
- `src/lib/sitevisits/transitions.ts` — state machine (scheduled → confirmed → completed | no_show)
- `src/lib/sitevisits/types.ts` — re-export site_visit Zod
- `src/lib/sitevisits/index.ts` — barrel

### Library — agent
- `src/lib/agents/site-visit-reminder.ts` — handler, registers via runtime

### Inngest
- `src/lib/inngest/functions/site-visit-window-sweep.ts` — cron, every 15 min
- `src/lib/inngest/functions/site-visit-window-dispatch.ts` — handles `site_visit.window` and dispatches DOE

### App route action
- `src/app/(dashboard)/dashboard/_actions/scheduleSiteVisit.ts`

### Tests
- `tests/lib/sitevisits/api.test.ts`
- `tests/lib/sitevisits/transitions.test.ts`
- `tests/lib/agents/site-visit-reminder.test.ts`

## TDD order
1. Migration.
2. State machine pure module + test.
3. API helpers + test (mock supabase chain).
4. Reminder agent handler + test (mock gateway + client).
5. Inngest sweep function + test (mock client).
6. Server action.

## Coverage
- `src/lib/sitevisits/**`: ≥ 80%/90%.
