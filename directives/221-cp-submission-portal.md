# Directive 221 — `/cp` Channel Partner submission portal stub

**Kind:** feature (V2 / Phase C — real-estate showcase)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §5 D-221
**Authority:** Constitution II (tenant isolation), III (provenance), IV (audit), middleware route-policy (D-001 surface separation)
**Builds on:** D-001 (channel_partner base role + RLS), D-007 (createLead + lead state machine), D-011 (DOE D-11: cp.lead_submitted)

---

## Problem

`channel_partner` is one of nine base roles, and per PRD §5 it's a first-class actor in real-estate sales motion (independent brokers feeding leads). Today CPs land on `/dashboard` like any operational role and have no dedicated submission surface. Real-estate customers expect a CP portal as a distinct surface.

D-221 ships a minimal `/cp` portal: lead-submit form + my-submissions list. Demo-scope only — no commission tracking, no multi-stage approval.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New surface `/cp` (route group `(cp)`). Layout: branded header "Channel Partner Portal", left nav with "Submit lead" + "My submissions". `landingFor()` returns `/cp` for `base_role='channel_partner'`.
- [ ] **AC-2** Route-policy update: channel_partner role allowed under `/cp` and `/dashboard` (read-only); blocked from `/admin`, `/platform`, `/settings`. Other roles can preview `/cp` (no break) but it's CP-themed.
- [ ] **AC-3** `/cp/page.tsx` redirects to `/cp/submit` (default landing).
- [ ] **AC-4** `/cp/submit/page.tsx` Client Component form: name, phone (required), email, source_property (free text), expected_budget (numeric or free), notes. Submit calls server action.
- [ ] **AC-5** `/cp/submissions/page.tsx` Server Component: lists leads where `data.custom.cp_submitted_by === user.id`. Columns: created, phone, source_property, status badge.
- [ ] **AC-6** Server action `submitCpLeadAction`: gates on `base_role==='channel_partner'`, calls `createLead` with `source='channel_partner'`, then a follow-up `updateNodeData` to attach `data.custom.cp_submitted_by`, `data.custom.cp_status='pending'`, `data.custom.source_property`, `data.custom.expected_budget`.
- [ ] **AC-7** Submission landing fires DOE D-11 (`cp.lead_submitted`) — already seeded — which routes to the CP coordinator. Verified by audit_log row from D-11's `notify_user` action.
- [ ] **AC-8** Workspace assignment: CP user typically has no app_role assignment. The action picks the org's first non-deleted workspace as the lead's home; if none exists, returns `{ ok: false, error: 'no_workspace' }` with a helpful message.
- [ ] **AC-9** Cross-tenant guard: `submitCpLeadAction` reads `user.org_id`; lead is created in that org only. CP cannot target another org via URL forge.
- [ ] **AC-10** Page exists for non-CP roles too — surfaces a friendly "you're not a channel partner" empty state if the role doesn't match (so demos can navigate freely).

## Tests

- [ ] **AC-11** Unit test for `submitCpLeadAction`: happy path (creates lead, attaches CP custom fields), permission denied for non-CP, no_workspace error path.
- [ ] **AC-12** Lead-list query test: returns only the caller's submissions, scoped to their org.
- [ ] **AC-13** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Commission tracking + payout schedules — V3 (PRD §5).
- Multi-stage approval (CP-Coordinator → senior approval) — V3.
- Lead-quality score on CP submissions — V3.
- Bulk import — V3.
- CP onboarding flow (today CP rows are seeded by org_admin via D-018 users page) — V3.

## Stack

Next.js 16 route group + shadcn/ui (Card, Input, Button, Badge, Table) + existing `createLead` + `updateNodeData` + Constitution III provenance.
