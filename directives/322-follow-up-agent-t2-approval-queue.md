# Directive 322 — Follow-up Agent T2 + approval queue

**Kind:** feature (V3 / Phase C — closes Phase C)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Branch target:** `v2`
**Source:** `docs/plans/v3-plan-v1.md` §5 D-322
**Builds on:** D-009 (agent runtime + token budget), D-012 (T2 templated agent pattern)

---

## Problem

We've shipped agent infrastructure (D-009/D-019) but no T2 agent that auto-drafts comms for org-admin review. Real-estate sales reps lose leads to the gap between first contact and follow-up; an agent that drafts a templated nudge and queues it for approval makes that gap visible + actionable.

## Success criteria (production target 80/90)

- [ ] **AC-1** Migration `<ts>_agent_approval_queue.sql`: `agent_approval_queue(id, organization_id, workspace_id, lead_id, agent_kind, channel, draft_body, edited_body, status, created_at, created_by_agent_id, decided_at, decided_by, decision_reason)`. Status state machine: `pending → approved | rejected → sent`. Channel `whatsapp | email`. Tenant SELECT RLS via `app_org_id()`; mutations via service-role only.
- [ ] **AC-2** Partial UNIQUE INDEX on `(organization_id, lead_id, agent_kind) WHERE status='pending'` — at most one open draft per (lead, agent_kind), so re-running the agent on the same stale lead is benign 23505.
- [ ] **AC-3** `src/lib/agents/follow-up-stale-lead.ts` — pure templated draft (`tier-2-templated-no-gateway` pattern, no `gateway.complete()`). Trigger: lead state in `(new, contacted)` AND `last_contact_at` (or `created_at` fallback) > 7 days. Channel: `whatsapp` if valid phone, else `email`.
- [ ] **AC-4** Inngest cron `0 */6 * * *` UTC scans every org → enqueues drafts.
- [ ] **AC-5** `/admin/agents/queue` page lists pending drafts, with approve / edit-and-approve / reject (with reason) actions. All decisions audit-logged.
- [ ] **AC-6** Permission: `agents:view_activity` (already exists) gates the page + actions.
- [ ] **AC-7** Tests on the pure draft builder, the stale-lead query, the enqueue helper (incl. duplicate-pending detection).
- [ ] **AC-8** Coverage on touched files: ≥80% lines / ≥90% branches.

## Non-goals (deferred to V3.x)

- **Actual outbound delivery** on approve — v3 MVP marks `status='approved'`; org-admin manually sends via existing channel surfaces. V3.x wires automatic delivery via D-010 WhatsApp + D-005 email.
- **LLM-personalised drafts** — T3 agent that calls `gateway.complete()`, V3.x.
- **Per-org token-budget cap on agent runs** — D-322 stops when stale-lead query is empty; budget accounting hooks land V3.x.
- **Stale-lead Watcher (T0) variant** — auto-flag at 14 days without admin involvement, V3.x.
- **Multi-agent orchestration** — one agent kind for v3 MVP.

## Stack

- No new runtime deps. Reuses existing Inngest + Supabase client.

## Authority

- Constitution I — Bounded Authority (T2 = templated, queues for approval; no autopilot).
- Supersedes: v3 plan §5 D-322 spec mention of "templated prompt using D-009 model gateway" — adopting the established `tier-2-templated-no-gateway` pattern from D-012 instead. T3 with the gateway is V3.x.

## Operator follow-ups (post-merge)

- [ ] Apply migration; first run at next 6h cron tick.
- [ ] Smoke: org_admin opens `/admin/agents/queue` after a stale lead exists, sees draft, edit-and-approves; audit_log shows `agent_draft_approved`.
- [ ] Wire actual WhatsApp/email delivery on `status='approved'` → `status='sent'` in V3.x.
