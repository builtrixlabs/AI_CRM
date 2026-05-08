# Directive 010 — WhatsApp inbound webhook + Activity Stream wiring

**Kind:** feature
**Status:** AUTHORIZED — Plan Mode (Gate 2) approved (operator: assume-approve)
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-010 + docs/PRD.md §6 + Constitution III, IV, VII
**Authority:** memory/constitution.md (Principles II tenant isolation via service-role + explicit org filter, III provenance with `created_via='whatsapp'` + `source_event_id`, IV append-only audit, VII PII masking in logs)
**Builds on:** D-001 (auth/RLS), D-002 (nodes + edges + activity schema), D-006 (Activity Stream component), D-007 (lead lookup by phone), D-009 (PII masking in `nodes/text.ts`)
**Stack:** branched off `v1` directly (D-006/D-007/D-008/D-009 already merged).

---

## Problem

The Lead canvas (D-006) has an `<ActivityStream>` already wired to
Supabase Realtime, but the only producer is whatever a sales rep
manually types. PRD §6.4 (Activity Stream) and the constitution
III provenance contract both name **`whatsapp` as a first-class
`created_via`**. Without an inbound webhook, every WhatsApp
conversation lives outside the CRM — exactly the failure mode this
product was built to fix.

D-010 closes that loop:

1. **`/api/webhooks/whatsapp`** — POST endpoint that ingests WhatsApp
   inbound messages. **Idempotent by `wa_message_id`** so retries from
   the provider don't duplicate activity nodes.
2. **`upsertActivityFromWhatsApp(...)`** — the server-side helper
   that resolves the lead (by phone), creates an `activity` node
   with `kind='whatsapp'` + provenance + the `mentioned_in` edge
   to the lead, returns `{activity_id, lead_id, deduped}`.
3. **`whatsapp_inbound_log`** — append-only ledger of every webhook
   payload (raw + processed result + dedup status), so on-call can
   replay without spelunking provider logs.
4. **PII-masked execution log** — every webhook write goes through
   `maskPii()` from D-009 before it lands in `memory/logs/` (the
   raw body never lives in plaintext logs; the activity row's
   `data.body` keeps the original — the canvas needs it).
5. **`<ActivityStream>` end-to-end check** — adding an integration
   test that pushes a webhook → asserts a realtime-capable row lands
   on `nodes` → asserts the canvas SELECT picks it up.

---

## Success criteria

### Webhook contract

- [ ] **AC-1** `POST /api/webhooks/whatsapp` accepts a JSON body
      `{ wa_message_id, from_phone, to_phone, body, ts, raw? }` and
      returns `{ ok: true, deduped: boolean, activity_id?, lead_id? }`
      on success.
- [ ] **AC-2** Idempotent by `wa_message_id` — second POST with the
      same id returns `deduped: true` and never inserts a second
      `activity` node.
- [ ] **AC-3** Verifies a HMAC-SHA256 signature header
      (`x-wa-signature`) against `WHATSAPP_WEBHOOK_SECRET`. Mismatch
      → 401, no DB writes.
- [ ] **AC-4** Missing fields → 400. Malformed JSON → 400. Both
      branches log to `whatsapp_inbound_log` with `status='rejected'`
      and `reason`.
- [ ] **AC-5** Lead lookup is **phone-based** + tenant-aware. The
      route resolves the workspace by an `organization_id` URL query
      param OR a per-org pre-shared secret in
      `org_whatsapp_endpoints` (PRD §10 sister-product config).
      Cross-tenant phones are NOT joined.
- [ ] **AC-6** When no matching lead exists → still inserts the
      activity into a workspace-default "inbox" lead OR creates an
      orphan activity (configurable per org). Default: orphan, with
      `subject_node_id` pointing to a system-owned `inbox` node so
      the schema's `subject_node_id` requirement holds.
- [ ] **AC-7** Provider PII (phone, body) is **masked** in
      `memory/logs/execution/*.jsonl`. The DB row keeps the original.

### Activity node + edge

- [ ] **AC-8** Activity node carries `created_via='whatsapp'`,
      `source_event_id=<wa_message_id-uuid>`, and `data.kind='whatsapp'`,
      `data.subject_node_id=<lead_id|inbox_id>`,
      `data.summary='WhatsApp from <masked phone>'`, `data.body=<raw>`.
- [ ] **AC-9** A `mentioned_in` edge from the activity → the lead is
      created in the same transaction (or batch). When the activity
      lands on the inbox node, no edge is created.
- [ ] **AC-10** Realtime: subscribers on `canvas:lead:<lead_id>`
      receive an INSERT row (Supabase publication on `nodes` already
      enabled in D-006).

### Append-only ingestion log

- [ ] **AC-11** Every webhook POST writes one row to
      `whatsapp_inbound_log` (id, wa_message_id, status, reason?,
      activity_id?, lead_id?, organization_id?, ts). Append-only via
      trigger (D-001.10 pattern).

### Audit log

- [ ] **AC-12** One `audit_log` row per non-deduped insert with
      `actor_type='system'`, `actor_role='whatsapp_webhook'`,
      `action='whatsapp_inbound'`,
      `compiled_artifact={wa_message_id, lead_id, masked_from}`.
      Deduped POSTs do NOT write audit rows.

### Tests + coverage

- [ ] **AC-13** Vitest covers: signature mismatch, malformed JSON,
      missing `wa_message_id`, dedup path, orphan path, lead-found
      path, PII-mask correctness in log strings.
- [ ] **AC-14** Integration test against the live test DB:
      `webhook → activity row visible to RLS-scoped canvas SELECT`.
- [ ] **AC-15** Coverage 80% lines / 90% branches. `@stretch`-tagged
      tests don't block.

---

## Non-goals

- Outbound WhatsApp send. Outbound is D-012 (Site Visit Reminder T2,
  templated) + D-?? (T3 custom outbound).
- WhatsApp Cloud API verification handshake (the `GET ?hub.challenge=`
  flow). The endpoint stays POST-only; the handshake is owned by the
  org_admin's integration UI scope (out of D-010).
- Media (image/voice) — V0 ships text only; media is V1.
- Free-form lookup beyond exact phone — the phone-to-lead match
  uses `data->>'phone' = $1`. Fuzzy matching is V1.
