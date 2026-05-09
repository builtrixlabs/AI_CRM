-- D-017 / A1 — RLS write policies on `directives` for org_admin authoring.
--
-- D-011 created the table with SELECT-only policies (org rows + platform-default
-- rows visible to authenticated). Mutations were limited to service_role.
--
-- D-017 ships the org-admin authoring UI. Server actions still write via
-- service_role + caller_org_id app-layer check (caller-org-filter pattern,
-- D-007). These policies are belt-and-suspenders defense in case any future
-- caller hits the table via a user-scoped client (Constitution VII).
--
-- Additive only. No schema change.

-- ── Helper: caller is org_owner / org_admin / super_admin ───────────────────
CREATE OR REPLACE FUNCTION public.app_is_org_admin_or_super()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'base_role')
      IN ('super_admin', 'org_owner', 'org_admin'),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.app_is_org_admin_or_super()
  TO authenticated, service_role, anon;

-- ── INSERT policy: own-org rows, org_admin+ only ───────────────────────────
-- Platform-default (organization_id IS NULL) rows are still service-role-only.
CREATE POLICY directives_insert_own_org
  ON directives FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

-- Super-admin can insert anything (helpful for support / migrations).
CREATE POLICY directives_insert_super
  ON directives FOR INSERT TO authenticated
  WITH CHECK (public.app_is_super_admin());

-- ── UPDATE policy: own-org rows, org_admin+ only ──────────────────────────
CREATE POLICY directives_update_own_org
  ON directives FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

CREATE POLICY directives_update_super
  ON directives FOR UPDATE TO authenticated
  USING (public.app_is_super_admin())
  WITH CHECK (public.app_is_super_admin());

NOTIFY pgrst, 'reload schema';
