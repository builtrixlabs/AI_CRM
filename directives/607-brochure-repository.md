# Directive 607 — Brochure Repository (org-admin upload · structured metadata · agent-queryable)

**Kind:** feature (V6 Phase 2, step 2.1 — the repository the Brochure Agent picks from)
**Status:** AUTHORIZED — operator cleared Phase 2 steps 2.1→2.4 to run end-to-end 2026-05-14 ("start with 2.1 and execute until 2.4 … consider all plans approved")
**Branch target:** `v6-phase-2` (cut from `v6-phase-1@ba1c321` on 2026-05-14)
**Generated:** 2026-05-14T11:40:00Z
**Source:** `docs/PRD-v6.0.md` §D-607 (lines 548-601); `docs/plans/v6-implementation-order.md` §3 + §4 step 2.1; operator decision §10.2 (Supabase Storage — locked).
**Builds on:** D-001 (org isolation + RLS + `app_org_id()`), D-002 (graph data model — a project is a `node_type='project'` row), D-608 (`src/lib/projects/sales-mapping.ts` `listProjects()` — reused for the project pick-list), D-003 (RBAC catalog), D-005 (`/admin` surface + admin-layout nav).

---

## Problem

The Brochure Agent (D-600, step 2.2) needs a repository to pick from: "customer asked about the 3BHK floor plan → send the right PDF." Today there is nowhere for an org to put that PDF, no metadata to match against, and no read path that respects tenant isolation. Supabase Storage has **never been used in this codebase** — D-607 is the first directive to touch it.

D-607 builds the repository: a `brochures` table (per-org, RLS-fenced), a private `brochures` Storage bucket, a typed-JSONB metadata schema, a lib layer the agent queries by `project_id` + `bhk` + `budget_band` + `document_type`, and a `/admin/brochures` surface where an org admin uploads/tags/deletes.

### Architecture decisions

- **Real table, not a `nodes` row.** baseline/110 §I forbids new `node_type` values, but a brochure is a file-with-metadata, not a graph entity — it has no edges, no lifecycle, no canvas. It is correctly its own table (same posture as `project_sales_assignments`, `lead_allocation_rules`, `site_visit_coordinator_claims` — D-608/610/602 all added plain tables for non-graph data).
- **`document_type` is a column; the rest of the metadata is typed JSONB.** `document_type` (`brochure | floor_plan | price_sheet | legal_doc | amenity_doc`) is a `CHECK`-constrained `text` column because the agent hard-filters on it. `bhk` / `budget_band` / `area_sqft_min|max` / `tags` / `description` live in a `metadata jsonb` validated by `brochureMetadataSchema` (the `src/lib/nodes/schemas/site_visit.ts` Zod-in-JSONB pattern). The D-020 custom-fields engine is **not** reused — brochure metadata is CRM-fixed, not org-configurable, which is the inverse of what custom fields are for.
- **Storage bucket via SDK script, not migration SQL.** `apply_migration.mjs` connects as the `DATABASE_URL` role; whether that role may write `storage.buckets` / `CREATE POLICY ON storage.objects` is project-config-dependent, and a failure there would roll back the whole transaction (the `brochures` table with it). So the table ships in the migration (pure `public` schema — guaranteed) and the bucket ships in `scripts/ensure_brochures_bucket.mjs` (the service-role key has unconditional Storage-admin rights via the Storage API). Idempotent: re-running is a no-op.
- **Private bucket, signed URLs, all access server-side.** The bucket is `public:false`. Every upload and read goes through a server action on the service-role client; the browser only ever holds a short-lived signed upload token (write) or a 1h signed URL (read). `storage.objects` keeps its Supabase default (RLS on, zero policies = deny-all to `authenticated`) — correct here, because no browser client ever touches the bucket directly. The load-bearing tenant guard is the server action's `organization_id`-prefixed object path + permission gate, mirroring the `caller-org-filter-on-service-role-read` pattern.
- **Upload is request → upload → finalize.** A FormData server action carrying a 25 MB file would blow the Next.js `serverActions.bodySizeLimit` (1 MB default). Instead: `requestBrochureUploadAction` validates perm/mime/size and returns a scoped signed upload URL; the client PUTs the file straight to Storage; `finalizeBrochureAction` validates the returned path is under the caller's org prefix and inserts the row. No global config change.

D-607 ships:

1. **Migration** `supabase/migrations/20260514170000_brochures.sql` — `brochures` table + `brochures_org_project_idx` partial index + RLS (4 org-scoped policies). Additive, `IF NOT EXISTS`, explicit `ROLLBACK:` block.
2. **Bucket script** `scripts/ensure_brochures_bucket.mjs` — idempotent private-bucket creation (25 MB cap; `application/pdf`, `image/jpeg`, `image/png`).
3. **Metadata schema** `src/lib/brochures/schemas.ts` — `DOCUMENT_TYPES`, `BUDGET_BANDS`, `brochureMetadataSchema` (strict Zod), `MAX_FILE_BYTES`, `ALLOWED_MIME_TYPES`.
4. **Lib** `src/lib/brochures/repository.ts` — `listBrochures`, `getBrochure`, `createBrochure`, `updateBrochureMetadata`, `softDeleteBrochure`, `getBrochureSignedUrl`, `requestUploadUrl`, and **`findBrochuresForAgent`** (the D-600 entry point — hard-filters org/project/document_type, soft-scores bhk/budget_band/area). Every function org-scoped, injectable client.
5. **RBAC** — `brochures:view` / `brochures:upload` / `brochures:delete` added to the `PERMISSIONS` catalog and wired into the role maps.
6. **UI** — `/admin/brochures` (`page.tsx` + `actions.ts`) and `src/components/brochures/brochure-manager.tsx` (list · upload form · metadata editor · delete). A "Brochures" entry in the `(admin)` layout nav.
7. **Tests** — `tests/lib/brochures/schemas.test.ts`, `tests/lib/brochures/repository.test.ts`, `tests/components/brochure-manager.test.tsx`, `tests/integration/brochures-cross-tenant.test.ts`.
8. **Verify** `scripts/verify_607.mjs` — table / index / RLS+policies / ledger / bucket.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Org admin opens `/admin/brochures`, picks a PDF, the title field pre-fills from the filename, fills `document_type` + optional `bhk`/`budget_band`/`area`/`tags`, clicks Save → the file lands in Storage at `{org_id}/{uuid}/{filename}` and one `brochures` row is inserted. Server-side validation rejects mime ∉ `ALLOWED_MIME_TYPES`, size > 25 MB, and `brochureMetadataSchema` violations with a field-level message.

- [ ] **AC-2** `findBrochuresForAgent({ organization_id, project_id, document_type, bhk, budget_band, area_sqft })` returns the org's non-deleted matching rows, ranked: exact `bhk` +3, `budget_band` +2, `area_sqft` within `[area_sqft_min, area_sqft_max]` +1. `project_id` and `document_type`, when supplied, are hard filters. Org filter is load-bearing on the service-role read. This is the surface D-600 calls.

- [ ] **AC-3** `getBrochureSignedUrl(org_id, id)` resolves an org-scoped row and returns a 1h signed URL; a cross-org id resolves to `{ ok: false, reason: 'not_found' }` — never a URL. `requestUploadUrl` builds the `{org_id}/…` path from the **caller's** org, never a client-supplied one.

- [ ] **AC-4** Delete soft-deletes (`deleted_at = now()`), writes an `audit_log` row, and best-effort removes the Storage object so the signed URL 404s. Soft-deleted rows never appear in `listBrochures` or `findBrochuresForAgent`.

- [ ] **AC-5** Cross-org isolation: an integration test provisions org A + org B, inserts a brochure in each, and proves (a) org A's authenticated client cannot `SELECT` org B's row (RLS), and (b) `findBrochuresForAgent` / `listBrochures` for org A never return org B rows.

- [ ] **AC-6** RBAC: `brochures:view` (all rep roles + manager + workspace_admin + site_visit_coordinator + org_admin/owner), `brochures:upload` (manager + workspace_admin + org_admin/owner), `brochures:delete` (workspace_admin + org_admin/owner) present in the literal `PERMISSIONS` catalog and the role maps. `/admin/brochures` page + every mutating action gate on `brochures:upload`; delete additionally gates `brochures:delete`.

- [ ] **AC-7** Tests: `schemas.test.ts` (metadata accept/reject), `repository.test.ts` (CRUD + match ranking + signed-url org scoping + path construction, mocked client), `brochure-manager.test.tsx` (RTL — list, empty state, upload form, delete), `brochures-cross-tenant.test.ts` (AC-5). `npx tsc --noEmit` clean for changed files; targeted vitest suite green.

- [ ] **AC-8** All 10 V6 stopping-criteria gates pass (`CLAUDE.md` §STOPPING CRITERIA, `v4`→`v6`). Migration `20260514170000_brochures.sql` applies via `scripts/apply_migration.mjs`; `scripts/ensure_brochures_bucket.mjs` runs; `scripts/verify_607.mjs` all-PASS.

---

## Non-goals (deferred)

- **The Brochure Agent itself** — D-600, step 2.2. D-607 ships only the repository + `findBrochuresForAgent`; nothing subscribes to Voice IQ events here.
- **AI-extracted metadata** — operator types `bhk`/`budget_band` manually in V6; auto-extraction from the PDF is V6.x (PRD §D-607 out-of-scope).
- **Versioning** — editing a brochure's file = delete + reupload (PRD §D-607). `updateBrochureMetadata` touches metadata/title/type/project only, never `file_path`.
- **`storage.objects` per-org RLS policies** — the bucket is private and no browser client touches it; Supabase's default deny-all-to-`authenticated` is the correct posture. If a future directive grants the browser direct Storage access, that directive adds the policies.
- **Manager-reachable `/admin/brochures`** — `route-policy.ts` admits only `org_owner`/`org_admin`/`super_admin` onto `/admin/*`. `brochures:upload` is granted to `manager`/`workspace_admin` for the permission model's correctness (and so a future manager-dashboard surface or the agent path can check it), but the V6 *page* is org-admin-reachable in practice — identical to D-608's `/admin/projects`.
- **Cross-org brochure sharing / brochure content generation** — PRD §D-607 out-of-scope.

---

## Stack

- **New:** `supabase/migrations/20260514170000_brochures.sql`, `scripts/ensure_brochures_bucket.mjs`, `scripts/verify_607.mjs`, `src/lib/brochures/schemas.ts`, `src/lib/brochures/repository.ts`, `src/app/(admin)/admin/brochures/page.tsx`, `src/app/(admin)/admin/brochures/actions.ts`, `src/components/brochures/brochure-manager.tsx`, plus the four test files.
- **Modified:** `src/lib/auth/rbac.ts` (3 perms + role-map wiring), `src/app/(admin)/layout.tsx` (nav entry).
- **Reuses:** `src/lib/projects/sales-mapping.ts` (`listProjects` — project pick-list), `getCurrentUser` / `resolveForUser` / `redirect("/403")`, `getSupabaseAdmin`, `createSupabaseBrowserClient` (the signed-upload PUT), the `audit_log` insert shape from `src/lib/sitevisits/api.ts`, the `@/components/ui/*` primitives, the D-608 `/admin/projects` page + `actions.ts` gate pattern.
- **DB:** one new `public` table `brochures`; one partial index; RLS + 4 policies. One new private Storage bucket. No destructive change.
- TDD enforced (Gate 3 RED → GREEN → REFACTOR). Branch deploys only — never push directly to `main` or `v6`.

---

## Authority

- **Implementation-order §4 step 2.1** — D-607 is Phase 2's first directive; "org admin uploads brochures with metadata … so the Brochure Agent can pick the right one."
- **Implementation-order §10.2 (locked)** — brochure storage is Supabase Storage; the agent does not re-solicit this.
- **PRD-v6.0 §D-607** — the `/admin/brochures` surface, the metadata fields, the 25 MB / PDF·JPG·PNG caps, 1h signed URLs, and soft-delete are specified there.
- **baseline/110 §I** — honored: a brochure is a plain table, not a new `node_type`.
- **Constitution II** — tenant isolation: `brochures` carries `organization_id` + RLS; every lib read filters by `organization_id`; `brochures-cross-tenant.test.ts` is the regulator's proof.
- **Constitution III** — provenance: `uploaded_by`/`uploaded_at` on the row; `audit_log` row on create/update/delete.
- **Constitution VI** — secrets: D-607 introduces no credentials; Storage access uses the existing service-role key.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration** (from repo root, `DATABASE_URL` set): `node --env-file=.env scripts/apply_migration.mjs supabase/migrations/20260514170000_brochures.sql`.
- [ ] **Create the bucket**: `node --env-file=.env scripts/ensure_brochures_bucket.mjs` (idempotent — safe to re-run).
- [ ] **Verify**: `node --env-file=.env scripts/verify_607.mjs` — expect ALL CHECKS PASS.
- [ ] **Smoke** `/admin/brochures` as an org_admin: upload a small PDF tagged `floor_plan, bhk=3` → it appears in the list → "View" opens the signed URL → "Delete" removes it from the list and 404s the URL.

---

## Risks & decisions

- **Storage is uncharted in this repo.** D-607 is deliberately conservative: private bucket, SDK-script creation (not migration SQL — see *Architecture decisions*), all access server-side service-role, signed URLs only. The one new external dependency is the Storage API; the `ensure_brochures_bucket.mjs` script is idempotent and `verify_607.mjs` confirms the bucket before the directive is called done.
- **Transaction-rollback risk avoided by splitting table vs. bucket.** Had the bucket `INSERT INTO storage.buckets` lived in the migration and the `DATABASE_URL` role lacked the grant, the wrapping `BEGIN/COMMIT` in `apply_migration.mjs` would roll back the `brochures` table too. Separating them means a bucket-script failure leaves a clean, already-applied table and a re-runnable script.
- **Upload body-size limit.** The request→upload→finalize flow keeps every server-action payload tiny and never raises `serverActions.bodySizeLimit`. The cost is a 3-call client orchestration; the `BrochureManager` component owns it and the user sees one "Save" click.
- **`budget_band` is a free string, not a DB enum.** PRD §D-607 says "string from enum" but never defines the enum, and D-604's MIH contract treats `budget_band` as an arbitrary string. `BUDGET_BANDS` is a const the UI offers as a `<select>` for consistency, but `brochureMetadataSchema` accepts any string so MIH-sourced values still validate. D-600's matcher normalizes before comparing.
- **`audit_log.workspace_id` for an org-level entity.** Brochures are org-scoped, not workspace-scoped. The audit rows are written with `workspace_id: null` — the same posture platform/subscription audit writers already use for non-workspace actions.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every `repository.ts` function takes `organization_id` and filters on it; the service-role client bypasses RLS so the filter is the load-bearing tenant guard. `requestUploadUrl` builds the Storage path from the caller's org, never client input. `brochures-cross-tenant.test.ts` is the proof.
- **`server-action-result-discriminated-union`** — every D-607 server action and the fallible lib functions return `{ ok: true, … } | { ok: false, reason, … }`; no throwing across the action boundary.
- **`injectable-supabase-client-for-tests`** — every `repository.ts` function takes an optional `client` last-arg (default `getSupabaseAdmin()`), matching `src/lib/projects/sales-mapping.ts`, so unit tests inject the chainable mock and the integration test injects a real client.
- **`additive-only-migrations`** — `20260514170000_brochures.sql` is `IF NOT EXISTS` throughout, carries an explicit `ROLLBACK:` block, and drops/alters nothing.
- **`zod-schema-for-jsonb`** — `brochureMetadataSchema` is `.strict()` and validated on every write, mirroring `src/lib/nodes/schemas/site_visit.ts`.
