-- D-003 / B1 — role_permission_overrides table
--
-- Per-org allow / deny on a (role, permission) pair. Resolved by the
-- three-layer permission resolver in src/lib/auth/rbac.ts:
--   base UNION bridge UNION allow EXCEPT deny
-- Deny wins; PLATFORM_ONLY allow rejected at write time (B2 trigger).

CREATE TABLE role_permission_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role            text NOT NULL CHECK (role IN
                  ('org_owner','org_admin','workspace_admin','manager',
                   'sales_rep','read_only','channel_partner')),
  permission      text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('allow','deny')),
  reason          text NOT NULL,
  -- Provenance (Constitution III)
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
  deleted_reason  text NULL
);

CREATE UNIQUE INDEX role_permission_overrides_uniq
  ON role_permission_overrides (organization_id, role, permission, mode)
  WHERE deleted_at IS NULL;

CREATE INDEX role_permission_overrides_org_idx
  ON role_permission_overrides (organization_id)
  WHERE deleted_at IS NULL;
