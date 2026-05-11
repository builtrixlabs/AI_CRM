# Directive 415 — Follow-up Agent per-channel dispatch (auto-send on approve)

**Kind:** feature (V4 / PRD v3.0 D-115 delta — auto-delivery layer over D-322's queue)
**Status:** AUTHORIZED — operator approved 2026-05-11 ("implement 415, defer 422")
**Branch target:** `v4`
**Source:** `docs/PRD-v3.0.md` §3 P7; `docs/V4_STATUS.md` (D-115 partial).
**Builds on:** D-322 (agent_approval_queue + approve/reject flow), D-418 (comms adapter shells: telephony/email/sms registries + mock providers), D-002 (nodes/edges/audit_log).

---

## Problem

D-322 ships the T2 Follow-up Agent + approval queue but explicitly leaves "actual outbound delivery on approve" for V3.x — the operator approves a draft and the row sits at `status='approved'`; org-admin manually sends via WhatsApp/email surfaces. Now that D-418 lands the email/SMS adapter shells, **we can wire auto-send through the adapter layer** without committing to any specific live provider.

D-415 ships:
1. Migration extension: `agent_approval_queue.channel` accepts `'sms'` in addition to `'whatsapp'|'email'`; add `sent_at`, `provider`, `provider_message_id`, `send_error` columns (additive).
2. `src/lib/agents/follow-up/dispatch.ts` — given an approved queue row, fetch the lead's recipient (phone or email), pick the per-channel adapter via `comms.<channel>.getProvider('mock')`, call `.send()`, transition status to `'sent'` on success or record the error.
3. Hook into `approveQueueItemAction` — after the existing approve update, call `dispatchApprovedDraft`. If dispatch succeeds, status moves `approved → sent`. If dispatch fails, leave status at `approved` and surface the error in the UI.
4. Activity-node creation: every successful dispatch writes a `node_type='activity'` linked to the lead via `edges`, with `data.channel`, `data.provider`, `data.queue_id`.
5. Tests for the dispatch flow.

WhatsApp is **explicitly deferred to the BSP-integration directive** — until D-418-style WhatsApp adapter exists, the `whatsapp` channel path returns `not_configured` cleanly and the queue row stays at `approved` (operator falls back to manual send via existing WhatsApp surfaces, exactly as before).

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Migration `<ts>_agent_approval_queue_dispatch.sql`:
  - Drop + recreate `agent_approval_queue_channel_chk` to add `'sms'`.
  - Add columns: `sent_at timestamptz NULL`, `provider text NULL`, `provider_message_id text NULL`, `send_error text NULL`.
  - All additive. Idempotent on re-apply.

- [ ] **AC-2** New lib `src/lib/agents/follow-up/dispatch.ts`:
  - `dispatchApprovedDraft({ queue_id, organization_id, actor_id })` — server-side function:
    - Fetches the queue row by id + org (cross-tenant guard).
    - Asserts `status='approved'`. Idempotent — if already `'sent'`, returns `{ ok: true, already_sent: true }`.
    - Loads the lead's `data` to find recipient: `data.email` for email, `data.phone` for sms, `data.phone` for whatsapp.
    - Channel routing:
      - `email` → `comms.email.getProvider('mock').send({ kind: 'custom', ... })`. (Templated send becomes V2 once templates table exists.)
      - `sms` → `comms.sms.getProvider('mock').send({ kind: 'templated', template_id: 'follow_up_default', ... })`. Mock pre-registers `follow_up_default` for V1.
      - `whatsapp` → returns `{ ok: false, reason: 'not_configured' }` cleanly without throwing.
    - On success: updates queue row to `status='sent'`, `sent_at=now()`, `provider`, `provider_message_id`; writes activity node + edge; writes audit row.
    - On error: updates `send_error` column; status stays `approved`; writes audit row with `action='agent_draft_send_failed'`.
  - Returns a discriminated result type.

- [ ] **AC-3** SMS DLT template registration shim: `src/lib/agents/follow-up/dlt.ts` exports `FOLLOW_UP_DLT_TEMPLATES` constant. The mock provider registers them on instantiation (D-418's `MockSmsProvider.registerTemplate`). When a live SMS provider lands, the org_admin registers the same DLT ids in the operator dashboard.

- [ ] **AC-4** `approveQueueItemAction` modified — after the existing approve update, calls `dispatchApprovedDraft`:
  - If dispatch returns `{ ok: true }`: revalidate, return `{ ok: true }` (status now `'sent'` in DB).
  - If dispatch returns `{ ok: false, reason: 'not_configured' }` (WhatsApp today): revalidate, return `{ ok: true, dispatch: 'deferred' }` — UI shows "approved, awaiting manual send".
  - If dispatch returns `{ ok: false, reason: <error> }`: revalidate, return `{ ok: false, error: 'internal', message: <reason> }`. Row stays at `'approved'`.

- [ ] **AC-5** Activity node payload on successful send:
  - `node_type='activity'`
  - `label='Follow-up sent · <channel>'`
  - `data = { kind: 'comms_sent', channel, provider, queue_id, provider_message_id }`
  - Edge from the activity to the lead: `edge_type='describes'`.

- [ ] **AC-6** Audit-log entries:
  - On dispatch success: `action='agent_draft_sent'`, `diff: { channel, provider, queue_id }`.
  - On dispatch failure: `action='agent_draft_send_failed'`, `diff: { channel, reason }`.
  - On WhatsApp deferral: `action='agent_draft_send_deferred'`, `diff: { channel: 'whatsapp', reason: 'not_configured' }`.

- [ ] **AC-7** Tests `tests/lib/agents/follow-up/dispatch.test.ts`:
  - Email dispatch happy path: queue row transitions to `sent`, mock email provider records the send, activity node + audit row written.
  - SMS dispatch happy path with registered DLT template.
  - SMS dispatch with unregistered template → `template_not_found` → status stays `approved`, `send_error` recorded.
  - WhatsApp dispatch returns `not_configured` cleanly without throwing.
  - Cross-tenant queue id → not found.
  - Already-sent row → idempotent return without re-sending.
  - Missing recipient (no phone for sms, no email for email) → `invalid_args` error path.

- [ ] **AC-8** No new permission — `agents:view_activity` (existing) gates the queue page + approve action.

- [ ] **AC-9** All 10 V4 stopping-criteria gates pass.

---

## Non-goals (deferred)

- **WhatsApp BSP wiring** — own future directive once §10.3 picks AiSensy/Gupshup/Cloud API + creds land.
- **Per-org provider selection UI** — V1 hardcodes `'mock'`; live provider selection lands in D-016 super-admin / org integration_secrets layer.
- **Template-id catalog UI** — V1 uses a constants array (`FOLLOW_UP_DLT_TEMPLATES`); operator dashboard editor is V2.
- **Templated email** — V1 sends `kind: 'custom'` with subject derived from agent_kind + body from `edited_body || draft_body`. Templated email lands when templates table exists (V2 / D-016 surface).
- **Retry-on-transient-failure** — D-415 records the error and stops; no auto-retry. Operator can re-approve. V2 wires a retry queue.
- **D-415 sub-component: D-322 T3 LLM follow-up agent** — that's a separate directive (D-416) and was operator-explicitly-deferred ("D-322 T3 LLM follow-up agent — Needs operator-provided LLM key... Deferred to V3.x part 2" per V3X_STATUS).

---

## Stack

- Migration: `supabase/migrations/<ts>_agent_approval_queue_dispatch.sql`.
- New: `src/lib/agents/follow-up/{dispatch,dlt}.ts`, `tests/lib/agents/follow-up/dispatch.test.ts`.
- Modified: `src/app/(admin)/admin/agents/queue/actions.ts` (calls dispatch from approve action).
- Reuses: `src/lib/comms/{email,sms}` (D-418), `src/lib/supabase/admin`, `audit_log`/`nodes`/`edges` patterns.

---

## Authority

- Constitution I — agents are colleagues with bounded tier authority. T2 = templated + queues for approval; operator's explicit `approve` is the human gate before sending. ✓ this directive preserves the gate.
- Constitution III — provenance: activity node + audit row on every send.
- PRD §3 P2 — channel-by-channel.

---

## Operator follow-ups (post-merge)

- [ ] `node scripts/apply_migration.mjs supabase/migrations/<file>.sql` on the parent project root.
- [ ] `node scripts/verify_d415.mjs` to confirm the column additions + CHECK constraint changes.
- [ ] Smoke at `/admin/agents/queue`: approve a pending draft → row transitions `pending → approved → sent` in one click; check the lead's activity stream shows "Follow-up sent · email".
- [ ] When WhatsApp BSP is wired: add a WhatsApp adapter (parallel to D-418's email/SMS shells), then re-enable the whatsapp path in `dispatch.ts` (currently `not_configured`).
- [ ] When org configures a live provider (post-D-418-followups): replace the hardcoded `'mock'` provider id with a per-org lookup from `agent_org_configs` or `integration_secrets`.

---

## Risks & decisions

- **Hardcoded `'mock'` provider:** during V4 horizon, mock is the only registered provider per channel. Production safety: if an org has a real recipient address (live phone/email), sending to mock means the message is recorded internally and **not delivered to the buyer**. This is acceptable for V4 dev/internal testing; pilot orgs MUST wait until a live provider is registered before approving real follow-ups.
- **Idempotency:** the `pending → approved → sent` transitions are NOT retryable in this directive. If dispatch fails mid-flight (after row updated to `approved` but before `sent`), operator must re-approve or manually mark `sent`. Retry-queue is V2.
- **DLT template ownership:** the `FOLLOW_UP_DLT_TEMPLATES` constants live in source; if an org needs different copy, that's a UI directive (V2). For V4, every org uses the same default templated SMS.
- **Activity node visibility:** activities show on the lead canvas activity stream (D-007) immediately. No special permission gating beyond `leads:view`.
