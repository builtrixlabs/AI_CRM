-- D-003 / B3 — RLS for role_permission_overrides
--
-- Org-scoped per Constitution II. super_admin sees zero rows by construction
-- (no permissive policy + app_org_id() returns NULL for super_admin).
-- Override authoring UI lands in D-005; until then, server-side helpers
-- (src/lib/auth/overrides.ts) use the service-role client.

ALTER TABLE role_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY rpo_select_org ON role_permission_overrides
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY rpo_insert_org ON role_permission_overrides
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY rpo_update_org ON role_permission_overrides
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
