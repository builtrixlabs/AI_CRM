# Spec — 012-site-visit-and-reminder-agent

Site visits become a first-class operational object on the canvas:
create, transition, and remind. Reminders run as a tier-bounded T2
agent (templated only).

## Functional surface

- `createSiteVisit({lead_id, scheduled_at, ...}, client?)`
- `transitionSiteVisit({id, target_state, reason?, actor, caller_org_id}, client?)`
- `findUpcomingSiteVisits(hours_window, organization_id?, client?)`
- Server action `scheduleSiteVisit(formData)`
- Reminder agent: `runReminderAgent(visit_id, hours_until)` via the
  agent runtime (T2 ceiling).
- Inngest cron `site_visit.window.sweep` → emits one
  `site_visit.window` event per matching visit.

## Non-functional

- Sweep runs every 15 minutes with ±15 min slack against
  `data.scheduled_at`.
- Agent's max_tier is enforced at the DB layer via the existing
  `audit_log_agent_tier_check` trigger from D-009.

## Out of scope

- Google Calendar OAuth + slot-block (V1).
- Real outbound message provider integration.
