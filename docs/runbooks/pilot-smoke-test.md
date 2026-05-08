# Pilot Smoke Test (V0)

**Audience:** Builtrix operator, run after `pilot-onboarding.md`
completes step 4.
**Purpose:** Assert every V0 capability against a real pilot
org before declaring V0 acceptance.
**Pass condition:** All 14 checks below report ✓.

---

## 1. Tenant isolation (Constitution II)

**Setup:** Have two orgs provisioned (the real pilot + a throw-
away "demo-org" via `scripts/seed-pilot-org.sh`). Have a
sales_rep in each.

**Check 1.1 — Cross-tenant lead invisible**
- As demo-org rep, copy a pilot-org lead URL
  (`/dashboard/leads/<pilot-lead-id>`).
- Open as the demo-org rep.
- Expect: 404 / "lead not found" page (NOT a permission denied
  banner — Constitution II says cross-tenant existence is not
  leaked).

**Check 1.2 — RLS holds on `nodes`**
- As demo-org rep, hit the canvas data API with a pilot-org
  `lead_id`. Expect 0 rows.

---

## 2. Lead lifecycle (D-007)

**Check 2.1 — Create flow**
- New lead via Cmd+K → "Create lead." Fill phone + source.
- Within 10s, Lead canvas renders with state="new".

**Check 2.2 — State transitions**
- Click "Move to contacted" — state updates, audit row written.
- Click "Move to qualified" — same.
- Try moving back to "new" — disallowed (no button surfaces).

**Check 2.3 — Terminal state requires reason**
- Click "Mark lost." Modal asks for reason. Submit. Audit row
  carries `diff.reason`.

---

## 3. Canvas activity stream (D-006 + D-010)

**Check 3.1 — Manual activity**
- Use the rep's UI to add a manual note (or wait for an agent
  action).
- Activity Stream renders the new row within 2s (Realtime).

**Check 3.2 — WhatsApp inbound**
- Send a curl POST to `/api/webhooks/whatsapp` with a valid
  HMAC signature, body matching the `WhatsAppInboundPayload`
  shape, `from_phone` matching a lead's `data.phone`.
- Within 2s, the lead's canvas shows a new `whatsapp` activity.
- `whatsapp_inbound_log` row with `status='ok'`.

**Check 3.3 — WhatsApp dedup**
- Re-POST the same payload. Response: `{deduped: true}`. No
  second activity row. `whatsapp_inbound_log` row with
  `status='deduped'`.

---

## 4. Cmd+K (D-008)

**Check 4.1 — Open + filter**
- Press `Cmd+K`. Palette opens. Type "lead" — list filters.
- Select "Open lead by name…" → search → pick a result →
  navigate happens.

**Check 4.2 — Permission gating**
- As `sales_rep`, no `/platform` commands should appear.
- As `super_admin`, no `/dashboard` operational commands appear.

---

## 5. Lead Enrichment Agent (D-009)

**Check 5.1 — Agent runs on lead.created**
- Create a fresh lead.
- Within 30s: an `audit_log` row with `actor_type='agent'`,
  `agent_tier='T1'`, `prompt_version='v1'`,
  `compiled_artifact.score` set.
- Lead's `data.intent_score` updated.

**Check 5.2 — Tier ceiling enforced**
- Manually invoke the agent runtime with `attempted_tier='T3'`
  via a SQL or curl test. Expect: `TierCeilingExceededError`
  thrown; no audit row written.

---

## 6. Site Visit reminder cron (D-012)

**Check 6.1 — Cron fires**
- Inngest dashboard shows `site-visit-window-sweep` runs every
  15 min.

**Check 6.2 — Reminder activity created**
- Schedule a site visit for ~24h from now.
- Wait for the next cron tick (or manually trigger via Inngest
  dashboard).
- Within 2 minutes: an `activity` node `kind='whatsapp'`,
  `data.custom.template_id='T-12'` attached to the lead.
  `audit_log` row with `agent_tier='T2'`.

---

## 7. DOE engine (D-011)

**Check 7.1 — D-15 fires on walk-in**
- Create a lead with `source='walkin'`.
- Within 30s: `directive_invocations` row with `code='D-15'`,
  `outcome='dispatched'`.

**Check 7.2 — D-09 fires on call.objection_detected**
- POST `/api/events/inbox` with envelope
  `event_kind='call.objection_detected'`, `payload.objection='price'`.
- Within 5s: `directive_invocations` row with `code='D-09'`,
  `outcome='dispatched'`. A `note` node with
  `data.custom.directive_code='D-09'` attached to the lead.

**Check 7.3 — Idempotency**
- Re-POST the same `event_id`. Response: `{deduped:true}`.
  Second `directive_invocations` row with
  `outcome='skipped_idempotent'`.

---

## 8. Audit log immutability (Constitution IV)

**Check 8.1 — UPDATE rejected**
- As service_role, run
  `UPDATE audit_log SET reasoning='hax' WHERE id = ANY (SELECT id FROM audit_log LIMIT 1);`.
  Expect:
  `ERROR: audit_log is append-only; UPDATE rejected (Constitution IV)`.

**Check 8.2 — DELETE rejected**
- Same with `DELETE FROM audit_log WHERE id = ...`. Expect the
  same trigger error.

---

## 9. Token budget + ledger (D-009)

**Check 9.1 — Ledger row per call**
- After Check 5.1, `token_usage_ledger` shows a row with the
  agent_id, `call_kind='complete'`, `status='ok'`, non-zero
  `tokens_in/out`.

**Check 9.2 — Soft-warn at 80%**
- Manually backfill ledger rows to ~80% of `MONTHLY_TOKEN_CAP`.
- Trigger one more agent call.
- Result envelope carries `warnings: ['budget-80']`.

---

## 10. Cross-product event bus (D-013)

**Check 10.1 — Schema rejection**
- POST a malformed envelope (missing `event_id`).
- Response: 400 `missing_event_id`. `event_inbox_log` row with
  `status='rejected'`.

**Check 10.2 — Cross-tenant lead rejected**
- POST a `call.audited` event with `lead_id` from another org.
- Response: 400 `lead not found`. No `nodes` row inserted.

---

## Pass / fail

All 14 numbered checks must pass before declaring V0 accepted.

If any fails:
1. Stop the pilot.
2. File an issue tagged `pilot-blocker`.
3. Patch on a hotfix branch off `v1`.
4. Re-run the failing check group; full smoke test only if the
   patch touches load-bearing code.
