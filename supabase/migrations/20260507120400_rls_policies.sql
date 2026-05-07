-- D-001 / B5 — org-isolation RLS on every domain table
--
-- Pattern: every operational read/write is scoped by public.app_org_id().
-- super_admin (organization_id NULL claim) gets ZERO operational rows by
-- construction — no super_admin-permissive policy exists.

-- ── organizations ────────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_self ON organizations
  FOR SELECT TO authenticated
  USING (id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY organizations_update_self ON organizations
  FOR UPDATE TO authenticated
  USING (id = public.app_org_id())
  WITH CHECK (id = public.app_org_id());

-- INSERT and DELETE on organizations are service_role only (super_admin
-- provisioning flow). No policy = forbidden for authenticated.
CREATE POLICY organizations_insert_service ON organizations
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ── workspaces ──────────────────────────────────────────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_select_org ON workspaces
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY workspaces_insert_org ON workspaces
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY workspaces_update_org ON workspaces
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- ── teams ──────────────────────────────────────────────────────────────────
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select_org ON teams
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY teams_insert_org ON teams
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY teams_update_org ON teams
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- ── profiles ──────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read profiles in their org (excluding super_admin
-- profiles — those have organization_id NULL and don't appear in any org's view).
CREATE POLICY profiles_select_org ON profiles
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

-- A user can read its own profile regardless of org claim
-- (covers the moments before the JWT claim is fully populated).
CREATE POLICY profiles_select_self ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT on profiles is service_role only (provisioning + bootstrap).
CREATE POLICY profiles_insert_service ON profiles
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ── user_app_roles ────────────────────────────────────────────────────────
ALTER TABLE user_app_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_app_roles_select_org ON user_app_roles
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

-- Users can read their own bridge rows (used by getCurrentUser when
-- the JWT claim hasn't fully propagated).
CREATE POLICY user_app_roles_select_self ON user_app_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY user_app_roles_insert_org ON user_app_roles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY user_app_roles_update_org ON user_app_roles
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- ── Done ──────────────────────────────────────────────────────────────────
-- super_admin: no permissive policy on any operational table → 0 rows visible.
-- Verified in tests/integration/rls-super-admin-zero.test.ts (Group B / B8).
