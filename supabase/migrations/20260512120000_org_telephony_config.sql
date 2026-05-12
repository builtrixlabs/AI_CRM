-- D-433 — org_telephony_config: per-org live telephony provider configuration.
--
-- Each organization plugs in its own Exotel (or future Servetel/Knowlarity/
-- MyOperator/Ozonetel) credentials via /admin/integrations/telephony. The
-- application never holds shared/global provider credentials.
--
-- Credentials are AES-256-GCM encrypted at rest using INTEGRATION_ENCRYPTION_KEY
-- (D-501 src/lib/comms/encryption.ts) before INSERT. The decryption + dial
-- path is per-request, scoped to the calling user's org_id resolved by RLS.
--
-- RLS posture:
--   - SELECT for authenticated — own org rows only. NOTE: the raw
--     encrypted_credentials column IS exposed via this policy, so the UI
--     must ALWAYS read from the redacted view below; service-side code
--     reads via getSupabaseAdmin() (bypasses RLS) when it needs the
--     encrypted blob to decrypt for dialing.
--   - INSERT/UPDATE/DELETE: denied. Server actions perform writes via
--     getSupabaseAdmin() (service role), never via authenticated paths.

CREATE TABLE org_telephony_config (
  organization_id       uuid PRIMARY KEY
    REFERENCES organizations(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN (
                          'exotel',
                          'servetel',
                          'knowlarity',
                          'myoperator',
                          'ozonetel'
                        )),
  encrypted_credentials jsonb NOT NULL,
  virtual_number        text,
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

CREATE INDEX org_telephony_config_provider_idx
  ON org_telephony_config (provider);

ALTER TABLE org_telephony_config ENABLE ROW LEVEL SECURITY;

-- Authenticated read — own org only. Encrypted blob is exposed by this
-- policy, but UIs must always read from the redacted view below.
CREATE POLICY org_telephony_config_select_own_org
  ON org_telephony_config FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

-- Redacted view — never round-trips the encrypted blob to the client.
-- Replaces `encrypted_credentials` with `is_configured` boolean so the UI
-- can show "credentials saved (····)" without ever holding ciphertext.
CREATE OR REPLACE VIEW org_telephony_config_redacted
  WITH (security_invoker = true)
  AS
  SELECT
    organization_id,
    provider,
    (encrypted_credentials IS NOT NULL) AS is_configured,
    virtual_number,
    is_active,
    test_ping_at,
    test_ping_ok,
    test_ping_message,
    created_at,
    updated_at
  FROM org_telephony_config;

GRANT SELECT ON org_telephony_config_redacted TO authenticated;

NOTIFY pgrst, 'reload schema';
