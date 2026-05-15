-- V6 Phase 2 (D-607) — Brochure Repository.
--
-- The repository the Brochure Agent (D-600) picks from. A brochure is a
-- file-with-metadata, not a graph entity (no edges, no lifecycle, no
-- canvas) — per baseline/110 §I it is correctly its own table, the same
-- posture as project_sales_assignments (D-608) and lead_allocation_rules
-- (D-610).
--
--   1. brochures — the table. document_type is a CHECK-constrained column
--      (the agent hard-filters on it); bhk / budget_band / area / tags /
--      description live in metadata jsonb, validated app-side by
--      brochureMetadataSchema (src/lib/brochures/schemas.ts).
--   2. brochures_org_project_idx — hot path: list/agent-match by project.
--   3. RLS — 4 org-scoped policies via public.app_org_id().
--
-- The private `brochures` Storage bucket is NOT created here — it ships in
-- scripts/ensure_brochures_bucket.mjs (the service-role key has
-- unconditional Storage-admin rights via the API; whether the DATABASE_URL
-- role may write storage.buckets is project-config-dependent, and a
-- failure here would roll back this whole transaction). See D-607
-- directive §Architecture decisions.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.brochures;   -- drops its policies + index with it

-- ── brochures ───────────────────────────────────────────────────────────
-- project_id REFERENCES nodes(id): a project is a node_type='project' row
-- (baseline/110). Nullable — an org may keep project-agnostic collateral
-- (a generic company brochure). uploaded_by is a bare uuid (no FK) to
-- match the created_by posture of project_sales_assignments.
CREATE TABLE IF NOT EXISTS brochures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES nodes(id) ON DELETE SET NULL,
  document_type   text NOT NULL CHECK (document_type IN (
                    'brochure', 'floor_plan', 'price_sheet',
                    'legal_doc', 'amenity_doc')),
  title           text NOT NULL,
  file_path       text NOT NULL,            -- Storage object key: {org_id}/{uuid}/{filename}
  file_size_bytes bigint NOT NULL,
  mime_type       text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}',  -- bhk, budget_band, area_sqft_min/max, tags[], description
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid NOT NULL,
  deleted_at      timestamptz
);

-- Hot path: list a project's brochures / the agent's project-scoped match.
-- Partial — soft-deleted rows are never queried.
CREATE INDEX IF NOT EXISTS brochures_org_project_idx
  ON brochures (organization_id, project_id)
  WHERE deleted_at IS NULL;

ALTER TABLE brochures ENABLE ROW LEVEL SECURITY;

-- RLS enforces org isolation ONLY — the brochures:* permission gates are
-- enforced in the server actions, because `manager` / `workspace_admin`
-- (holders of brochures:upload / brochures:delete) are not org-admin-tier
-- roles. Same posture as D-608's project_sales_assignments.
DROP POLICY IF EXISTS brochures_select_org ON brochures;
CREATE POLICY brochures_select_org
  ON brochures FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS brochures_insert_org ON brochures;
CREATE POLICY brochures_insert_org
  ON brochures FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS brochures_update_org ON brochures;
CREATE POLICY brochures_update_org
  ON brochures FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS brochures_delete_org ON brochures;
CREATE POLICY brochures_delete_org
  ON brochures FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
