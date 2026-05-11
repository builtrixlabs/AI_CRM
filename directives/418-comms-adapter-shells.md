# Directive 418 — Comms adapter shells (telephony + email + SMS) + baselines 116/121

**Kind:** feature (V4 / PRD v3.0 D-118 + D-119 shells, plus baselines 116 & 121)
**Status:** AUTHORIZED — operator approved 2026-05-11 ("Phase B adapter-shell-only")
**Branch target:** `v4`
**Source:** `docs/PRD-v3.0.md` §3 P2 + §7; `docs/plans/v4-plan-v1.md` Phase B
**Builds on:** D-002 (nodes / activity graph), D-417 (source-connector pattern)

---

## Problem

PRD §3 P2 ("Communication Stack — adapter-first, channel-by-channel") demands three discrete outbound channels: Telephony (D-118), Email (D-119), SMS (D-119). Each has a different provider catalog (Exotel/Servetel/etc. for telephony; Postmark/Resend for email; MSG91/Gupshup for SMS). PRD §10 explicitly lists 3 unresolved operator decisions (10.1/10.2/10.3) that block production wiring.

What we **can** ship today **without any provider keys**:
- **Baselines** that lock the interface contracts so when keys arrive, the live provider implementations slot in without breaking everything else.
- **Adapter shells** — TypeScript interfaces + provider registry + a mock provider per channel — so downstream code (D-415 follow-up agent, D-416 custom outbound agent, future DOE directives) can be written against the interface today and exercised in tests.

D-418 ships:
1. **`docs/baselines/116-comms-providers-contract.md`** — telephony + email + SMS interface contracts (provisional canonical baseline for the V4 horizon; moves to `baseline/116-*` when V4 ships to main, per the hook-block constraint).
2. **`docs/baselines/121-source-connectors-contract.md`** — formalises the per-source ingestion + retry + quarantine contract that D-417 already encodes for the webform path. Lets future Meta/Google/JustDial adapters import the same shape.
3. **`src/lib/comms/telephony/`** — `TelephonyAdapter` interface + `providerRegistry` + `MockTelephonyProvider`.
4. **`src/lib/comms/email/`** — `EmailAdapter` interface + `providerRegistry` + `MockEmailProvider`.
5. **`src/lib/comms/sms/`** — `SmsAdapter` interface + `providerRegistry` + `MockSmsProvider`.
6. Tests for each adapter + registry behaviour.

No DB migration. No new permission. Mock providers are in-process — they record sent messages to a per-test buffer instead of contacting a real service.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** `docs/baselines/116-comms-providers-contract.md` exists and defines:
  - **Telephony Adapter:** `outboundClickToCall`, `lookupCallStatus`, `subscribeInbound`, `subscribeDisposition`. Provider-agnostic. **No call recording** — that's Voice IQ (PRD §3 P2).
  - **Email Adapter:** `sendTemplated`, `sendCustom`, `subscribeInboundParsed`. Threading via `In-Reply-To` header.
  - **SMS Adapter:** `sendTemplated` only. DLT template registry contract.
  - Per-channel **provider registry** key shape: `{ provider, capabilities, config }`.
  - Selection contract: org's `integration_secrets` row picks the active provider per channel (super-admin configured under D-016).

- [ ] **AC-2** `docs/baselines/121-source-connectors-contract.md` exists and defines:
  - Per-source ingestion shape (normalised to the D-417 `WebformIngestPayload` superset).
  - Retry policy: at-least-once, dedupe via `source_event_id`.
  - Quarantine policy: failed-parse → `leads_quarantine` (D-417 schema).
  - Adapter contract: `ingest(rawPayload, sourceContext) → IngestResult` mirroring D-417's signature.

- [ ] **AC-3** `src/lib/comms/telephony/types.ts` — `TelephonyAdapter` interface, `OutboundCallArgs`, `InboundCallEvent`, `DispositionEvent`, `CallStatus` discriminated union, `TelephonyProviderId` string-literal union (`'mock' | 'exotel' | 'servetel' | 'knowlarity' | 'myoperator' | 'ozonetel'`).

- [ ] **AC-4** `src/lib/comms/telephony/registry.ts` — `registerProvider(id, factory)` + `getProvider(id)` + `listProviders()`. Throws if unknown id requested.

- [ ] **AC-5** `src/lib/comms/telephony/providers/mock.ts` — `MockTelephonyProvider` records outbound calls + emits scripted inbound/disposition events from a test-controlled clock. Used by D-415/D-416 unit tests to exercise the agent's outbound flow without a real provider.

- [ ] **AC-6** `src/lib/comms/email/` — same shape: `types.ts`, `registry.ts`, `providers/mock.ts`. `EmailProviderId`: `'mock' | 'postmark' | 'resend'`.

- [ ] **AC-7** `src/lib/comms/sms/` — same: `types.ts`, `registry.ts`, `providers/mock.ts`. `SmsProviderId`: `'mock' | 'msg91' | 'gupshup'`. SMS shape excludes inbound (one-way per PRD §3 P2).

- [ ] **AC-8** `src/lib/comms/index.ts` re-exports the three adapter families. Single import point for downstream code: `import { telephony, email, sms } from '@/lib/comms'`.

- [ ] **AC-9** Tests:
  - `tests/lib/comms/telephony/mock.test.ts` — outboundClickToCall records the call; lookupCallStatus returns scripted states; subscribed inbound + disposition handlers fire on emit.
  - `tests/lib/comms/email/mock.test.ts` — sendTemplated records to outbox; sendCustom records; inbound parser handlers fire on emit.
  - `tests/lib/comms/sms/mock.test.ts` — sendTemplated records; rejects calls without a DLT-registered template id.
  - `tests/lib/comms/registry.test.ts` — registerProvider + getProvider happy + unknown-id throws + listProviders enumerates.

- [ ] **AC-10** Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/comms/**`.

- [ ] **AC-11** All 10 V4 stopping-criteria gates pass.

---

## Non-goals (deferred to live-provider directives)

- **Live Exotel / Servetel / Knowlarity / MyOperator / Ozonetel** — each lands as its own follow-up directive importing the `TelephonyAdapter` interface, once §10.1 picks a primary and operator provisions credentials.
- **Live Postmark / Resend** — D-419-live-email when §10.2 resolves.
- **Live MSG91 / Gupshup** — D-419-live-sms when §10.3 resolves + DLT templates are registered.
- **Per-org provider routing UI** — D-016 (Super-admin AI/Comms provider config) covers this; mock provider works for V1 internal testing.
- **Voice IQ integration** — D-014 already ingests; this directive only emits `call.completed` events; Voice IQ subscribes separately (PRD §3 P2).
- **Outbound email/SMS rate limiting** — V2; mock has unlimited capacity.
- **DLT template authorship UI** — V2; SMS template registry is a constants array for V1.

---

## Stack

- New: `docs/baselines/{116-comms-providers-contract,121-source-connectors-contract}.md`; `src/lib/comms/{index,telephony/*,email/*,sms/*}.ts`.
- No migrations.
- No new permissions.
- No UI changes — pure library work that unblocks downstream agent directives.

---

## Authority

- Constitution VII — stack discipline. We don't build telephony / email / SMS; we adapt.
- Constitution VIII — Single Source of Truth. Baselines 116 + 121 are the SSOT for adapter contracts once the operator promotes them from `docs/baselines/` to `baseline/` post-V4-GA.
- PRD §3 P2 (channel-by-channel) + §7 (new baselines).

---

## Operator follow-ups (post-merge)

- [ ] When picking telephony primary (PRD §10.1), `git mv docs/baselines/116-comms-providers-contract.md baseline/116-comms-providers-contract.md` (after V4 → main merge unblocks the hook).
- [ ] When implementing a live provider directive: `import { TelephonyAdapter, registerProvider } from '@/lib/comms/telephony';` and call `registerProvider('exotel', ...)`.
- [ ] D-415 (per-channel split for the v3 D-322 follow-up agent) can now consume `email.sendTemplated` / `sms.sendTemplated` / `telephony.outboundClickToCall` against the mock in tests, and against the live provider in production once registered.

---

## Risks & decisions

- **Baselines under `docs/baselines/` rather than `baseline/`:** the V5 hook blocks writes to `baseline/**` (per CLAUDE.md §HOOKS BLOCK). The operator authorised baseline drafts during V4 planning, but the hook can't be selectively bypassed by the agent. `docs/baselines/` is the V4-horizon canonical location; promotion to `baseline/` is a one-line `git mv` when V4 reaches main and the operator wants to re-enable the hook.
- **Interface stability:** the contracts are designed to admit per-provider behaviour quirks via `capabilities: ProviderCapabilities` + `config: Record<string, unknown>`. New capabilities (e.g. SMS scheduling) are additive to the union — no breaking changes expected when D-419-live-* lands.
- **Mock providers in production:** the mock providers are registered in the registry but NOT auto-selected. Selection requires an org's `integration_secrets` row pointing at a provider id; until that's `'mock'` explicitly, calls to `getProvider(unconfigured)` throw. Production code paths that aren't yet wired safely fall through to "no comms sent" rather than silently mock-sending.
