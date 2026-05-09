# Directive 134 — `/api/admin/leads/lookup` endpoint

**Kind:** feature (V2 / Phase A)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-134
**Authority:** Constitution II (tenant isolation), III (provenance), IV (audit)
**Builds on:** D-132 (per-org HMAC secret), D-130 (event inbox v2 schemas)

---

## Problem

Voice IQ knows a caller's phone number (and sometimes a CRM-side `external_id` if the call was initiated from a Builtrix link). Before posting `call.audited`, Voice IQ needs to resolve `phone | external_id` → `{lead_node_id, workspace_id}`. Today there's no public read endpoint for that.

D-134 ships `GET /api/admin/leads/lookup`. **Read-only**, scoped to the caller's org via the same shared secret used for inbox writes — different surface, same trust boundary, same rotation point.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New route `GET /api/admin/leads/lookup`. Query params: `external_id`, `phone`, `org_id` (all strings). At least one of `external_id` or `phone` required.
- [ ] **AC-2** Auth: `Authorization: Bearer <secret>` header. Compares against the org's `voice_iq_inbox_secret` (per-org, looked up via D-132's resolver) → falls back to platform `builtrix_event_inbox_secret`. Constant-time compare via `timingSafeEqual`.
- [ ] **AC-3** **Cross-org** assertion: `org_id` query param MUST equal the org whose secret was matched in step 2. Mismatch → 404 (NOT 403 — fail closed without information leak).
- [ ] **AC-4** Lookup precedence:
  1. If `external_id` provided: exact match on `nodes.data->custom->>external_id` within org, node_type='lead', deleted_at IS NULL.
  2. Else if `phone` provided: E.164-normalize, then exact match on `nodes.data->>phone`.
- [ ] **AC-5** **404** when no match (NOT 200 with empty body — Voice IQ enqueues 404s for the manual admin queue).
- [ ] **AC-6** **200** body shape: `{ lead_node_id: string, workspace_id: string }`.
- [ ] **AC-7** Audit row per call: `action='leads_lookup_read'`, `compiled_artifact={query, result_status, result_node_id?}`. Records both 200 and 404 for observability.
- [ ] **AC-8** E.164 normalization helper at `src/lib/integrations/phone.ts` — handles common Indian formats: `+91-98xxxxxxxx`, `0098xxxxxxxx`, `98xxxxxxxx`, `(+91) 98xxx xxxxx`. Country-code default: 91 (configurable via env).
- [ ] **AC-9** Response time soft target p95 < 200ms (informational; not enforced in unit tests).
- [ ] **AC-10** Cmd+K palette gains an entry pointing org_admin to D-132's UI ("Voice IQ lookup endpoint URL" → copy-to-clipboard helper).
- [ ] **AC-11** D-132's admin page surfaces the lookup URL in the "Connection" card so operators know what to paste into Voice IQ alongside the inbox URL.

## Tests

- [ ] **AC-12** Unit tests for `normalizePhoneE164`: handles common Indian formats, returns null for malformed.
- [ ] **AC-13** Unit tests for `lookupLead` core: external_id-first, phone fallback, no-match → null, cross-org → null.
- [ ] **AC-14** Route handler tests: 200 happy path, 401 missing Bearer, 401 wrong Bearer, 404 no match, 404 cross-org, 400 missing both query params, audit row written.
- [ ] **AC-15** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Service-account JWT minting (per the original plan §3 D-134) — bearer-secret is sufficient for demo lens; full JWT lands when we have multiple machine consumers needing scoped tokens.
- Phone-collision unresolved-queue UI for admin — the v1 plan §3 D-134 mentions "manual-link button (V1.5; just stub the data structure for now)"; we leave the queue side to V3.
- Backfill script for existing AnalysisRecords with NULL `crm_lead_node_id` — that's Voice IQ-side work, not CRM.

## Stack

Next.js 16 route handler + zod for query parsing + `timingSafeEqual` for header check + Supabase service-role for read + Constitution III provenance.
