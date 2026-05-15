# Directive 609 — Click-to-Call on Canvas (wire the Exotel adapter to the lead canvas)

**Kind:** feature (V6 Phase 2, step 2.3 — the quick win once D-603 is in)
**Status:** AUTHORIZED — operator cleared Phase 2 steps 2.1→2.4 to run end-to-end 2026-05-14 ("start with 2.1 and execute until 2.4 … consider all plans approved")
**Branch target:** `v6-phase-2` (cut from `v6-phase-1@ba1c321` on 2026-05-14)
**Generated:** 2026-05-14T13:45:00Z
**Source:** `docs/PRD-v6.0.md` §D-609 (lines 641-670); `docs/plans/v6-implementation-order.md` §3 + §4 step 2.3.
**Builds on:** D-433 (`ExotelTelephonyProvider` + `instantiateTelephonyAdapter` + the `call-status` webhook scaffold), D-603 (`resolveOrgAdapter('telephony', …)` — already generic), D-006 (lead canvas), D-003 (`calls:listen` permission), D-013 (activity nodes + the activity stream).

---

## Problem

D-433 shipped a real `ExotelTelephonyProvider` with `outboundClickToCall` and a `call-status` webhook — but the webhook is **scaffolding** ("log + return 200; full wiring lands in a follow-up directive") and **nothing on the canvas calls the adapter**. A presales rep looking at a lead's phone number has a `tel:` link and nothing else.

D-609 closes it: a "Call" button on the lead canvas → `POST /api/calls/initiate` → `resolveOrgAdapter('telephony')` → `adapter.outboundClickToCall` bridging the **rep's** phone to the customer → a `call.initiated` activity node on the lead → and the D-433 webhook, now wired, updates that node with the disposition as Exotel reports it.

### Architecture decisions

- **`outboundClickToCall` dials the rep, not just the virtual number.** D-433's Exotel impl sets `From = virtual_number` — an outbound-from-the-number call, not a rep↔customer bridge. D-609 adds an optional `from_phone_e164` to `OutboundCallArgs`; the Exotel adapter uses `args.from_phone_e164 ?? this.cfg.virtual_number` for `From` (keeping `CallerId = virtual_number`). Additive and backward-compatible — existing callers that pass no `from_phone_e164` get the exact prior behavior. This is what makes "both phones ring" (PRD AC-1) real.
- **Logic in a lib, route is thin.** `src/lib/comms/telephony/click-to-call.ts` holds `initiateClickToCall` (resolve lead → resolve adapter → place call → write the activity node) and `recordCallStatusUpdate` (find the activity node by `provider_call_id` → patch its disposition). Both are org-scoped, injectable-client, unit-tested directly. `/api/calls/initiate/route.ts` is auth + perm + body-parse glue.
- **The webhook gets its real wiring here.** D-433's `call-status/route.ts` already does org resolution + HTTP-Basic auth against the org's stored creds; D-609 replaces only its `console.info` scaffold tail with a `recordCallStatusUpdate` call. An unknown `CallSid` (no matching activity node) is a benign 200 — webhooks must be idempotent and tolerant.
- **No `from_phone` lookup in the lib.** The rep's phone is `profiles.phone`, already on `CurrentUser.profile.phone`. The route reads it from the authenticated user and passes it down — the lib never trusts a client-supplied caller number.
- **Lead canvas first; the button is a reusable component.** PRD §D-609 names lead/contact/deal canvas. The pilot scenario (PRD §10 step 7) is the **lead** canvas; D-609 wires that and ships `ClickToCallButton` as a standalone component the contact/deal canvases mount with the identical contract when those surfaces are next touched.
- **No migration.** PRD §D-609: "no new tables." The `call.initiated` activity is a `nodes` row (`node_type='activity'`), the disposition lives in its `data` jsonb. Gate 4 (migrations) = **N/A**.

D-609 ships:

1. **Adapter** — `OutboundCallArgs.from_phone_e164?: string` (`telephony/types.ts`); `ExotelTelephonyProvider.outboundClickToCall` uses it for `From`.
2. **Lib** `src/lib/comms/telephony/click-to-call.ts` — `initiateClickToCall`, `recordCallStatusUpdate`.
3. **Route** `src/app/api/calls/initiate/route.ts` — POST `{ lead_id }`, `calls:listen`-gated, requires the rep to have a `profiles.phone`.
4. **Webhook** — `call-status/route.ts` tail wired to `recordCallStatusUpdate`.
5. **UI** — `src/components/canvas/click-to-call-button.tsx`; `LeadCanvas` gains `canCall` + `repPhone` props; the lead page computes + passes them.
6. **Tests** — `click-to-call.test.ts`, `click-to-call-button.test.tsx`, `exotel.test.ts` extended for `from_phone_e164`.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** A rep with `calls:listen` and a `profiles.phone` clicks "Call" on a lead canvas → `POST /api/calls/initiate` → `resolveOrgAdapter('telephony')` → `outboundClickToCall({ from_phone_e164: rep_phone, to_phone_e164: lead_phone, … })` → a `call.initiated` activity node is written on the lead (`data.kind='call'`, `data.direction='outbound'`, `data.provider`, `data.provider_call_id`, `data.status='initiated'`) and the route returns `{ ok: true, provider_call_id }`.

- [ ] **AC-2** The D-433 `call-status` webhook, on an Exotel status POST, resolves the `call.initiated` activity node by `data->>provider_call_id` (org-scoped) and patches `data.status` + `data.duration_s` + `data.status_updated_at` to the reported disposition (`completed`, `failed`, `busy`, `no_answer`). An unknown `CallSid` returns 200 without writing.

- [ ] **AC-3** Cross-tenant isolation: `initiateClickToCall` resolves the lead and the adapter org-scoped — org A's request can never use org B's Exotel credentials or place a call against an org-B lead. `recordCallStatusUpdate` patches only an activity node in the webhook's resolved org. Covered by unit tests with a cross-org lead.

- [ ] **AC-4** Without `calls:listen` the route returns 403 and `LeadCanvas` never renders the button (the page computes `canCall` from `resolveForUser`). A rep with the perm but no `profiles.phone` sees a "set your phone in Settings" prompt instead of a live button, and the route returns `400 no_rep_phone` if called anyway.

- [ ] **AC-5** `not_configured` UX: if the org has no telephony adapter, `initiateClickToCall` returns `{ ok: false, reason: 'not_configured' }` and the route surfaces a clear "configure your telephony integration" message — never a 500.

- [ ] **AC-6** `outboundClickToCall` backward-compat: a caller passing no `from_phone_e164` gets `From = virtual_number` exactly as before D-609. The existing telephony adapter tests stay green; new tests cover the `from_phone_e164` path.

- [ ] **AC-7** Tests: `click-to-call.test.ts` (initiate happy path + lead-not-found + no-lead-phone + not_configured + provider_error + cross-org; `recordCallStatusUpdate` match + unknown-call no-op + cross-org); `click-to-call-button.test.tsx` (RTL — renders the button, the no-phone prompt, the disabled state for a lead with no phone, the calling→done transition); `exotel.test.ts` extended. `npx tsc --noEmit` clean for changed files; targeted + full vitest green.

- [ ] **AC-8** All 10 V6 stopping-criteria gates pass. **Gate 4 (migrations) = N/A — D-609 ships no migration; note it explicitly in `docs/V6_STATUS.md`.**

---

## Non-goals (deferred)

- **In-browser softphone** (Twilio Voice JS etc.) — PRD §D-609 V6.x.
- **Call hold / transfer / conference** — out of scope.
- **Inbound-call handling** — `subscribeInbound` exists on the adapter; D-609 only does outbound click-to-call. Inbound routing is a later directive.
- **Contact / deal canvas buttons** — `ClickToCallButton` is built reusable; the lead canvas is wired now, contact/deal mount it when those canvases are next touched (PRD pilot scenario only exercises the lead canvas).
- **Telephony into the follow-up dispatch path** — D-603 explicitly excluded this; D-609 does not change `dispatchApprovedDraft`.
- **Recording / transcription** — Voice IQ owns call recording (PRD §0 "never building").

---

## Stack

- **New:** `src/lib/comms/telephony/click-to-call.ts`, `src/app/api/calls/initiate/route.ts`, `src/components/canvas/click-to-call-button.tsx`, `tests/lib/comms/telephony/click-to-call.test.ts`, `tests/components/click-to-call-button.test.tsx`.
- **Modified:** `src/lib/comms/telephony/types.ts` (`OutboundCallArgs.from_phone_e164?`), `src/lib/comms/telephony/providers/exotel.ts` (`From` source), `src/app/api/webhooks/telephony/exotel/call-status/route.ts` (wire the tail), `src/components/canvas/lead-canvas.tsx` (`canCall` + `repPhone` props + button), `src/app/(dashboard)/dashboard/leads/[id]/page.tsx` (compute + pass), `tests/lib/comms/telephony/exotel.test.ts` (extend).
- **Reuses:** `resolveOrgAdapter('telephony')` (D-603), `instantiateTelephonyAdapter` / `ExotelTelephonyProvider` (D-433), the `nodes` activity-row + `edges` + `audit_log` write shape from `dispatchApprovedDraft`, `getCurrentUser` / `resolveForUser`, `getSupabaseAdmin`.
- **DB:** none — no migration. Activity = `nodes` row; disposition = its `data` jsonb.
- TDD enforced. Branch deploys only.

---

## Authority

- **Implementation-order §4 step 2.3** — "Quick win once D-603 is in. Lead canvas + contact canvas show call button → invokes Exotel adapter → status updates as activity nodes."
- **PRD-v6.0 §D-609** — the `/api/calls/initiate` contract, `calls:listen` gate, rep-phone prompt, and webhook-driven disposition update are specified there.
- **Constitution II** — tenant isolation: `initiateClickToCall` and `recordCallStatusUpdate` filter every read/write by `organization_id`; the adapter is resolved org-scoped.
- **Constitution III** — provenance: a `call.initiated` activity node + `audit_log` row on initiate; the webhook writes an `audit_log` row on each disposition update.
- **`per_org_integration_model` (memory)** — Exotel credentials are per-org; `resolveOrgAdapter` reads exactly the org's row.

---

## Operator follow-ups (post-merge)

- [ ] No migration to apply — D-609 ships none. (`docs/V6_STATUS.md` Gate 4 row = N/A.)
- [ ] In the Exotel dashboard, set the StatusCallback URL to `https://<api_key>:<api_token>@<host>/api/webhooks/telephony/exotel/call-status?org=<org-uuid>` (the D-433 contract — unchanged).
- [ ] **Smoke**: as a presales rep with a `profiles.phone` set and the org's Exotel adapter configured, open a lead canvas with a phone → click "Call" → both phones ring → a "Call initiated" row appears in the activity stream → on hang-up the row updates to "Call completed" within ~10s.
- [ ] **Smoke** the negative paths: a rep with no `profiles.phone` sees the "set your phone" prompt; an org with no telephony adapter gets the "configure telephony" message.

---

## Risks & decisions

- **Touching D-433's adapter.** `from_phone_e164` is additive and optional; the change to `outboundClickToCall` is a one-line `??` fallback. The existing `exotel.test.ts` asserts `From=` is present, not its value, so it stays green; a new test covers the rep-phone path.
- **The webhook is best-effort.** Exotel may POST a status for a `CallSid` we never recorded (a call placed out-of-band, or a replay). `recordCallStatusUpdate` treats "no matching activity node" as a benign 200 — never a 4xx/5xx — so Exotel doesn't retry-storm us.
- **Disposition latency.** AC-2's "within 10s" depends on Exotel's StatusCallback timing, which D-609 doesn't control. The webhook itself is a single indexed lookup + one update — sub-100ms server-side. If a pilot needs tighter latency, `lookupCallStatus` polling is the fallback (the adapter already exposes it), but that's a later optimization, not a D-609 change.
- **Rep phone trust.** The route reads `from_phone_e164` from `getCurrentUser().profile.phone` — never from the request body — so a client cannot make the platform dial an arbitrary number as the "rep leg."
- **`tel:` link stays.** The phone field's existing `tel:` link (D-006) is untouched — `ClickToCallButton` is additive. A rep on a device with a dialer can still use the link; the button is the Exotel-bridged path.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — `initiateClickToCall` resolves the lead and adapter `organization_id`-scoped; `recordCallStatusUpdate` patches only within the webhook's resolved org. Cross-org unit tests are the proof.
- **`server-action-result-discriminated-union`** — `initiateClickToCall` returns `{ ok: true, … } | { ok: false, reason, … }`; the route maps reasons to HTTP status, never throws across the boundary.
- **`injectable-supabase-client-for-tests`** — both lib functions take an optional `client` last-arg (default `getSupabaseAdmin()`); unit tests inject a chainable mock + a fake adapter.
- **`thin-route-fat-lib`** — `/api/calls/initiate` is auth/perm/parse only; all telephony logic is in `click-to-call.ts`, mirroring D-604's `route.ts` → `ingest.ts` split.
