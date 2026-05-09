-- D-019 / A1 — agent_org_configs: per-org enable/disable + max_tier override.
--
-- The global agent_service_accounts row defines the ceiling. This table
-- lets each org constrain it further — suspend an agent, or lower its
-- max_tier. Constitution I (bounded authority) — orgs choose how much
-- ceiling to actually grant.

CREATE TABLE agent_org_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_type         text NOT NULL REFERENCES agent_service_accounts(agent_type),
  enabled            boolean NOT NULL DEFAULT true,
  max_tier_override  agent_tier NULL,
  suspended_at       timestamptz NULL,
  suspended_reason   text NULL,
  -- Provenance (Constitution III)
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  created_via        text NOT NULL DEFAULT 'manual',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  updated_via        text NOT NULL DEFAULT 'manual',
  deleted_at         timestamptz NULL,
  deleted_by         uuid NULL,
  deleted_reason     text NULL,
  UNIQUE (organization_id, agent_type)
);

CREATE INDEX agent_org_configs_org_idx
  ON agent_org_configs (organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE agent_org_configs ENABLE ROW LEVEL SECURITY;

-- SELECT: caller's own org rows.
CREATE POLICY agent_org_configs_select_own
  ON agent_org_configs FOR SELECT TO authenticated
  USING (
    organization_id = public.app_org_id()
    OR public.app_is_super_admin()
  );

-- INSERT/UPDATE: own org + org_admin+. Belt-and-suspenders with app-layer
-- permission check (agents:provision).
CREATE POLICY agent_org_configs_insert_own
  ON agent_org_configs FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

CREATE POLICY agent_org_configs_update_own
  ON agent_org_configs FOR UPDATE TO authenticated
  USING (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  )
  WITH CHECK (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

NOTIFY pgrst, 'reload schema';
