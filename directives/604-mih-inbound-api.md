# Directive 604 — Marketing Intelligence Hub (MIH) Inbound API

**Kind:** feature (V6 Phase 1, step 1.2 — the canonical lead-intake endpoint)
**Status:** AUTHORIZED — operator cleared Phase 1 to run end-to-end 2026-05-14 ("implement all these features without stopping … completing phase 1"). That instruction is taken as the go-ahead for D-604; the baseline 122 §11 sign-off boxes are recorded as a doc-update operator follow-up.
**Branch target:** `v6-phase-1`
**Generated:** 2026-05-14T10:30:00Z
**Source:** `docs/PRD-v6.0.md` §D-604 (lines 371-445); `docs/baselines/122-mih-inbound-contract.md` (**binding contract**); `docs/plans/v6-implementation-order.md` §4 step 1.2.
**Builds on:** D-440 (sister-product Bearer tokens — `authenticateSisterProductRequest`, `verifyToken`, `SISTER_PRODUCT_KINDS`), D-417 (webform ingestion precedent — `src/lib/sources/webform/api.ts`), D-002 (graph `nodes` model), D-301 (KV rate-limiter — `createLimiter`), D-009 (`lead.created` Inngest trigger).

---

## Problem

V6 separates lead aggregation from the CRM: the Marketing Intelligence Hub (MIH) sister product dedupes + curates leads from Meta / 99acres / JustDial / etc., then pushes them to the CRM. There is no endpoint for that push. D-604 builds the single canonical intake path — `POST /api/sister/v1/leads` — implementing the frozen `docs/baselines/122-mih-inbound-contract.md` verbatim.

D-604 ships:

1. **Route** `src/app/api/sister/v1/leads/route.ts` — `POST` handler. Three fail-closed auth layers (baseline 122 §9): D-440 Bearer token resolves `(org_id, product_kind)` → 401 on bad token; `product_kind` must be `marketing_intelligence_hub` → 403; `body.organization_id` must equal the token's org → 403. Then: per-org KV rate limit (100/sec, fail-open) → 429 + `Retry-After`; Zod body validation → 400 field-level error; dispatch to the ingest lib; `201 { lead_id, status, allocated_to_user_id }`.
2. **Request schema** `src/lib/integrations/mih/schema.ts` — the baseline 122 §2 Zod schema (`external_id`, `name`, `phone_e164`, `source`, `source_channel` closed enum, `source_received_at`, `preference{}`, optional demographics, mandatory `raw_payload`).
3. **Ingest lib** `src/lib/integrations/mih/ingest.ts` — `ingestMihLead()`: org-scoped dedup (by `source_external_id`, then `phone_e164`); **create** = raw-insert a `node_type='lead'` row with the baseline 122 §7 provenance shape + `audit_log` `action='lead_ingested'` + emit `lead.created`; **merge** = union new non-null fields onto the existing lead, keep original `created_at`, refresh `source_payload`, `audit_log` `action='lead_merged'`, **no** event re-emit (idempotency). Every request → one `mih_inbound_log` row + one `event_inbox_log` row (`source_product='marketing_intelligence_hub'`).
4. **Migration** `20260514140000_mih_lead_inbound.sql` — adds `nodes.source_external_id` + `nodes.source_payload` (baseline 122 §7) + the dedup index `nodes (organization_id, source_external_id) WHERE deleted_at IS NULL AND node_type='lead'`; creates `mih_inbound_log` (per-request audit table) + RLS.
5. **Inngest** — `Events["lead.created"].data` gains optional `source?: string` (additive doc update); the emit carries the MIH connector name.

---

## Architecture decisions

- **Raw lead-node insert, following the D-417 webform precedent.** `src/lib/sources/webform/api.ts` already establishes that external lead-ingestion paths raw-insert a `node_type='lead'` row with a richer `data` shape (`name`, `source`, `source_channel`, `source_received_at`, `source_payload`, …) than the manual-creation `leadSchema` models — `leadSchema` is `.strict()` with a closed `source` enum and does not fit baseline 122 §7's provenance shape. D-604 mirrors webform's structure exactly: validation + insert live in a dedicated domain lib (`ingestMihLead`), not the route handler. `leadSchema` is **not** modified — loosening its `source` enum to a free string would be a breaking change rippling across every lead path. This is the consistent, shipped, lower-risk choice.
- **`nodes.source_external_id` is a top-level column, not JSONB.** Baseline 122 §4 requires an indexed hot-path dedup lookup; baseline 122 §7 + implementation-order §6 explicitly mandate it as a `nodes` column. It joins `nodes.source_event_id` as a cross-cutting provenance column (baseline 110 §VIII) — not a per-type CHECK constraint, so baseline 110 §X is not crossed.
- **Dedup precedence:** `source_external_id` first, then `phone_e164` (`data->>phone`), both org-scoped — baseline 122 §4 verbatim.
- **`mih_inbound_log` vs `event_inbox_log`:** `event_inbox_log` is the generic event ledger (baseline 122 §7 requires a row there). `mih_inbound_log` is the MIH-specific per-request audit table — it keeps the full `raw_payload` + MIH fields + outcome (`created` / `duplicate_merged` / `rejected` / `rate_limited`) that the generic ledger does not model.
- **`allocated_to_user_id` in the 201 response is `null` until D-610 ships.** Allocation is async via the `lead.created` → D-610 Inngest path (baseline 122 §3 + §8). D-604's synchronous response reports `null`; D-610 (step 1.6) fills the allocation. Documented in *Non-goals*.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Valid Bearer token + valid payload + new lead → `201 { lead_id, status: 'created', allocated_to_user_id: null }`. The lead `nodes` row carries `source_external_id`, `source_payload`, `data.source`, `data.source_channel`, `data.source_received_at`, `created_via='api_sync'` (baseline 122 §7).
- [ ] **AC-2** Duplicate `external_id` (org-scoped) → `201 { status: 'duplicate_merged' }` with the **original** `lead_id`; new non-null fields unioned onto the existing lead; original `created_at` preserved; no second `nodes` row; no `lead.created` re-emit.
- [ ] **AC-3** Duplicate `phone_e164` (org-scoped, no `external_id` hit) → same merge behaviour as AC-2.
- [ ] **AC-4** Missing / malformed Bearer token → **401**. Valid token, `product_kind ≠ marketing_intelligence_hub` → **403**. `body.organization_id ≠` token's org → **403**.
- [ ] **AC-5** Zod schema violation → **400** with a field-level error map. `source_channel` outside its closed enum fails validation.
- [ ] **AC-6** Per-org rate limit exceeded (100/sec) → **429** with a `Retry-After` header. Limiter unavailable → **fail-open** (admit the lead).
- [ ] **AC-7** Idempotency: replaying the same `external_id` returns the same `lead_id`, `status: 'duplicate_merged'`, no duplicate row, no duplicate event.
- [ ] **AC-8** Cross-tenant: a token for org A can never create, merge, or read a lead in org B — proven by `tests/integration/mih-inbound.test.ts`.
- [ ] **AC-9** Every request writes one `mih_inbound_log` row (outcome + raw payload) and one `event_inbox_log` row (`source_product='marketing_intelligence_hub'`). Every **create** writes an `audit_log` `action='lead_ingested'` row and emits `lead.created`; every **merge** writes `action='lead_merged'` and emits nothing.
- [ ] **AC-10** Tests: `schema.test.ts` (validation), `ingest.test.ts` (dedup/create/merge/idempotency), `route.test.ts` (401/403/400/429/201 paths), `mih-inbound.test.ts` integration (cross-tenant). `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-11** All 10 V6 stopping-criteria gates pass. Migration `20260514140000_mih_lead_inbound.sql` applies.

---

## Non-goals (deferred)

- **Allocation in the POST response** — D-610 (step 1.6) owns allocation; the `lead.created` event triggers it asynchronously. D-604's response reports `allocated_to_user_id: null`.
- **Source-specific connectors** — Meta / 99acres / JustDial adapters live in MIH, not the CRM (implementation-order §9, baseline 122 §intro).
- **Lead scoring / enrichment** — the D-009 Lead Enrichment Agent runs async off the same `lead.created` event.
- **CSV bulk import via this endpoint** — the universal webform endpoint (D-417) remains the fallback path; bulk CSV is deferred (D-124).
- **mTLS / global service token** — operator decision §10.5: Bearer token only for V6.
- **`baseline/122` promotion + §11 sign-off boxes** — `docs/baselines/122` stays PROVISIONAL until V6 hits `main`; the operator's Phase-1 build instruction is the build authorization. The formal §11 checkbox tick is a doc-update operator follow-up.

---

## Stack

- **New:** `src/app/api/sister/v1/leads/route.ts`, `src/lib/integrations/mih/schema.ts`, `src/lib/integrations/mih/ingest.ts`, `supabase/migrations/20260514140000_mih_lead_inbound.sql`, `scripts/verify_604.mjs`, plus tests.
- **Modified:** `src/lib/inngest/client.ts` (`lead.created` data gains optional `source`).
- **Reuses:** `authenticateSisterProductRequest` / `tokenAllowedFor` (D-440), `createLimiter` (D-301), `recordInboxIngestion` (`src/lib/events/inbox.ts`), `inngest.send`, the webform raw-insert + audit + best-effort-emit pattern (`src/lib/sources/webform/api.ts`), `getSupabaseAdmin`.
- **DB:** two additive `nodes` columns + one partial index; one new table `mih_inbound_log`. No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **`docs/baselines/122-mih-inbound-contract.md`** — the binding contract. D-604 implements §1–§10 verbatim; every AC above traces to a baseline section.
- **Implementation-order §4 step 1.2** — D-604 is the lead-intake mechanism for the V6 product; it comes right after D-603.
- **Constitution II** — three fail-closed tenant layers (baseline 122 §9); the integration test is the regulator's proof.
- **Constitution III** — provenance: `source_external_id` + `source_payload` + `data.source*` on every lead; `audit_log` + `event_inbox_log` + `mih_inbound_log` on every request.
- **PRD-v6.0 §7 risk #4** — the contract was frozen in baseline 122 before D-604; this directive does not renegotiate it.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration** (from worktree, env file loaded): `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260514140000_mih_lead_inbound.sql`, then `node --env-file=<parent>/.env scripts/verify_604.mjs`.
- [ ] **Tick `docs/baselines/122` §11 sign-off boxes** — the contract is implemented as frozen; the operator confirms the formal sign-off.
- [ ] **Issue a real MIH token** at `/platform/sister-products` (or via `issueToken`) and smoke `POST /api/sister/v1/leads` with a curl: valid payload → 201; replay → `duplicate_merged`; bad token → 401.
- [ ] After D-610 ships, re-smoke: a MIH POST should return a non-null `allocated_to_user_id`.

---

## Risks & decisions

- **`leadSchema` is not modified.** Baseline 122 §7's `data.*` shape (free-string `source`, `source_channel`, `source_received_at`, `preference`, demographics) does not fit the `.strict()` closed-enum `leadSchema`. Rather than loosen `leadSchema.source` (a breaking change across every lead-creating path + its tests), D-604 raw-inserts via a dedicated domain lib — exactly as the shipped D-417 webform path does. The trade-off: lead `data` for MIH/webform leads is validated by the *ingestion* schema, not `leadSchema`. This is the established convention; D-604 does not invent it.
- **Rate limiter fail-open.** Baseline 122 §6: a lead lost on paid marketing spend is worse than a brief rate-limit bypass. `createLimiter`'s KV backend already fails open on timeout/error; D-604 additionally treats any thrown limiter error as "admit".
- **`event_id` for the inbox ledger = `external_id`.** `event_inbox_log` dedups on `(org, event_id)`. Using `external_id` as `event_id` gives the generic ledger a consistent key, but the **authoritative** dedup decision is the `nodes.source_external_id` index lookup (baseline 122 §4) — `event_inbox_log` is the audit ledger, not the dedup gate.
- **Merge races.** Two near-simultaneous POSTs with the same new `external_id` could both miss the dedup lookup and both insert. The partial unique-ish index is not a true UNIQUE constraint (it indexes for lookup speed, and `source_external_id` is nullable for non-MIH leads). At V6 pilot scale this race is negligible; if it ever bites, promoting the index to a partial `UNIQUE` on `(organization_id, source_external_id) WHERE node_type='lead' AND source_external_id IS NOT NULL` is the additive follow-up. Documented, not pre-solved.
- **`allocated_to_user_id` null until D-610.** Acceptable per baseline 122 §3 ("null if no rule matched") — before D-610, *no* rule exists, so `null` is correct, not a bug.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — `ingestMihLead` runs on the service-role admin client; every dedup SELECT and the insert filter/carry `organization_id` from the verified token. The integration test proves org A's token never reaches org B.
- **`external-ingestion-raw-insert`** (from D-417) — external lead-ingestion paths raw-insert the lead node in a domain lib with a provenance-rich `data` shape + their own `audit_log` row; D-604 follows this established shape rather than the manual `createLead` path.
- **`best-effort-event-emit`** — `inngest.send('lead.created')` failure is logged, never rolls back the persisted lead (mirrors `createLead` + webform `ingestLead`).
- **`server-action-result-discriminated-union`** — `ingestMihLead` returns `{ ok: true, … } | { ok: false, reason, … }`; the route maps it to HTTP status codes, never throws across the boundary.
- **`additive-only-migrations`** — `IF NOT EXISTS` columns + index + table; explicit `ROLLBACK:` block; no destructive change.
