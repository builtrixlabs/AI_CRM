-- D-302 — Force-sign-out on suspend.
-- A row exists iff the org is currently suspended. Inserted by suspendOrg(),
-- deleted by reactivateOrg(). Audit history lives in audit_log via
-- subscription_suspended / subscription_reactivated actions (D-203).
-- Read by getCurrentUser() on every authenticated request — if a row exists
-- for the caller's organization_id, the helper returns null and the user is
-- bounced to /auth/sign-in by middleware.

CREATE TABLE IF NOT EXISTS public.org_session_revocations (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  revoked_at      timestamptz NOT NULL DEFAULT now(),
  revoked_by      uuid NOT NULL,
  reason          text NOT NULL CHECK (length(trim(reason)) >= 3)
);

COMMENT ON TABLE public.org_session_revocations IS
  'Set of orgs currently suspended. Row exists iff org is in the suspended state. D-302.';

ALTER TABLE public.org_session_revocations ENABLE ROW LEVEL SECURITY;

-- Super-admin only: visibility + write. No tenant access at all (a suspended
-- org's users would see their own revocation row otherwise — irrelevant to them
-- since they're locked out, but cleaner this way).
CREATE POLICY org_session_revocations_super_admin_select
  ON public.org_session_revocations
  FOR SELECT
  TO authenticated
  USING (public.app_is_super_admin());

CREATE POLICY org_session_revocations_super_admin_insert
  ON public.org_session_revocations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.app_is_super_admin());

CREATE POLICY org_session_revocations_super_admin_update
  ON public.org_session_revocations
  FOR UPDATE
  TO authenticated
  USING (public.app_is_super_admin())
  WITH CHECK (public.app_is_super_admin());

CREATE POLICY org_session_revocations_super_admin_delete
  ON public.org_session_revocations
  FOR DELETE
  TO authenticated
  USING (public.app_is_super_admin());

-- Helpful index for the getCurrentUser() lookup pattern (PK already covers
-- equality, but listing the index explicitly for clarity).
CREATE INDEX IF NOT EXISTS idx_org_session_revocations_org
  ON public.org_session_revocations(organization_id);

-- Boolean RPC for the regular-user fast path: getCurrentUser() needs to
-- know whether the caller's org is currently revoked, but RLS denies
-- direct SELECT on org_session_revocations to non-super-admin. This
-- SECURITY DEFINER helper exposes only the existence bit.
CREATE OR REPLACE FUNCTION public.app_is_org_revoked(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_session_revocations WHERE organization_id = $1
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_is_org_revoked(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
