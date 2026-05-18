# Baseline 121 — Source connectors contract

**Status:** PROVISIONAL (lives under `docs/baselines/` during V4 horizon; promotes to `baseline/121-*` when V4 reaches main).
**Owner directive:** D-117 (multi-source lead connectors).
**Lands:** D-417 (universal webform endpoint encodes the first conforming connector); formalised in D-418.

This baseline freezes the per-source ingestion + retry + quarantine contract. Every source-specific adapter (Meta Lead Ads, Google Ads Lead Form Extensions, JustDial XML, Sulekha, MagicBricks, 99acres, Housing.com, walk-in CSV, channel-partner) MUST conform.

---

## 1. Ingestion contract

```ts
interface SourceAdapter {
  /** Stable id for the source — also written to nodes.data.source. */
  readonly source: SourceId;

  /** Map raw provider payload → CRM-internal lead shape. */
  normalise(rawPayload: unknown): NormalisedLeadInput | { error: string };

  /** Adapter-side validation (e.g. webhook HMAC) before normalisation. */
  authenticate?(request: SourceRequest): Promise<{ ok: true } | { ok: false; reason: string }>;
}
```

`SourceId` is a string-literal union expanded per directive:
`'webform' | 'meta_lead_ads' | 'google_ads_lead_form' | 'justdial' | 'sulekha' | 'magicbricks' | '99acres' | 'housing_com' | 'walk_in' | 'cp_portal'`.

`NormalisedLeadInput` is the superset of `WebformIngestPayload` (D-417 `src/lib/sources/webform/types.ts`) — every conforming source produces a row matching that schema; provider-specific extras land under `data.source_payload` raw.

---

## 2. Provenance fields written on every lead (PRD §3 P1)

Mandatory on every `nodes` row with `node_type='lead'` created via a source adapter:

| Field | Source | Notes |
|---|---|---|
| `data.source` | adapter | `SourceId` literal |
| `data.source_received_at` | adapter | timestamp of ingestion (CRM-side) |
| `data.source_payload` | adapter | full raw JSON archived for audit |
| `data.source_campaign_id` | adapter | optional, lift from provider's metadata |
| `data.source_adset_id` | adapter | optional |
| `data.source_ad_id` | adapter | optional |
| `data.source_channel` | adapter | one of `paid_social | paid_search | aggregator | organic_web | walk_in | cp` |
| `created_via` | adapter | `'api_sync' | 'webform' | 'import' | 'cp_portal' | …` — matches the `nodes.created_via` CHECK |

Any source that cannot populate `source_received_at` MUST set it to `now()`. Other fields are optional but MUST NOT be silently faked.

---

## 3. Retry policy (at-least-once)

- Adapters MUST treat ingestion as **at-least-once**. Deduplication is centralised, not per-adapter.
- Dedup key: `(organization_id, source, data.source_event_id)` if the provider gives a stable event id. If not, the adapter SHOULD construct one from `(provider_lead_id, received_at_truncated_to_minute)` — anything stable across retries.
- On dedup hit: return the existing lead's id; do NOT create a second `nodes` row.
- A `source_events` table (V2) will record `source_event_id → lead_id` for hot-path dedup; until then, adapters do the lookup against `nodes.data->>source_event_id`.

---

## 4. Quarantine contract (PRD §3 P1: "no lead lost to parse failure")

On `normalise` returning an `{ error }`, OR on Zod validation failing on the normalised output, the adapter MUST write a row to `leads_quarantine` (D-417 schema):

```ts
{
  organization_id,
  webform_endpoint_id?: string,    // only for webform; null for others
  source: SourceId,
  raw_payload: <original JSON>,
  error_reason: <human-readable, ≤ 200 chars>,
  received_at: now()
}
```

Quarantine writes MUST succeed even when the lead-create transaction fails. Both are best-effort but loss is unacceptable.

---

## 5. Webhook authenticity (per-source override)

Adapters that receive webhooks (Meta, Google, etc.) MUST implement `authenticate(request)` and reject unsigned / wrongly-signed requests with a 401-equivalent response before normalisation.

- **Meta:** verify the `X-Hub-Signature-256` header against the app secret.
- **Google Ads Lead Forms:** verify the `Authorization: Bearer <key>` matches the org's configured webhook secret.
- **Webform (D-417):** authenticates via path-token, no signature required.
- **JustDial / Sulekha (email / XML feed):** receiving address validation; rejects mail from unexpected senders.

`SourceRequest` shape:
```ts
type SourceRequest = {
  headers: Record<string, string>;
  raw_body: string;        // before JSON-parsing
  query?: Record<string, string>;
};
```

---

## 6. Rate limiting

- Per-source ingress is rate-limited at the route layer (D-301 KV limiter), keyed by the org's webform-endpoint id (or per-source bucket for non-token sources).
- On limiter unavailability: **fail-open** — admit the lead. Lead loss on a paid Meta lead spend is worse than rate-limit bypass.

---

## 7. Audit + event emission

Every successful ingestion MUST:
1. Write `audit_log` row with `action='lead_ingested'`, `diff: { source, endpoint_id? }`.
2. Emit Inngest event `lead.created` with `{ lead_id, organization_id, workspace_id, source }` — D-010 Lead Enrichment Agent subscribes.
3. Bump the source's traffic counter (e.g. `webform_endpoints.received_count` for the webform adapter; equivalent per-source counter for live providers).

---

## 8. Versioning

`v1`. Same backward-compat rule as baseline 116. Additive: new sources, new optional provenance fields, new dedup strategies (with explicit `version` field). Breaking: signature changes require version bump + migration plan for live source adapters.
