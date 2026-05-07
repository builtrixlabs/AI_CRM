-- D-001 / B2 — base_role enum + profiles + auth.users → profiles trigger
--
-- Note: super_admin profiles have organization_id = NULL; everyone else MUST
-- have a non-null organization_id. Constraint enforced at the table level.

CREATE TYPE base_role AS ENUM (
  'super_admin',
  'org_owner',
  'org_admin',
  'workspace_admin',
  'manager',
  'sales_rep',
  'read_only',
  'channel_partner',
  'service_account'
);

CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email           text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  base_role       base_role NOT NULL,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL CHECK (created_via IN
                  ('manual','call_audit','whatsapp','email','api_sync',
                   'ai_extraction','import','cp_portal','mih_event','system')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL,
  CONSTRAINT profiles_super_admin_no_org
    CHECK ((base_role = 'super_admin' AND organization_id IS NULL) OR
           (base_role <> 'super_admin' AND organization_id IS NOT NULL))
);

CREATE INDEX profiles_org_idx ON profiles (organization_id) WHERE deleted_at IS NULL;

-- ── Supabase Auth Hook: inject organization_id + base_role into JWT ──────────
-- Activated by setting `auth.hook.custom_access_token` in supabase config.toml
-- (or via the dashboard). Must be SECURITY DEFINER and grantable to supabase_auth_admin.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid := (event->>'user_id')::uuid;
  org_id  uuid;
  role    text;
BEGIN
  SELECT organization_id, base_role::text
    INTO org_id, role
    FROM profiles
   WHERE id = user_id AND deleted_at IS NULL;

  IF role IS NULL THEN
    RETURN event;  -- profile not yet provisioned; let auth proceed with no claims
  END IF;

  RETURN jsonb_set(
    jsonb_set(event, '{claims,organization_id}', to_jsonb(COALESCE(org_id::text, ''))),
    '{claims,base_role}',
    to_jsonb(role)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
