-- V3.x fix — get_org_retention_days RPC referenced wrong column name on
-- platform_flags. Actual schema (20260509200000_platform_flags.sql):
--   platform_flags(key text PRIMARY KEY, value jsonb, ...)
-- My V3.x migrations 20260510130000 and 20260510130400 used `flag_key`
-- (not present). They also cast `(value)::int` directly — value is jsonb,
-- so we need `(value::text)::int`.
--
-- This migration is the corrected version, replacing the function. Same
-- resolution order:
--   1. organizations.retention_overrides[<table>]
--   2. platform_flags retention_<tier>_<table>
--   3. platform_flags retention_days_<table>
--   4. hardcoded fallback

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
    SELECT (value::text)::int INTO v_tier_flag
      FROM platform_flags
     WHERE key = 'retention_' || v_tier || '_' || p_table;
    IF v_tier_flag IS NOT NULL THEN
      RETURN v_tier_flag;
    END IF;

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
  SELECT (value::text)::int INTO v_global_flag
    FROM platform_flags
   WHERE key = 'retention_days_' || p_table;
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

NOTIFY pgrst, 'reload schema';
