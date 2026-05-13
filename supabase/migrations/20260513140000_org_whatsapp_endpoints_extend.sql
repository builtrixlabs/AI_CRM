-- D-432 — extend org_whatsapp_endpoints (D-010) with outbound provider
-- credentials, from-number routing, and approved-template registry.
--
-- D-010 originally shipped this table for INBOUND HMAC verification.
-- D-432 lights outbound + inbound via Gupshup BSP or Meta Cloud API
-- direct. New columns are nullable so existing V0 rows (which only had
-- secret_sha256) continue to verify inbound webhooks even before the
-- org_admin reconfigures outbound.

ALTER TABLE org_whatsapp_endpoints
  ADD COLUMN provider              text NULL
    CHECK (provider IS NULL OR provider IN ('gupshup', 'cloud_api')),
  ADD COLUMN encrypted_credentials jsonb NULL,
  ADD COLUMN approved_template_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN from_phone_number_id  text NULL,
  ADD COLUMN from_display_number   text NULL,
  ADD COLUMN test_ping_at          timestamptz NULL,
  ADD COLUMN test_ping_ok          boolean NULL,
  ADD COLUMN test_ping_message     text NULL;

-- Redacted view — never exposes secret_sha256 or encrypted_credentials.
-- Surfaces is_configured = "outbound provider has been set up" so the
-- /admin/integrations index can render the health badge.
CREATE OR REPLACE VIEW org_whatsapp_endpoints_redacted
  WITH (security_invoker = true)
  AS
  SELECT
    organization_id,
    workspace_default_id,
    provider,
    (encrypted_credentials IS NOT NULL) AS is_configured,
    active AS is_active,
    from_phone_number_id,
    from_display_number,
    array_length(approved_template_ids, 1) AS approved_templates_count,
    test_ping_at,
    test_ping_ok,
    test_ping_message,
    created_at,
    updated_at,
    deleted_at
  FROM org_whatsapp_endpoints
  WHERE deleted_at IS NULL;

GRANT SELECT ON org_whatsapp_endpoints_redacted TO authenticated;

NOTIFY pgrst, 'reload schema';
