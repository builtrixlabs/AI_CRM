# Baseline 122 — MIH inbound contract

**Status:** PROVISIONAL (lives under `docs/baselines/` during the V6 horizon; promotes to `baseline/122-*` when V6 reaches `main`).
**Owner directive:** D-604 (Marketing Intelligence Hub inbound API).
**Lands:** D-604 implements this contract. PRD §7 risk #4 requires this baseline frozen and signed off **before** D-604 enters Plan Mode.
**Source:** [`docs/PRD-v6.0.md` §4 → D-604](../PRD-v6.0.md).

This baseline freezes the `POST /api/sister/v1/leads` contract — the single canonical endpoint the Marketing Intelligence Hub (MIH) sister product uses to push curated, deduplicated leads into the CRM. The CRM is deliberately ignorant of the original source connector (Meta Lead Ads, 99acres, JustDial, etc.); MIH owns dedup + curation, the CRM owns allocation + engagement.

It is the V6 successor to baseline 121 (source-connectors contract): the per-source adapter model is **deferred** (implementation-order §9), and MIH inbound is the primary intake path. The universal webform endpoint (D-417) remains as a fallback.

---

## 1. Endpoint + authentication

```
POST /api/sister/v1/leads
Authorization: Bearer <sister-product-token>
Content-Type: application/json
```

- **Auth mechanism:** D-440 sister-product Bearer token. The token IS the org context — the route resolves `(organization_id, product_kind)` from the SHA-256 token hash lookup against `org_sister_product_tokens` (revoked tokens excluded).
- **Required `product_kind`:** `marketing_intelligence_hub`. A token of any other `product_kind` → **403**. (Phase 0 narrows the `product_kind` enum to `marketing_intelligence_hub` only — see implementation-order §5.5. Until that migration lands, the route MUST still hard-check `product_kind = 'marketing_intelligence_hub'`.)
- **No mTLS for V6** (operator decision §10.5). No "service token" or "global" path — every request is org-scoped by its Bearer token.

---

## 2. Request body (Zod-validated)

```typescript
{
  organization_id: string (uuid),          // MUST equal the token's org_id (else 403)
  external_id: string,                     // MIH's stable id — primary dedup key
  name: string,
  phone_e164: string,                      // E.164; secondary dedup key within org
  email?: string,
  source: string,                          // e.g. 'meta_lead_ads', '99acres', 'justdial'
  source_campaign_id?: string,
  source_ad_id?: string,
  source_channel: 'paid_social' | 'paid_search' | 'aggregator' | 'organic_web' | 'walk_in' | 'cp',
  source_received_at: string (ISO 8601),
  preference: {
    bhk?: number,
    budget_band?: string,
    project_interest?: string,
    area_sqft_min?: number,
    area_sqft_max?: number,
    city?: string,
    locality?: string,
  },
  age?: number,
  gender?: string,
  occupation?: string,
  notes?: string,
  raw_payload: object                      // MIH's original payload, archived for audit
}
```

- Schema violation → **400** with field-level error (which field, what failed).
- `source_channel` is a closed enum — values outside the union fail validation.
- `raw_payload` is mandatory and archived verbatim (see §7); it is never interpreted by the CRM.

---

## 3. Response

```
201 Created
{
  lead_id: string (uuid),                  // CRM nodes.id of the lead
  status: 'created' | 'duplicate_merged',
  allocated_to_user_id: string (uuid) | null   // D-610 allocation result; null if no rule matched
}
```

| Condition | Status | Body / headers |
|---|---|---|
| Valid token + valid payload, new lead | 201 | `status: 'created'` |
| Duplicate `external_id` (org-scoped) | 201 | `status: 'duplicate_merged'`, original `lead_id` |
| Duplicate `phone_e164` (org-scoped) | 201 | `status: 'duplicate_merged'`, original `lead_id` |
| Missing / malformed Bearer token | 401 | — |
| Valid token, wrong `product_kind` | 403 | — |
| `body.organization_id` ≠ token's org | 403 | — |
| Zod schema violation | 400 | field-level error |
| Per-org rate limit exceeded | 429 | `Retry-After` header |

**Latency target:** 201 within **200 ms p95** (PRD §4 D-604 AC1).

---

## 4. Deduplication

Dedup is **org-scoped** and runs in this order:

1. **By `external_id`** — lookup `nodes` where `organization_id = <token org>` AND `source_external_id = <external_id>` AND `node_type = 'lead'` AND `deleted_at IS NULL`. Hit → merge.
2. **By `phone_e164`** — if no `external_id` hit, lookup the lead by normalized E.164 phone within the same org. Hit → merge.

**Merge semantics:** union new non-null fields onto the existing lead; **keep the original `created_at`**; refresh `source_payload` archive with the latest raw payload; return the existing `lead_id` with `status: 'duplicate_merged'`. Never create a second `nodes` row for a known lead.

Cross-org dedup never happens — org A's `external_id` space is independent of org B's.

---

## 5. Idempotency

- The endpoint is **idempotent on `external_id`**: retrying the same `external_id` returns the same `lead_id` with `status: 'duplicate_merged'`, no duplicate row, no duplicate `lead.created` event.
- MIH MUST treat delivery as at-least-once and rely on this idempotency rather than tracking delivery state itself.

---

## 6. Rate limiting

- **Per-org limit: 100 leads/sec**, enforced via a KV token-bucket keyed on `organization_id` (D-301 limiter infrastructure).
- Exceeded → **429** with a `Retry-After` header.
- On limiter unavailability: **fail-open** — admit the lead. A lead lost on paid marketing spend is worse than a brief rate-limit bypass (same posture as baseline 121 §6).

---

## 7. Provenance fields written on every lead

Every `nodes` row created via this endpoint (`node_type = 'lead'`) MUST carry:

| Field | Source | Notes |
|---|---|---|
| `source_external_id` | request `external_id` | new `nodes` column (D-604 migration); dedup index `nodes (organization_id, source_external_id) WHERE deleted_at IS NULL AND node_type = 'lead'` |
| `source_payload` | request `raw_payload` | new `nodes` column; full raw JSON archived for audit |
| `data.source` | request `source` | the connector name MIH reports |
| `data.source_campaign_id` / `data.source_ad_id` | request | optional, lifted from the request |
| `data.source_channel` | request `source_channel` | one of the closed enum |
| `data.source_received_at` | request `source_received_at` | MIH-reported ingestion time |
| `created_via` | constant | `'api_sync'` — matches the existing `nodes.created_via` CHECK |

All inbound payloads are additionally logged to `event_inbox_log` with `source_product = 'marketing_intelligence_hub'`. A dedicated `mih_inbound_log` table (implementation-order §6 migration `20260520120600`) backs hot-path dedup + audit.

---

## 8. Audit + event emission

Every successful **create** (not merge) MUST:

1. Write an `audit_log` row with `action = 'lead_ingested'`, `diff: { source, external_id, source_channel }`, provenance = the MIH service account.
2. Emit the Inngest event `lead.created` with `{ lead_id, organization_id, workspace_id, source }`. This triggers, in order:
   - **D-009** Lead Enrichment Agent (intent score, BANT).
   - **D-610** Pre-sales Auto-Allocation Engine — evaluates allocation rules, sets `allocated_to_user_id`, writes an allocation audit row.
3. A **merge** writes an `audit_log` row with `action = 'lead_merged'` but does **not** re-emit `lead.created` (idempotency, §5).

---

## 9. Cross-tenant isolation

Fail-closed at three layers (same posture as D-443):

1. **Auth:** the D-440 token lookup binds the request to exactly one `(organization_id, product_kind)`.
2. **Envelope:** `body.organization_id` MUST equal the token's `org_id` — mismatch → 403.
3. **Product:** `product_kind` MUST be `marketing_intelligence_hub` — mismatch → 403.

A token for org A can never create, merge, or read a lead in org B. Verified by integration test (PRD §4 D-604 AC8) and by the Phase 5 RLS audit.

---

## 10. Versioning

`v1` — encoded in the path (`/api/sister/v1/leads`).

- **Additive (no version bump):** new optional request fields, new optional provenance fields, new `source_channel` enum values, new response fields.
- **Breaking (requires `/v2` + a migration plan for the live MIH integration):** removing or renaming a required field, changing dedup key precedence, changing auth mechanism, changing the `status` enum.

Same backward-compat discipline as baselines 116 and 121.

---

## 11. Sign-off

Per PRD §7 risk #4, this baseline must be **signed off by the operator before D-604 enters Plan Mode**. Until sign-off, D-604 is blocked at Phase 1 step 1.2.

- [ ] Operator sign-off on the §2 request schema
- [ ] Operator sign-off on the §4 dedup precedence (`external_id` then `phone_e164`)
- [ ] Operator sign-off on the §6 rate limit (100 leads/sec/org, fail-open)
- [ ] MIH team has received this contract and confirmed they can conform
