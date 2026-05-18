-- V3.x — GDPR Art 17 hard-delete pipeline
--
-- Soft-delete is the day-to-day pattern (deleted_at column on every tenant
-- table). For GDPR Art 17 right-to-erasure / customer offboarding, we need
-- an irreversible scrub: rows actually removed, no backups regenerated.
--
-- Implementation: one SECURITY DEFINER function `hard_delete_organization`
-- that:
--   1. Verifies caller is super_admin (via JWT claim).
--   2. DELETEs from all tenant-scoped tables for the given org id, in FK
--      dependency order. The CASCADEs we already have on the FKs do most
--      of the work — this function just lists the entry points.
--   3. Captures a single audit_log row in the platform-orphan namespace
--      (organization_id stays set so super_admin reports can find it).
--   4. Finally deletes the organization row itself.
--
-- Row counts deleted per table are returned as JSON for observability.
--
-- Run from the Supabase SQL editor or via lib/platform/hard-delete.ts.
-- NOT exposed via REST. Anybody outside super_admin gets a permission denied.

CREATE OR REPLACE FUNCTION public.hard_delete_organization(
  p_org_id uuid,
  p_actor_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_counts jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  -- 1. Authorization gate — must be super_admin (claim-based).
  v_caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'base_role';
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: super_admin required (got %)', COALESCE(v_caller_role, 'none');
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id required';
  END IF;
  IF length(coalesce(p_reason, '')) < 5 THEN
    RAISE EXCEPTION 'p_reason required (>=5 chars)';
  END IF;

  -- 2. Audit row FIRST so we capture intent even if a downstream delete fails.
  --    organization_id intentionally still references the org being scrubbed.
  INSERT INTO audit_log (
    organization_id, actor_id, actor_type, actor_role,
    table_name, record_id, action, diff
  ) VALUES (
    p_org_id, p_actor_id, 'system', 'system',
    'organizations', p_org_id, 'hard_delete_initiated',
    jsonb_build_object('reason', p_reason)
  );

  -- 3. Tenant-scoped deletes. Order matters where FKs are RESTRICT.
  -- Most tenant tables CASCADE on organization_id, so deleting the org row
  -- alone would scrub them. We delete from a few high-volume tables
  -- explicitly so we can return counts (CASCADE doesn't surface counts).

  DELETE FROM api_audit_log WHERE organization_id = p_org_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{api_audit_log}', to_jsonb(v_n));

  DELETE FROM event_inbox_log WHERE organization_id = p_org_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{event_inbox_log}', to_jsonb(v_n));

  DELETE FROM webhook_deliveries WHERE organization_id = p_org_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{webhook_deliveries}', to_jsonb(v_n));

  DELETE FROM nodes WHERE organization_id = p_org_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{nodes}', to_jsonb(v_n));

  -- 4. Drop bridge rows + profiles for users in this org. Profiles for
  --    super_admin (organization_id NULL) are intentionally untouched.
  DELETE FROM user_app_roles WHERE organization_id = p_org_id;
  DELETE FROM profiles WHERE organization_id = p_org_id;

  -- 5. Finally the org itself. CASCADE FKs sweep workspaces + teams +
  --    subscriptions + webhook_endpoints + …
  DELETE FROM organizations WHERE id = p_org_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{organizations}', to_jsonb(v_n));

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'reason', p_reason,
    'counts', v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_organization(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_organization(uuid, uuid, text) TO service_role;
