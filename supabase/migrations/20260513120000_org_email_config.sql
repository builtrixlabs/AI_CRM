-- D-434 — org_email_config: per-org live email provider configuration.
--
-- Each organization plugs in its own Resend (or future Postmark) API key
-- via /admin/integrations/email. The application never holds shared
-- provider credentials. Mirrors org_telephony_config from D-433.
--
-- Credentials AES-256-GCM encrypted at rest using INTEGRATION_ENCRYPTION_KEY
-- (D-501 src/lib/comms/encryption.ts) before INSERT.

CREATE TABLE org_email_config (
  organization_id       uuid PRIMARY KEY
    REFERENCES organizations(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN (
                          'resend',
                          'postmark'
                        )),
  encrypted_credentials jsonb NOT NULL,
  from_email            text,
  from_name             text,
  verified_at           timestamptz,
  is_active             boolean NOT NULL DEFAULT false,
  test_ping_at          timestamptz,
  test_ping_ok          boolean,
  test_ping_message     text,
  -- Provenance (Constitution III)
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL
);

CREATE INDEX org_email_config_provider_idx
  ON org_email_config (provider);

ALTER TABLE org_email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_email_config_select_own_org
  ON org_email_config FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

CREATE OR REPLACE VIEW org_email_config_redacted
  WITH (security_invoker = true)
  AS
  SELECT
    organization_id,
    provider,
    (encrypted_credentials IS NOT NULL) AS is_configured,
    from_email,
    from_name,
    verified_at,
    is_active,
    test_ping_at,
    test_ping_ok,
    test_ping_message,
    created_at,
    updated_at
  FROM org_email_config;

GRANT SELECT ON org_email_config_redacted TO authenticated;

NOTIFY pgrst, 'reload schema';
