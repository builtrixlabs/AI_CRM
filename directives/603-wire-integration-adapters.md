# Directive 603 — Wire integration adapters into agent dispatch (THE BIG ONE)

**Kind:** feature (V6 Phase 1, step 1.1 — the REWIRE that turns mockware into a live product)
**Status:** AUTHORIZED — operator cleared Phase 1 to begin 2026-05-14 ("Phase 1 … is cleared to begin … cut v6-phase-1 from v6 and follow §4")
**Branch target:** `v6-phase-1` (cut from `v6@dfc929d` on 2026-05-14)
**Generated:** 2026-05-14T07:20:28Z
**Source:** `docs/PRD-v6.0.md` §D-603 (lines 334-367); `docs/plans/v6-implementation-order.md` §3 + §4 step 1.1.
**Builds on:** D-415 (follow-up dispatch + `agent_approval_queue` send columns + `pickProvider` stub), D-418 (comms adapter shells + registries), D-432 (`instantiateWhatsAppAdapter` — Gupshup + Cloud API), D-433 (`instantiateTelephonyAdapter` — Exotel), D-434 (`instantiateEmailAdapter` — Resend), D-435 (`instantiateSmsAdapter` — MSG91 + DLT), D-439 (per-org integrations health index + `_redacted` views).

---

## Problem

D-415 wired the follow-up agent's approve → auto-send path, but `pickProvider(channel)` in `src/lib/agents/follow-up/dispatch.ts:50` is hardcoded to `return "mock"`. Every approved draft is "sent" to the in-memory mock provider — recorded internally, **never delivered to the buyer**. D-432–D-435 then shipped real per-org adapters (`instantiate{Channel}Adapter(row)`), each reading an encrypted-credentials row from `org_{channel}_config` and constructing the live provider — but **nothing calls them from the dispatch path**. Per the V6 audit, this is the single biggest gap: per-org integration credentials get stored but never read at send time. WhatsApp is worse — `dispatch.ts:87-100` hard-defers it, returning `not_configured` without even attempting a send.

D-603 closes the loop: replace `pickProvider` with real per-org adapter resolution, wire WhatsApp into dispatch, and surface a clear "configure your integration" message when an org has no credentials. No new tables, no migration — the adapter helpers and config tables already exist; this directive is pure wiring.

D-603 ships:
1. **New resolver** `src/lib/comms/resolve-org-adapter.ts` — per-channel: read the org's `org_{channel}_config` row via the service-role admin client (full row incl. `encrypted_credentials`), call the existing `instantiate{Channel}Adapter(row)`, and return a discriminated result `{ ok: true, adapter, provider } | { ok: false, reason: 'not_configured' }`. Catches `CommsError('not_configured')` (thrown when `is_active=false`) and treats a missing row as `not_configured`. Generic across all four channels so D-609 (telephony click-to-call) reuses it.
2. **`dispatch.ts` rewrite** — delete `pickProvider`; email + sms branches resolve the real adapter via the new resolver instead of `comms.<channel>.getProvider('mock')`; the `provider` recorded on the activity node / queue row / audit row becomes the real provider id (`resend`/`msg91`/`gupshup`/`cloud_api`, or `mock` under test).
3. **WhatsApp wired** — remove the `dispatch.ts:87-100` hard-defer block; the `whatsapp` channel resolves a real adapter via `instantiateWhatsAppAdapter` and sends through an approved template (BSPs reject freeform business-initiated messages — parallels the SMS DLT path). No config / no approved template → `not_configured`, same as email/sms.
4. **`not_configured` UX** — `approveQueueItemAction` already maps `not_configured` → `{ ok: true, dispatch: "deferred" }`; extend the result so the queue UI renders a channel-specific message: "Configure your <channel> integration to send this draft. Org admins can do this at /admin/integrations/<channel>."
5. **Tests** — extend `tests/lib/agents/follow-up/dispatch.test.ts` (the existing "whatsapp deferred" test asserts behavior D-603 intentionally changes — it is **rewritten**, not kept green) + a cross-tenant integration test proving org A's adapter never receives org B's payload.

The D-415 retry contract is preserved verbatim: on provider error the queue row stays `approved` and `send_error` is recorded so the operator retries by re-approving. The Inngest delivery worker (D-311) is untouched.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** New `src/lib/comms/resolve-org-adapter.ts`:
  - `resolveOrgAdapter(channel, organization_id, client)` — for `'email' | 'sms' | 'whatsapp' | 'telephony'`:
    - SELECTs the full `org_{channel}_config` row (incl. `encrypted_credentials`) filtered by `organization_id` — the org filter is load-bearing tenant isolation on a service-role read.
    - Row missing → `{ ok: false, reason: 'not_configured' }`.
    - Row present → calls `instantiate{Channel}Adapter(row)`; catches `CommsError` with `kind='not_configured'` (the helper throws this when `is_active=false`) → `{ ok: false, reason: 'not_configured' }`. Other `CommsError` kinds (`invalid_args`, `provider_unsupported`) propagate as `{ ok: false, reason: 'provider_error', message }`.
    - Success → `{ ok: true, adapter, provider }` where `provider` is the real provider id from the row.
  - SMS resolution accepts the caller-supplied `allowed_templates` set and threads it into `instantiateSmsAdapter`.
  - Discriminated-union return — no throwing across the call boundary.

- [ ] **AC-2** `src/lib/agents/follow-up/dispatch.ts` rewired:
  - `pickProvider` deleted.
  - `email` branch: `resolveOrgAdapter('email', org_id, client)` → on `not_configured`, return `{ ok: false, reason: 'not_configured', message: 'email' }` after writing the deferred audit row; on success, `adapter.send({ kind: 'custom', ... })` as today.
  - `sms` branch: `resolveOrgAdapter('sms', org_id, client, FOLLOW_UP_DLT_TEMPLATE_IDS)` → same `not_configured` handling; on success, `adapter.send({ kind: 'templated', template_id: FOLLOW_UP_DLT_TEMPLATES[0].id, ... })`. The mock-only `registerTemplate` duck-typing shim is removed — the real MSG91 adapter takes `allowed_templates` in its constructor.
  - `whatsapp` branch: the `:87-100` hard-defer block is deleted; `resolveOrgAdapter('whatsapp', org_id, client)` → on `not_configured`, return `{ ok: false, reason: 'not_configured', message: 'whatsapp' }` + deferred audit; on success, `adapter.send(...)` via an approved template.
  - `provider` written to the activity node `data.provider`, the `agent_approval_queue.provider` column, and the audit `diff.provider` is the **real resolved provider id**, not the literal `"mock"`.

- [ ] **AC-3** `not_configured` → operator-facing UX:
  - `dispatchApprovedDraft`'s `not_configured` result carries `message: <channel>` (already the WhatsApp convention; now also email + sms).
  - `approveQueueItemAction` maps `not_configured` → `{ ok: true, dispatch: 'deferred', channel: <channel> }`.
  - The queue UI renders, for a deferred row: "Configure your <channel> integration to send this draft. Org admins can do this at /admin/integrations/<channel>." — channel name and path interpolated, no dead generic copy.

- [ ] **AC-4** Audit-log entries:
  - Successful send: `action='agent_draft_sent'`, `diff: { channel, provider: <real id>, activity_id, provider_message_id }` (unchanged shape, real provider).
  - Provider error: `action='agent_draft_send_failed'`, `diff: { channel, provider, reason }`; queue row stays `approved`, `send_error` recorded.
  - No credentials: `action='agent_draft_send_deferred'`, `diff: { channel, reason: 'not_configured' }` — now emitted for email + sms too, not only whatsapp.

- [ ] **AC-5** Cross-tenant isolation: `resolveOrgAdapter` filters the config SELECT by the caller's `organization_id`; an integration test provisions org A + org B with distinct credentials and asserts a dispatch for an org-A queue row can only ever instantiate org A's adapter — org B's `encrypted_credentials` are never decrypted into an org-A send path.

- [ ] **AC-6** Tests `tests/lib/agents/follow-up/dispatch.test.ts` + `tests/lib/comms/resolve-org-adapter.test.ts`:
  - Existing dispatch unit tests pass (email happy path, sms happy path, missing-recipient × 2, cross-tenant `not_found`, idempotent already-sent, not-approved guard). The mock client gains an `org_{channel}_config` table handler so the resolver has a row to read; tests assert against the resolved provider id rather than the literal `"mock"`.
  - **Rewritten** whatsapp test: with a config row → resolves + sends; with no row → `not_configured` + deferred audit + row stays `approved` (the old "always deferred" assertion is removed).
  - New resolver tests: missing row → `not_configured`; `is_active=false` row → `not_configured`; valid row → `{ ok: true }` with the right provider id; `provider_unsupported` row → `provider_error`.
  - New cross-tenant integration test per AC-5.
  - ≥12 new test cases covering the real-adapter selection paths.

- [ ] **AC-7** No new permission, no schema change. `agents:view_activity` (existing) gates the queue page + approve action; org-admin perms gate credential entry at `/admin/integrations/*`. Confirm `npx tsc --noEmit` clean for changed files and the build is green.

- [ ] **AC-8** All 10 V6 stopping-criteria gates pass (CLAUDE.md §STOPPING CRITERIA, `v4`→`v6` substitution). Gate 4 (migrations) is N/A — D-603 ships no migration; note it explicitly in `docs/V6_STATUS.md`.

---

## Non-goals (deferred)

- **Telephony into the follow-up dispatch path** — the `agent_approval_queue.channel` enum is `whatsapp | email | sms` only. `resolveOrgAdapter` covers `'telephony'` generically so D-609 can reuse it, but D-603 does not add a telephony send path. Outbound calls = D-609 (canvas click-to-call).
- **New providers** — Postmark, Servetel, Knowlarity, MyOperator, Ozonetel, Gupshup-SMS all stay `provider_unsupported` ("coming soon"). D-603 wires only the providers D-432–D-435 shipped: Resend, MSG91, Gupshup-WhatsApp, Cloud API.
- **Provider failover** — if Resend is down the send fails (`provider_error`, operator retries). No auto-flip to a fallback provider.
- **Retry queue / exponential backoff** — D-415's contract stands: record `send_error`, leave row `approved`, operator re-approves. No automated retry.
- **Inngest delivery worker changes** — D-311 untouched.
- **Org-admin "select your follow-up WhatsApp template" UI** — D-603 consumes whatever `approved_template_ids` the org already registered (D-432); a dedicated template-picker surface is D-614 (Predefined Message Templates).
- **Test-ping changes** — the `/admin/integrations/*` save + test-ping flows (D-432–D-435) are unchanged; D-603 only reads the rows they write.

---

## Stack

- **New:** `src/lib/comms/resolve-org-adapter.ts`, `tests/lib/comms/resolve-org-adapter.test.ts`, `tests/integration/dispatch-cross-tenant.test.ts`.
- **Modified:** `src/lib/agents/follow-up/dispatch.ts` (delete `pickProvider`, resolver-based email/sms/whatsapp branches), `src/app/(admin)/admin/agents/queue/actions.ts` (`not_configured` → `{ deferred, channel }`), the queue UI component that renders the approve result (channel-specific "configure integration" copy), `tests/lib/agents/follow-up/dispatch.test.ts` (extend + rewrite whatsapp case).
- **Reuses:** `src/lib/comms/{email,sms,whatsapp,telephony}/org-config.ts` (`instantiate*Adapter` — D-432–D-435), `src/lib/comms/encryption` (`decryptJson`), `src/lib/comms/types` (`CommsError`), `src/lib/supabase/admin` (`getSupabaseAdmin`), the `agent_approval_queue` / `nodes` / `edges` / `audit_log` write patterns from D-415.
- **DB:** existing `org_email_config`, `org_sms_config`, `org_whatsapp_endpoints`, `org_telephony_config`. No migration.
- TDD enforced (Gate 3 RED → GREEN → REFACTOR). Branch deploys only — never push directly to `main`.

---

## Authority

- **Implementation-order §4 step 1.1** — D-603 is the first directive of Phase 1; "without this, V6 is still mockware."
- **Constitution I** — agents are colleagues with a human gate. D-603 preserves the gate: the operator's explicit `approve` is still what triggers a send; D-603 only changes where the bytes go after approval.
- **Constitution II** — tenant isolation is architecturally enforced. `resolveOrgAdapter` filters every config read by the caller's `organization_id`; the cross-tenant integration test (AC-5) is the regulator's proof.
- **Constitution III** — provenance: activity node + audit row on every send, deferral, and failure (unchanged from D-415, real provider id now).
- **`per_org_integration_model` (memory)** — provider credentials are per-org, configured by the org_admin inside the app. D-603 reads exactly those rows; the operator is never asked for shared provider credentials.

---

## Operator follow-ups (post-merge)

- [ ] No migration to apply — D-603 ships none. (`docs/V6_STATUS.md` Gate 4 row = N/A.)
- [ ] Smoke at `/admin/integrations/email`: as an org admin, save a real Resend test API key + verified `from_email` → run Test ping → green.
- [ ] Smoke at `/admin/agents/queue`: as a presales rep, approve a pending email draft for a lead with a real test mailbox → row transitions `pending → approved → sent` → email arrives within 30s → lead activity stream shows "Follow-up sent · email" with `provider: resend`.
- [ ] Repeat for MSG91 SMS (DLT template) and Gupshup/Cloud API WhatsApp (approved template) against test numbers.
- [ ] Verify the `not_configured` path: an org with no email config → approve an email draft → queue row stays `approved`, UI shows "Configure your email integration to send this draft."
- [ ] Pilot orgs: real follow-ups are now **actually delivered** the moment an org saves live credentials — there is no longer a mock safety net. Confirm pilot orgs understand this before they save production keys.

---

## Risks & decisions

- **Mock safety net removed.** Under V4/V5, every send went to the mock provider — recorded, never delivered. After D-603, the instant an org saves live credentials, approved drafts go to real buyers. This is the intended behavior (it is the whole point of the directive) but it is a sharp edge: the `not_configured` fallback is the only thing standing between an org and an accidental real send, so the resolver's "missing row / inactive row → `not_configured`" branch is load-bearing and must be covered by tests.
- **WhatsApp is templated, not freeform.** WhatsApp BSPs (Gupshup, Cloud API) reject freeform business-initiated messages — only pre-approved templates go out. The follow-up draft body is freeform text. D-603's whatsapp branch therefore sends via an approved template (parallel to the SMS DLT path), interpolating the draft body into a template variable. Execution (Gate 3) confirms the exact `WhatsAppAdapter.send` contract from `src/lib/comms/whatsapp/types.ts`; if the org has registered no follow-up-suitable template, the branch returns `not_configured` (mirrors `buildWhatsAppHealth`'s "no approved templates" warning). A dedicated follow-up template-picker is D-614, not D-603.
- **SMS `allowed_templates` ownership.** `instantiateSmsAdapter(row, allowed_templates)` takes the allowed set as a *caller* argument, not from the config row. D-603's resolver threads the follow-up DLT template ids (`FOLLOW_UP_DLT_TEMPLATES`) through for the sms channel. If a pilot org's MSG91 account hasn't registered those exact DLT ids upstream, the send fails `provider_error` at MSG91 — that is correct fail-closed behavior, surfaced via `send_error`.
- **"Existing 27 tests" — PRD count vs. reality.** PRD AC-6 says "existing 27 follow-up dispatch unit tests." The actual `dispatch.test.ts` has 8 `it()` blocks; the count likely spans the sibling `dlt.test.ts` and others under `tests/lib/agents/follow-up/`. The binding requirement is behavioral: every pre-D-603 dispatch test passes (except the intentionally-rewritten whatsapp-deferred case), plus ≥12 new cases. The number in the PRD is not load-bearing.
- **Idempotency unchanged.** The `pending → approved → sent` transitions are still not transactionally retryable. If dispatch fails after the row is `approved` but before `sent`, the operator re-approves. Retry queue remains V-future.

---

## Learned Patterns Applied

No patterns in `memory/learned/ai-crm/patterns.md` currently sit at confidence ≥3 (the bar in the `directive-from-prompt` skill). The directly-applicable established conventions D-603 must honor regardless:

- **`caller-org-filter-on-service-role-mutation` (confidence 2)** — `resolveOrgAdapter` reads `org_{channel}_config` via the service-role admin client, which bypasses RLS. The `organization_id` filter on that SELECT is the load-bearing tenant guard; AC-5's cross-tenant integration test is the proof. This pattern was first added after a Gate-4 security scan caught a CRITICAL IDOR — treat it as load-bearing, not optional.
- **`server-action-result-discriminated-union` (confidence 1)** — both `resolveOrgAdapter` and the existing `dispatchApprovedDraft` / `approveQueueItemAction` return discriminated unions, never throw across the boundary. D-603 extends the union (`{ deferred, channel }`) rather than introducing exceptions.
- **`injectable-supabase-client-for-tests` (confidence 1)** — `dispatchApprovedDraft` already takes an optional `client`; `resolveOrgAdapter` follows the same shape so the unit tests inject a mock client and the integration test injects a real one.
- **`tier-2-templated-no-gateway` (confidence 1)** — the follow-up agent is T2: templated comms, no `gateway.complete`. D-603's whatsapp + sms branches stay templated; D-603 adds no generative content.
