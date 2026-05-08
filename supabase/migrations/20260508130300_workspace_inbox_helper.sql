-- D-010 / A3 — system function to ensure a workspace has an "inbox" lead.
--
-- When a WhatsApp inbound has no matching lead, the activity attaches
-- to a per-workspace system inbox lead. This function is idempotent
-- and runs as the bootstrap-system uuid (Constitution III).
--
-- Inbox lead conforms to the Zod lead schema (D-002):
--   state         = 'new' (valid lead state)
--   data.source   = 'other' (valid LEAD_SOURCES enum value)
--   data.phone    = '+91-system-inbox-<short>' (min(7) chars; unique-ish per workspace)
--   data.custom.is_system_inbox = true (marker)
--
-- Lookup is by `data -> 'custom' ->> 'is_system_inbox' = 'true'`.

CREATE OR REPLACE FUNCTION public.ensure_workspace_inbox_lead(p_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_lead_id uuid;
  v_system_uuid uuid := '00000000-0000-0000-0000-000000000000';
  v_short_ws text;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM workspaces
  WHERE id = p_workspace_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'workspace % not found', p_workspace_id;
  END IF;

  -- Look for existing inbox lead via the data.custom marker.
  SELECT id INTO v_lead_id
  FROM nodes
  WHERE organization_id = v_org_id
    AND workspace_id    = p_workspace_id
    AND node_type       = 'lead'
    AND deleted_at IS NULL
    AND (data -> 'custom' ->> 'is_system_inbox') = 'true'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    RETURN v_lead_id;
  END IF;

  v_short_ws := substr(p_workspace_id::text, 1, 8);

  INSERT INTO nodes (
    organization_id, workspace_id, node_type, label, data, state,
    created_by, created_via, updated_by, updated_via
  ) VALUES (
    v_org_id, p_workspace_id, 'lead',
    'WhatsApp Inbox',
    jsonb_build_object(
      'phone',  '+91-system-inbox-' || v_short_ws,
      'source', 'other',
      'custom', jsonb_build_object('is_system_inbox', true)
    ),
    'new',
    v_system_uuid, 'system', v_system_uuid, 'system'
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_workspace_inbox_lead(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
