-- V6 Phase 3 (D-612) — Team-Scoped Dashboards.
--
-- One new link table: a dashboard (D-021) is published to a team (D-001)
-- by an org-admin or manager. Two roles can publish; only the
-- dashboards:publish_to_team permission gates the server action.
--
-- Idempotency: UNIQUE (dashboard_id, team_id) — re-publishing the same
-- (dashboard, team) pair is a benign 23505 the lib catches.
--
-- is_default boolean: PRD AC-1 mentions "team members see it as their
-- default dashboard". D-612 stores the flag; surfacing it (one dashboard
-- pinned per team) is a V6.x polish — every team-published dashboard
-- shows in the viewer's list equally for now.
--
-- RLS: org isolation only. The dashboards:publish_to_team permission is
-- gated at the server-action layer (same posture as D-602 / D-610).
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.team_dashboard_assignments;

CREATE TABLE IF NOT EXISTS team_dashboard_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dashboard_id    uuid NOT NULL REFERENCES dashboard_definitions(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  is_default      boolean NOT NULL DEFAULT false,
  published_at    timestamptz NOT NULL DEFAULT now(),
  published_by    uuid NOT NULL,
  UNIQUE (dashboard_id, team_id)
);

CREATE INDEX IF NOT EXISTS team_dashboard_assignments_org_idx
  ON team_dashboard_assignments (organization_id, published_at DESC);

CREATE INDEX IF NOT EXISTS team_dashboard_assignments_team_idx
  ON team_dashboard_assignments (team_id, published_at DESC);

ALTER TABLE team_dashboard_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_dashboard_assignments_select_org ON team_dashboard_assignments;
CREATE POLICY team_dashboard_assignments_select_org
  ON team_dashboard_assignments FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS team_dashboard_assignments_insert_org ON team_dashboard_assignments;
CREATE POLICY team_dashboard_assignments_insert_org
  ON team_dashboard_assignments FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS team_dashboard_assignments_update_org ON team_dashboard_assignments;
CREATE POLICY team_dashboard_assignments_update_org
  ON team_dashboard_assignments FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS team_dashboard_assignments_delete_org ON team_dashboard_assignments;
CREATE POLICY team_dashboard_assignments_delete_org
  ON team_dashboard_assignments FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
