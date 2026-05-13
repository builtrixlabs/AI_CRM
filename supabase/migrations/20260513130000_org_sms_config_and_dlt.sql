-- D-435 — org_sms_config + dlt_templates: per-org SMS provider config
-- with DLT (Distributed Ledger Technology, TRAI India SMS regulation)
-- template registry.
--
-- India's TRAI rules require every business SMS to use a registered DLT
-- template. Each organization runs its own DLT registration. We hold
-- both the MSG91 credentials AND the registered template ids per org.

-- ─── org_sms_config ──────────────────────────────────────────────────
CREATE TABLE org_sms_config (
  organization_id       uuid PRIMARY KEY
    REFERENCES organizations(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('msg91', 'gupshup')),
  encrypted_credentials jsonb NOT NULL,
  sender_id             text,
  dlt_entity_id         text,
  is_active             boolean NOT NULL DEFAULT false,
  test_ping_at          timestamptz,
  test_ping_ok          boolean,
  test_ping_message     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL
);

CREATE INDEX org_sms_config_provider_idx ON org_sms_config (provider);

ALTER TABLE org_sms_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_sms_config_select_own_org
  ON org_sms_config FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

CREATE OR REPLACE VIEW org_sms_config_redacted
  WITH (security_invoker = true)
  AS
  SELECT
    organization_id,
    provider,
    (encrypted_credentials IS NOT NULL) AS is_configured,
    sender_id,
    dlt_entity_id,
    is_active,
    test_ping_at,
    test_ping_ok,
    test_ping_message,
    created_at,
    updated_at
  FROM org_sms_config;

GRANT SELECT ON org_sms_config_redacted TO authenticated;

-- ─── dlt_templates ───────────────────────────────────────────────────
CREATE TABLE dlt_templates (
  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  template_id     text NOT NULL,
  content         text NOT NULL,
  category        text NOT NULL CHECK (category IN (
                    'promotional', 'transactional', 'service'
                  )),
  registered_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  PRIMARY KEY (organization_id, template_id)
);

CREATE INDEX dlt_templates_org_idx ON dlt_templates (organization_id);

ALTER TABLE dlt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY dlt_templates_select_own_org
  ON dlt_templates FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
