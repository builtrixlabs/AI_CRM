-- D-001 / B3 — user_app_roles bridge
--
-- App roles layered on top of base_role. Workspace-scoped (NULL workspace_id
-- means "all workspaces in this org"). product_id is forward-compat for
-- Call Audit / Legal Auditor cross-product roles.

CREATE TABLE user_app_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    uuid NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id      text NOT NULL DEFAULT 'crm',
  app_role        text NOT NULL CHECK (app_role IN
                  ('org_owner','org_admin','workspace_admin','manager',
                   'sales_rep','read_only','channel_partner')),
  granted_by      uuid NOT NULL REFERENCES profiles(id),
  reason          text NULL,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL,
  -- workspace-NULL rows still need to be unique per user/org/product/app_role.
  -- Postgres treats NULLs as distinct in UNIQUE; we use a partial-unique index
  -- to enforce uniqueness for the NULL-workspace case explicitly.
  UNIQUE (user_id, organization_id, workspace_id, product_id, app_role)
);

CREATE UNIQUE INDEX user_app_roles_org_wide_uniq
  ON user_app_roles (user_id, organization_id, product_id, app_role)
  WHERE workspace_id IS NULL AND deleted_at IS NULL;

CREATE INDEX user_app_roles_user_idx ON user_app_roles (user_id) WHERE deleted_at IS NULL;
CREATE INDEX user_app_roles_org_idx ON user_app_roles (organization_id) WHERE deleted_at IS NULL;
