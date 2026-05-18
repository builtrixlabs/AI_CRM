-- V6 Phase 1 (D-608) — Project <-> Sales-Person mapping.
--
-- A manager configures which sales rep works which project, with at most
-- one primary per (org, project) and an on-leave fallback. D-601 (Phase 2)
-- calls resolveSalesRepForProject() to auto-assign a site visit's rep.
--
--   1. project_sales_assignments — the mapping table.
--   2. partial unique index — at most one is_primary row per (org, project).
--   3. profiles.on_leave — the fallback trigger flag.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS on_leave;
--   DROP TABLE IF EXISTS public.project_sales_assignments;

-- ── project_sales_assignments ───────────────────────────────────────────
-- project_id REFERENCES nodes(id): a project is a node_type='project' row
-- (baseline/110). The FK guarantees referential integrity; the lib's
-- listProjects() is what scopes the pick-list to actual projects.
CREATE TABLE IF NOT EXISTS project_sales_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  sales_rep_id    uuid NOT NULL REFERENCES profiles(id),
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  UNIQUE (organization_id, project_id, sales_rep_id)
);

-- At most one primary rep per (org, project). Zero is permitted (a manager
-- may not have picked one yet); setPrimaryRep clears-all-then-sets-one.
CREATE UNIQUE INDEX IF NOT EXISTS project_sales_assignments_one_primary_idx
  ON project_sales_assignments (organization_id, project_id)
  WHERE is_primary;

-- Hot path: list a project's assignments.
CREATE INDEX IF NOT EXISTS project_sales_assignments_project_idx
  ON project_sales_assignments (organization_id, project_id);

ALTER TABLE project_sales_assignments ENABLE ROW LEVEL SECURITY;

-- RLS enforces org isolation ONLY — the projects:assign_sales permission
-- is gated in the server actions, because `manager` (a holder of that
-- permission) is not an org-admin-tier role. Same posture as D-602's
-- site_visit_coordinator_claims.
DROP POLICY IF EXISTS project_sales_assignments_select_org ON project_sales_assignments;
CREATE POLICY project_sales_assignments_select_org
  ON project_sales_assignments FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS project_sales_assignments_insert_org ON project_sales_assignments;
CREATE POLICY project_sales_assignments_insert_org
  ON project_sales_assignments FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS project_sales_assignments_update_org ON project_sales_assignments;
CREATE POLICY project_sales_assignments_update_org
  ON project_sales_assignments FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS project_sales_assignments_delete_org ON project_sales_assignments;
CREATE POLICY project_sales_assignments_delete_org
  ON project_sales_assignments FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

-- ── profiles.on_leave ───────────────────────────────────────────────────
-- The fallback trigger: resolveSalesRepForProject skips on-leave reps.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS on_leave boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
