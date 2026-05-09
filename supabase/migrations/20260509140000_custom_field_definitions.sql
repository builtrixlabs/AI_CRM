-- D-020 / A1 — custom_field_definitions: per-org per-node-type custom fields.
--
-- Storage for custom fields keys still lives on each node's data.custom
-- jsonb (reserved by D-002). This table tells the UI which keys to
-- surface and how to render them.

CREATE TABLE custom_field_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  node_type       text NOT NULL CHECK (node_type IN
                  ('lead','deal','contact','property','unit','site_visit',
                   'document','activity','note','call')),
  field_key       text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN
                  ('string','number','email','phone','date','boolean','select')),
  required        boolean NOT NULL DEFAULT false,
  options         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- string[] for kind=select
  sort_order      integer NOT NULL DEFAULT 0,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL DEFAULT 'manual',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL DEFAULT 'manual',
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL,
  UNIQUE (organization_id, node_type, field_key)
);

CREATE INDEX custom_field_definitions_org_type_idx
  ON custom_field_definitions (organization_id, node_type, sort_order)
  WHERE deleted_at IS NULL;

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_field_definitions_select_own
  ON custom_field_definitions FOR SELECT TO authenticated
  USING (
    organization_id = public.app_org_id()
    OR public.app_is_super_admin()
  );

CREATE POLICY custom_field_definitions_insert_own
  ON custom_field_definitions FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

CREATE POLICY custom_field_definitions_update_own
  ON custom_field_definitions FOR UPDATE TO authenticated
  USING (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  )
  WITH CHECK (
    organization_id = public.app_org_id()
    AND public.app_is_org_admin_or_super()
  );

NOTIFY pgrst, 'reload schema';
