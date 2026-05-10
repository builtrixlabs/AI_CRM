-- D-312+ / V3.x — per-org retention overrides
--
-- V3.0 retention prune is global (platform_flags rows). Tier-aware retention
-- and per-org overrides are V3.x backlog. This migration adds the storage:
-- a JSONB `retention_overrides` column on organizations and a lookup helper.
-- The cron remains global; pruneAll() reads global default but per-org code
-- paths can read the override before exporting/archiving.
--
-- Additive only: existing rows get NULL → behaviour unchanged.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS retention_overrides jsonb NULL;

COMMENT ON COLUMN organizations.retention_overrides IS
  'Per-org retention day caps. JSON shape: {api_audit_log:int, event_inbox_log:int, webhook_deliveries:int}. Missing keys fall back to platform_flags defaults. Used by lib/platform/retention.ts getOrgRetention().';

-- Helper RPC: returns the resolved retention day count for one (org, table)
-- pair, applying override → flag → hardcoded default.
CREATE OR REPLACE FUNCTION public.get_org_retention_days(
  p_org_id uuid,
  p_table text
) RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override int;
  v_flag int;
BEGIN
  SELECT (retention_overrides ->> p_table)::int
    INTO v_override
    FROM organizations
   WHERE id = p_org_id AND deleted_at IS NULL;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT (value)::int INTO v_flag
    FROM platform_flags
   WHERE flag_key = 'retention_days_' || p_table;

  IF v_flag IS NOT NULL THEN
    RETURN v_flag;
  END IF;

  -- Fallback to hardcoded defaults if both are missing.
  RETURN CASE p_table
    WHEN 'api_audit_log' THEN 90
    WHEN 'event_inbox_log' THEN 30
    WHEN 'webhook_deliveries' THEN 60
    ELSE 90
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_retention_days(uuid, text) TO authenticated, service_role;
