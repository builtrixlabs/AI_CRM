# Directive 012 — Site Visit node + Site Visit Reminder Agent (T2)

**Kind:** feature
**Status:** AUTHORIZED — Plan Mode (Gate 2) approved (operator: assume-approve)
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-012 + docs/PRD.md §5.7 D-03/D-04 + Constitution I (T2 ceiling) + Constitution IX (Canvas)
**Authority:** memory/constitution.md (Principles I tier ceiling, IV audit, IX canvas)
**Builds on:** D-002 (site_visit schema + states), D-006 (Lead canvas), D-007 (lead lifecycle), D-009 (agent runtime + gateway), D-010 (template send via DOE), D-011 (DOE engine for D-03/D-04 directives)
**Stack:** branched off `v1` directly.

---

## Problem

PRD §5.7 lists site-visit reminders (D-03, D-04) as V0 directives.
PRD §5 names site_visit as a first-class node type. The
underlying schema landed in D-002, but there is no:
- helper to **create or transition a site_visit**
- **Site Visit Reminder Agent** (T2 — templated outbound)
- **server action** for the canvas to schedule a visit
- **15-minute scheduled job** that scans for visits in the
  24h / 2h windows and dispatches D-03 / D-04

D-012 closes those gaps:

1. **`src/lib/sitevisits/api.ts`** — `createSiteVisit`,
   `transitionSiteVisit`, `findUpcomingSiteVisits(window_minutes)`.
   Validation against the existing Zod schema; provenance + audit
   on every write.
2. **Server action `scheduleSiteVisit({lead_id, scheduled_at})`** —
   the canvas's "Schedule a site visit" UX. Verifies the caller's
   org via `getCurrentUser`, dispatches the D-002 helper, and
   triggers the DOE `lead.state_changed` event so any
   org-specific directives fire.
3. **Site Visit Reminder Agent (T2)** — service-account
   `agent_type='site_visit_reminder'`, max_tier `T2`. Receives an
   Inngest event `site_visit.window` with the visit_id + hours_until,
   resolves the lead via the visit's `data.lead_id`, calls
   `gateway.complete()` for a templated personalization, and
   writes an `activity` node with `data.kind='whatsapp'` plus an
   audit row (agent action, tier=T2). T2 means "templated comms" —
   the message is bounded by template selection, not freeform.
4. **Inngest scheduled function** `siteVisitWindowSweep` (every 15
   min) that scans `nodes` for site_visits in `state='scheduled'`
   whose `scheduled_at` is ~24h or ~2h away (±15min slack), and
   emits one `site_visit.window` event per visit (idempotent on
   `visit_id + hours_until` via the DOE runtime's idempotency).
5. **Migration** for the agent service account row +
   `site_visit_reminder` audit-tier check.

---

## Success criteria

- [ ] **AC-1** `createSiteVisit({lead_id, scheduled_at, ...})`
      validates against `siteVisitSchema`, inserts a node with
      `state='scheduled'`, `created_via='manual'`, full provenance.
- [ ] **AC-2** `transitionSiteVisit({id, target_state, reason?})`
      enforces the lifecycle: `scheduled → confirmed → completed`,
      `scheduled → no_show`. Writes audit `state_change` rows.
- [ ] **AC-3** `findUpcomingSiteVisits(hours_window)` returns visits
      whose `data.scheduled_at` is within `hours_window ± 15min`
      and `state='scheduled'`. Org-scoped under RLS.
- [ ] **AC-4** Server action `scheduleSiteVisit` writes via the
      service-role client, but checks `getCurrentUser().organization_id`
      first. Cross-tenant `lead_id` returns "not found."
- [ ] **AC-5** `siteVisitWindowSweep` is registered in
      `src/app/api/inngest/route.ts` and runs every 15 minutes.
      Each scan emits one `site_visit.window` event per matching
      visit.
- [ ] **AC-6** Reminder agent's T2 ceiling is enforced by the
      runtime (D-009 pattern). Attempting T3 throws.
- [ ] **AC-7** Reminder agent writes an `activity` node `kind='whatsapp'`,
      label `"Reminder · ${visit.label}"`, and an audit row
      `actor_type='agent'`, `agent_tier='T2'`,
      `prompt_version='v1'`.
- [ ] **AC-8** D-03 + D-04 directives in the seed (D-011) fire on
      `site_visit.window` events with `hours_until=24` and
      `hours_until=2`, respectively, dispatching `send_template_message`
      with `template_id='T-12'` / `'T-13'`.

### Tests

- [ ] **AC-9** Vitest covers: createSiteVisit happy + invalid; valid
      transitions; reminder-agent payload parsing; window-sweep
      time-bucket logic.
- [ ] **AC-10** Coverage 80/90 on `src/lib/sitevisits/**` and
      `src/lib/agents/site-visit-reminder.ts`.

---

## Non-goals

- Real Google Calendar OAuth + slot-block. The PRD calls it but
  V0 ships templated reminders and a placeholder `data.calendar_event_id`
  field. Real OAuth is V1.
- Real outbound WhatsApp send. Same as D-011 — the activity row
  is the canvas record; provider send is D-016+.
- Visit-coordinator assignment UX. The schema already carries
  `coordinator_id`; the assignment UI lands later.
