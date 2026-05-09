-- D-021 / A1 — dashboard_definitions: per-org saved dashboards.
--
-- Each row stores a name and a layout jsonb describing which widgets
-- to render. Widget data is computed at render time from existing
-- tables — no caching layer in V1.

CREATE TABLE dashboard_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  layout          jsonb NOT NULL DEFAULT '{"widgets":[]}'::jsonb,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL DEFAULT 'manual',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL DEFAULT 'manual',
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

CREATE INDEX dashboard_definitions_org_idx
  ON dashboard_definitions (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE dashboard_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dashboard_definitions_select_own
  ON dashboard_definitions FOR SELECT TO authenticated
  USING (
    organization_id = public.app_org_id()
    OR public.app_is_super_admin()
  );

CREATE POLICY dashboard_definitions_insert_own
  ON dashboard_definitions FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

CREATE POLICY dashboard_definitions_update_own
  ON dashboard_definitions FOR UPDATE TO authenticated
  USING (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  )
  WITH CHECK (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

NOTIFY pgrst, 'reload schema';
