-- V6 Phase 3 (D-606) — Super Admin V6 capabilities.
--
-- Three additive changes:
--   1. super_admin_impersonation_log — records every impersonation session
--      (start + reason + end). CHECK enforces a meaningful reason.
--   2. platform_defects — lightweight defect/incident tracker. Severity +
--      status closed enums; related_audit_ids[] for cross-link.
--   3. organizations.feature_flags jsonb — per-org flag store, default '{}'.
--
-- All gated on `platform:manage` at the app layer. Both new tables are
-- super-admin-only at the RLS layer:
--   - select: super_admin only
--   - insert: super_admin only
--   - update: super_admin only (defects status changes etc.)
--   - delete: no policy (rows are forever)
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS feature_flags;
--   DROP TABLE IF EXISTS public.platform_defects;
--   DROP TABLE IF EXISTS public.super_admin_impersonation_log;

-- ── super_admin_impersonation_log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admin_impersonation_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id     uuid NOT NULL REFERENCES profiles(id),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  reason             text NOT NULL,
  CHECK (length(reason) >= 10)
);

CREATE INDEX IF NOT EXISTS super_admin_impersonation_log_admin_idx
  ON super_admin_impersonation_log (super_admin_id, started_at DESC);

CREATE INDEX IF NOT EXISTS super_admin_impersonation_log_org_idx
  ON super_admin_impersonation_log (organization_id, started_at DESC);

ALTER TABLE super_admin_impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impersonation_log_select_super_admin ON super_admin_impersonation_log;
CREATE POLICY impersonation_log_select_super_admin
  ON super_admin_impersonation_log FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

DROP POLICY IF EXISTS impersonation_log_insert_super_admin ON super_admin_impersonation_log;
CREATE POLICY impersonation_log_insert_super_admin
  ON super_admin_impersonation_log FOR INSERT TO authenticated
  WITH CHECK (public.app_is_super_admin());

DROP POLICY IF EXISTS impersonation_log_update_super_admin ON super_admin_impersonation_log;
CREATE POLICY impersonation_log_update_super_admin
  ON super_admin_impersonation_log FOR UPDATE TO authenticated
  USING (public.app_is_super_admin())
  WITH CHECK (public.app_is_super_admin());

-- ── platform_defects ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_defects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE SET NULL,
  severity          text NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  title             text NOT NULL,
  description       text NOT NULL,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix')),
  assigned_to       uuid REFERENCES profiles(id),
  related_audit_ids uuid[] NOT NULL DEFAULT '{}',
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  CHECK ((status NOT IN ('resolved','wont_fix') AND resolved_at IS NULL)
      OR (status IN ('resolved','wont_fix') AND resolved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS platform_defects_open_idx
  ON platform_defects (status, severity, created_at DESC)
  WHERE status NOT IN ('resolved','wont_fix');

CREATE INDEX IF NOT EXISTS platform_defects_org_idx
  ON platform_defects (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE platform_defects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_defects_select_super_admin ON platform_defects;
CREATE POLICY platform_defects_select_super_admin
  ON platform_defects FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

DROP POLICY IF EXISTS platform_defects_insert_super_admin ON platform_defects;
CREATE POLICY platform_defects_insert_super_admin
  ON platform_defects FOR INSERT TO authenticated
  WITH CHECK (public.app_is_super_admin());

DROP POLICY IF EXISTS platform_defects_update_super_admin ON platform_defects;
CREATE POLICY platform_defects_update_super_admin
  ON platform_defects FOR UPDATE TO authenticated
  USING (public.app_is_super_admin())
  WITH CHECK (public.app_is_super_admin());

-- ── organizations.feature_flags ─────────────────────────────────────────
-- Free-form jsonb store. The platform writes flags here via D-606's UI;
-- libs read them via isFeatureEnabled(org, flag, default).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
