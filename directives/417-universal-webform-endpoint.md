# Directive 417 — Universal webform endpoint + lead quarantine (Phase B slice of D-117)

**Kind:** feature (V4 / PRD v3.0 D-117 first slice)
**Status:** AUTHORIZED — operator approved 2026-05-11 ("move on to Phase B")
**Branch target:** `v4`
**Source:** `docs/PRD-v3.0.md` §3 P1; `docs/plans/v4-plan-v1.md` Phase B (B3)
**Builds on:** D-002 (nodes / leads schema), D-007 (lead state machine), D-018 (audit log shape)

---

## Problem

PRD §3 P1 (Lead Management) demands that every marketing source can drop a lead into the CRM, with full provenance. D-117's full scope spans 7 source connectors (Meta, Google, JustDial, Sulekha, MagicBricks, 99acres, Housing.com) — most require external API keys we don't have yet.

What we **can** ship today without any external credentials: the **universal webform endpoint** — a single per-org HTTPS endpoint that any external system can POST a lead to. This unblocks:

- Operator-built Meta/Google webforms (configure them to POST here).
- Vendor lead-aggregator integrations that ask "where do we send the JSON?".
- The other 6 source connectors when their API keys arrive — they ride on the same ingestion + quarantine plumbing.

D-417 ships:
1. `webform_endpoints` table — per-org token-authenticated endpoints.
2. `leads_quarantine` table — failed-parse holding pen, per PRD §3 P1.
3. `POST /api/leads/ingest/[token]` — public endpoint, token-validated, idempotent.
4. Lead provenance fields written into `nodes.data.source_*` (per PRD §3 P1 schema).
5. Admin UI at `/admin/sources` — issue/revoke webform tokens.
6. Lib + tests for the ingestion pipeline.

Source-specific adapters (Meta payload shape → lead, JustDial XML → lead, etc.) are separate follow-up sub-directives that import this directive's primitives.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Migration `<ts>_webform_endpoints_and_quarantine.sql`:
  - `webform_endpoints(id, organization_id, label, token_hash, token_prefix, is_active, created_*, updated_*, deleted_*)`. Token hashed with `digest(token, 'sha256')` (pgcrypto). `token_prefix` stores the first 8 chars in plaintext for UI display.
  - `leads_quarantine(id, organization_id, source text, raw_payload jsonb, error_reason text, received_at, resolved_at, resolved_by)`.
  - RLS: same-org SELECT for `org_admin`/`super_admin`; INSERT to webform_endpoints gated by `sources:manage`; ingestion writes (to leads + quarantine) bypass RLS via service role (per-row org_id stamped by the handler).

- [ ] **AC-2** New permission `sources:manage` added to the catalog (granted to `org_admin` + `org_owner`).

- [ ] **AC-3** `src/lib/sources/webform/` lib:
  - `issueToken(org_id, label, actor)` — generates 32-byte random token, stores sha256-hash + 8-char prefix, returns the plaintext token **once** (caller stores it).
  - `verifyToken(token, client?)` — looks up the row by hash; returns `{ org_id, endpoint_id }` or null. Used by the API route.
  - `revokeToken(id, actor)` — sets `is_active=false`, audit-logged.
  - `listEndpointsForOrg(org_id)` — admin UI fetcher.
  - `ingestLead(args)` — validates payload schema (zod), creates a `nodes` row with `node_type='lead'`, state `'new'`, and provenance: `source`, `source_received_at`, `source_payload` (full JSON archived). On schema failure, writes to `leads_quarantine` instead and returns `{ ok: false, reason: 'quarantined', quarantine_id }`.

- [ ] **AC-4** `POST /api/leads/ingest/[token]` route at `src/app/api/leads/ingest/[token]/route.ts`:
  - Reads `[token]` path param. Verifies via `verifyToken`. 401 on invalid/inactive.
  - Reads JSON body (`request.json()`).
  - Calls `ingestLead`. Returns 201 with `{ lead_id }` on success, 202 with `{ quarantine_id }` on parse failure (still "we received it; admin will triage").
  - Rate limit: 60 req/min/token via the existing KV limiter (D-301). On limiter unavailable → fail-open (don't block ingestion).

- [ ] **AC-5** Webform payload schema (zod):
  - Required: `phone` (string min 7).
  - Optional: `name`, `email`, `interest`, `source_campaign_id`, `source_adset_id`, `source_ad_id`, `source_channel` (enum from PRD §3 P1), `notes`.
  - Reject extra keys? No — store under `data.source_payload` raw, keeping known keys at top level. Backward-compatible.

- [ ] **AC-6** Lead row hydration on success:
  - `label = name || phone`
  - `state = 'new'`
  - `data = { phone, name?, email?, interest?, notes?, source: 'webform', source_received_at, source_campaign_id?, source_adset_id?, source_ad_id?, source_channel?, source_payload: <raw JSON>, created_via: 'webform' }`
  - `workspace_id` — endpoint table records its target workspace; defaults to org's primary workspace if unset.
  - Inngest event emitted: `lead.created` with `{ lead_id, organization_id, workspace_id, source: 'webform' }` — same as the manual create path (Lead Enrichment Agent picks it up).

- [ ] **AC-7** Admin UI at `/admin/sources/page.tsx`:
  - Lists active webform_endpoints per org (id, label, token_prefix, created_at, last_received_at).
  - "+ Issue endpoint" dialog — operator enters label, gets back the token (display ONCE with copy button + scary warning, then revoke is required to regenerate).
  - Per-row revoke button.
  - Permission: `sources:manage`.

- [ ] **AC-8** Tests:
  - `tests/lib/sources/webform/api.test.ts` — `issueToken` generates correct prefix + hash; `verifyToken` rejects unknown/inactive/cross-tenant; `ingestLead` happy path + quarantine path + cross-tenant guard.
  - `tests/api/leads-ingest.test.ts` — API route via direct handler invocation: 200 path, 401 invalid token, 202 quarantine path.
  - `tests/app/admin-sources.test.tsx` — RTL: list renders, "Issue endpoint" surface visible to org_admin only.

- [ ] **AC-9** Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/sources/**` + route handler.

- [ ] **AC-10** All 10 V4 stopping-criteria gates pass.

---

## Non-goals (deferred)

- **Meta / Google / aggregator-specific payload adapters** — each gets its own follow-up directive that imports `ingestLead` and converts the source's schema to our internal one. Need API keys + webhook validation per source.
- **Per-endpoint rate-limit overrides** — V1 uses one global 60/min/token. Per-org tunables in V2.
- **Webhook signature verification** — for sources that sign their webhooks (Meta uses HMAC). Source-specific, lands with their adapter.
- **De-duplication** — incoming leads matched against existing-by-phone returns a `merged_with` row id. V2; v1 quarantine of dupes is acceptable.
- **Quarantine review UI** — V1 surfaces the quarantine table count on `/admin/sources`; the full review/resolve workflow is V2.
- **Hot endpoint rotation** — token revoke + issue is a 2-step manual flow; one-click rotate is V2.

---

## Stack

- Migration: `supabase/migrations/<ts>_webform_endpoints_and_quarantine.sql`.
- New: `src/lib/sources/webform/{api,tokens,types,schemas}.ts`, `src/app/api/leads/ingest/[token]/route.ts`, `src/app/(admin)/admin/sources/{page.tsx,issue-endpoint-dialog.tsx,actions.ts}`.
- Reuses: `lib/auth/getCurrentUser`, `lib/auth/permissions`, `lib/auth/rate-limit` (D-301), `lib/leads/api.createLead` (or a lower-level node insert), `lib/inngest/client`.
- Crypto: `pgcrypto.digest()` for token hashing in SQL; `crypto.randomBytes(32).toString('base64url')` for token generation in JS.

---

## Authority

- Constitution II — tenant isolation (every read filters by `organization_id`; ingestion stamps org from the verified token).
- Constitution III — provenance (`source`, `source_received_at`, `source_payload` mandatory on every webform-created lead).
- Constitution VII — stack discipline (Postgres + pgcrypto for hashing; no external KMS).
- PRD §3 P1 — no lead lost to parse failure (quarantine table is the contract).

---

## Operator follow-ups (post-merge)

- [ ] Apply migration; `node scripts/apply_migration.mjs supabase/migrations/<file>.sql`.
- [ ] Verify schema via `node scripts/verify_d417.mjs` (table presence, RLS, RPC).
- [ ] Smoke: org_admin issues a token at `/admin/sources`, copies it, `curl -X POST -d '{"phone":"+91 99000 11111","name":"Test"}' <preview>/api/leads/ingest/<token>` → 201 with lead_id. New lead visible at `/dashboard/leads`.
- [ ] Telemetry: log every ingestion + quarantine to `api_audit_log` (D-204 surfaces it).
- [ ] When Meta adapter directive lands, it will import `ingestLead` from this directive.

---

## Risks & decisions

- **Token storage:** sha256 + 8-char prefix. Plaintext token returned exactly once. Compromise: operator must copy on first show; no recovery without revoke + reissue. Industry-standard for API tokens.
- **Quarantine retention:** uses `leads_quarantine.received_at` and the existing audit-retention cron (D-312); falls under "operational logs". No separate retention policy in this directive.
- **Rate limit failure mode:** fail-open (admit lead even if limiter unavailable). Rationale: lead loss is worse than rate-limit bypass for a paid Meta lead ad spend.
