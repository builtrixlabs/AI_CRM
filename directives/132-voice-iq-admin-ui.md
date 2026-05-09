# Directive 132 — `/admin/integrations/voice-iq` UI

**Kind:** feature (V2 / Phase A)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-132 — *the money shot of Phase A*
**Authority:** Constitution II (tenant isolation), III (provenance), IV (audit), VII (stack discipline), IX (canvas-as-interface — admin surface is the documented exception)
**Builds on:** D-016 (super-admin secret pattern), D-130 (event inbox v2), D-131 (event_kinds router)

---

## Problem

D-130 and D-131 ship the consumption side end-to-end. There is no operator-facing surface for an org_admin to:
- Get the inbox URL to paste into Voice IQ's CRM connector.
- See / rotate the per-org HMAC inbox secret.
- Send a test webhook ping to verify the round-trip.
- Read the last N delivery log rows.

D-132 fills that gap: a single page at `/admin/integrations/voice-iq` that makes the integration story landable in a 60-second demo segment.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New table `org_integration_secrets` (org_id × kind composite PK) — additive migration, RLS scoped to `app_org_id()`. Redacted view exposes only `last4` + `rotated_at`.
- [ ] **AC-2** New permission `integrations:voice_iq:manage` added to the catalog and granted to `org_owner` + `org_admin` base roles.
- [ ] **AC-3** Page `/admin/integrations/voice-iq` (Server Component) renders three sections:
  - **Connection** card — read-only inbox URL with copy button + secret last4 badge + "Rotate secret" button.
  - **Test ping** card — button that POSTs a synthetic v2 envelope to `/api/events/inbox` and surfaces latency + status.
  - **Delivery log** table — last 50 `event_inbox_log` rows filtered by `source_product='voice_iq'` and the caller's `organization_id`.
- [ ] **AC-4** Server action `rotateVoiceIqSecret` — generates a 64-char hex secret (32 bytes), upserts via service-role admin client (RLS bypassed), invalidates secret cache, writes `audit_log(action='voice_iq_secret_rotated')`. Idempotent for spam-clicks (rate-limit by `last_rotated_at < 5s ago` → soft refuse with toast).
- [ ] **AC-5** Server action `pingVoiceIqInbox` — generates a synthetic `call.audited` v2 envelope with `event_id='ping-<uuid>'`, signs with current org secret using HMAC-SHA256, fetches `${BUILTRIX_APP_URL ?? '<host>'}/api/events/inbox`, returns `{status, latency_ms, body_preview}`. Audit-logged.
- [ ] **AC-6** Inbox route (`src/app/api/events/inbox/route.ts`) tweaks signature verification: peek at envelope.organization_id, look up per-org secret first; fall back to platform-default `builtrix_event_inbox_secret` for backward compatibility.
- [ ] **AC-7** RBAC gating: page redirects to `/403` if caller lacks `integrations:voice_iq:manage`. Server actions return `{ ok: false, error: 'permission' }` for the same condition.
- [ ] **AC-8** Cross-tenant: page reads only the caller's org row; service-role write actions verify `user.org_id === target_org_id` before any write.
- [ ] **AC-9** Cmd+K palette gains an entry: "Voice IQ integration" → `/admin/integrations/voice-iq` (extends D-008 catalog).
- [ ] **AC-10** Admin layout left-nav gets a "Integrations · Voice IQ" link — visible only when permission grants it.

## Tests

- [ ] **AC-11** Unit tests for `rotateVoiceIqSecret`: happy path (writes secret + last4 + audit row), permission denial, soft rate-limit on rapid double-call.
- [ ] **AC-12** Unit tests for `pingVoiceIqInbox`: happy path (returns 2xx + latency_ms), records audit row.
- [ ] **AC-13** Unit tests for `getVoiceIqSecret(org_id)` lookup helper: returns secret when set, null when unset.
- [ ] **AC-14** Inbox route test: per-org secret takes precedence over platform default.
- [ ] **AC-15** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Replay button on delivery log rows — UI stub only with disabled tooltip; full replay action is V3.
- Admin queue for unresolved events (lookup-failed AnalysisRecords) — that's part of D-134's lookup endpoint scope.
- Multi-org bulk integration view (super-admin) — V3.
- Custom HMAC header name — fixed at `x-builtrix-signature` (existing convention).

## Stack

Next.js 16 + shadcn/ui (Card, Button, Badge, Input, Table, Dialog) + Supabase service-role for writes + Constitution III provenance + sonner toast for action feedback.
