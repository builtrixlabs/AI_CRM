-- D-003 / B2 — guard trigger: reject allow-overrides for PLATFORM_ONLY perms
--
-- The TypeScript constant PLATFORM_ONLY_PERMISSIONS (src/lib/auth/rbac.ts) is
-- the canonical list. This trigger duplicates the list as a defense-in-depth
-- measure (Constitution II). A drift-detection CI script lands in D-014.
--
-- On a violation, raises 42501 (insufficient_privilege) with a clear message.

CREATE OR REPLACE FUNCTION public.role_permission_overrides_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mode = 'allow' AND NEW.permission IN (
    'platform:manage',
    'organizations:create',
    'organizations:delete',
    'organizations:manage_admins',
    'organizations:manage_subscriptions',
    'platform_analytics:view',
    'platform_tickets:view',
    'platform_tickets:respond'
  ) THEN
    RAISE EXCEPTION
      'PLATFORM_ONLY permission cannot be granted via override: %',
      NEW.permission
      USING ERRCODE = '42501',
            HINT = 'Only super_admin holds platform-tier permissions. ' ||
                   'See src/lib/auth/rbac.ts PLATFORM_ONLY_PERMISSIONS.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_permission_overrides_guard_trigger
  ON role_permission_overrides;
CREATE TRIGGER role_permission_overrides_guard_trigger
  BEFORE INSERT OR UPDATE
  ON role_permission_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.role_permission_overrides_guard();
