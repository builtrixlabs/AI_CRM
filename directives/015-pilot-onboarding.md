# Directive 015 — Pilot onboarding (V0 acceptance gate)

**Kind:** operational + runbook (no functional features)
**Status:** AUTHORIZED — Plan Mode (Gate 2) approved (operator: assume-approve)
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-015
**Authority:** memory/constitution.md (every principle — pilot tests them all)
**Builds on:** D-001 → D-014 (V0 stack complete and hardened)

---

## Problem

V0 has shipped (D-001 → D-014). The platform compiles, tests
pass, RLS holds, the Lead canvas renders, the Cmd+K palette
opens, agents run with tier ceilings, the DOE engine fires, the
WhatsApp webhook + cross-product event inbox accept inbound, and
the V0 hardening pass closed the test suite gaps.

**Now V0 must prove it onto a real pilot org.**

D-015 is mostly operational — there is no new feature code.
Instead it ships:

1. **A pilot-onboarding runbook** (`docs/runbooks/pilot-onboarding.md`)
   that walks an operator through provisioning the first paying
   pilot org via the super-admin flow.
2. **A pilot smoke-test checklist** (`docs/runbooks/pilot-smoke-test.md`)
   that asserts every V0 capability against the live pilot.
3. **An optional seed script** (`scripts/seed-pilot-org.sh`) that
   automates the steps a super-admin would otherwise take in the
   `/platform/organizations/new` UI for a non-customer demo org
   (to validate the runbook before the real pilot).
4. **A "what to watch" monitoring note** at the end of the
   runbook — which dashboards / tables / Inngest functions to
   keep eyes on during the first week.

The pilot itself is a real-world test. Its outcome ratifies (or
rejects) D-001 through D-014. No code change here.

---

## Success criteria

- [ ] **AC-1** `docs/runbooks/pilot-onboarding.md` exists and
      walks an operator through: super-admin sign-in →
      provision org → provision first org_admin → onboarding
      wizard 8 steps → assign sales rep → first lead via
      Cmd+K → first canvas render.
- [ ] **AC-2** `docs/runbooks/pilot-smoke-test.md` exists with
      at minimum 12 numbered checks across:
      - tenant isolation (can't see another org's data)
      - lead lifecycle (create → contacted → qualified)
      - canvas activity stream (manual + WhatsApp inbound)
      - Cmd+K open + lookup + navigate
      - Lead Enrichment Agent run (audit row visible)
      - Site Visit Reminder cron (check Inngest dashboard)
      - DOE D-09 firing on `call.objection_detected`
      - audit_log immutability (UPDATE rejected)
      - Token budget warning at 80%
      - Rate limit kicks in after 100 dispatches
      - `whatsapp_inbound_log` deduplicates retries
      - `event_inbox_log` rejects malformed envelopes
- [ ] **AC-3** `scripts/seed-pilot-org.sh` exists; idempotent;
      uses the service-role client; exits non-zero on failure.
- [ ] **AC-4** Runbook references the V1 follow-ups list from
      `docs/architecture.md` so the pilot operator knows what's
      *intentionally missing* (real outbound WhatsApp, T3
      approval queue UI, custom NL directive authoring).

---

## Non-goals

- Any new schema, route, or library code.
- Real customer onboarding (the runbook is a tool; the pilot
  itself happens outside this directive).
- Performance tuning beyond what the V0 hardening pass (D-014)
  already locked in.
