-- V3.x — tier-aware retention
--
-- Backlog item 22 (M). The previous migration (20260510130000) shipped
-- per-org override → platform_flags → hardcoded fallback. This adds the
-- middle hop: subscriptions.plan_tier-aware default. Resolution order:
--
--   1. organizations.retention_overrides[<table>]   (item 21)
--   2. platform_flags retention_<tier>_<table>      (this migration)
--   3. platform_flags retention_days_<table>        (V3.0 default)
--   4. hardcoded fallback                           (90/30/60)
--
-- Plan-tier flag values default to:
--   starter        : 30 / 14 / 14
--   professional   : 90 / 30 / 60
--   enterprise     : 365 / 90 / 180
--   custom         : 90 / 30 / 60   (same as professional; operator overrides)

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
  v_tier text;
  v_tier_flag int;
  v_global_flag int;
BEGIN
  -- 1. Per-org JSONB override.
  SELECT (retention_overrides ->> p_table)::int
    INTO v_override
    FROM organizations
   WHERE id = p_org_id AND deleted_at IS NULL;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  -- 2. Plan-tier default via subscriptions.plan_tier + platform_flags.
  SELECT plan_tier INTO v_tier
    FROM subscriptions
   WHERE organization_id = p_org_id;

  IF v_tier IS NOT NULL THEN
    SELECT (value)::int INTO v_tier_flag
      FROM platform_flags
     WHERE flag_key = 'retention_' || v_tier || '_' || p_table;
    IF v_tier_flag IS NOT NULL THEN
      RETURN v_tier_flag;
    END IF;

    -- Tier defaults baked in (operator can override via flag).
    RETURN CASE
      WHEN v_tier = 'starter' THEN
        CASE p_table
          WHEN 'api_audit_log' THEN 30
          WHEN 'event_inbox_log' THEN 14
          WHEN 'webhook_deliveries' THEN 14
          ELSE 30
        END
      WHEN v_tier = 'professional' THEN
        CASE p_table
          WHEN 'api_audit_log' THEN 90
          WHEN 'event_inbox_log' THEN 30
          WHEN 'webhook_deliveries' THEN 60
          ELSE 90
        END
      WHEN v_tier = 'enterprise' THEN
        CASE p_table
          WHEN 'api_audit_log' THEN 365
          WHEN 'event_inbox_log' THEN 90
          WHEN 'webhook_deliveries' THEN 180
          ELSE 365
        END
      WHEN v_tier = 'custom' THEN
        CASE p_table
          WHEN 'api_audit_log' THEN 90
          WHEN 'event_inbox_log' THEN 30
          WHEN 'webhook_deliveries' THEN 60
          ELSE 90
        END
      ELSE 90
    END;
  END IF;

  -- 3. Global platform_flag.
  SELECT (value)::int INTO v_global_flag
    FROM platform_flags
   WHERE flag_key = 'retention_days_' || p_table;
  IF v_global_flag IS NOT NULL THEN
    RETURN v_global_flag;
  END IF;

  -- 4. Hardcoded fallback.
  RETURN CASE p_table
    WHEN 'api_audit_log' THEN 90
    WHEN 'event_inbox_log' THEN 30
    WHEN 'webhook_deliveries' THEN 60
    ELSE 90
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_retention_days(uuid, text) TO authenticated, service_role;
