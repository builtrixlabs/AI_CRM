-- D-132 / Phase A — org_integration_secrets: per-org runtime secrets.
--
-- D-016 ships platform_secrets (singleton, super-admin scope) for things
-- like Anthropic / OpenAI API keys. Per-org integration secrets (Voice IQ
-- HMAC, future Slack webhook signing keys, etc.) need their own home so
-- org_admin can rotate without super-admin involvement and orgs are
-- cleanly isolated.
--
-- Resolution order at runtime (src/lib/integrations/voice-iq/secret.ts):
--   1. org_integration_secrets[org_id, kind].value
--   2. platform_secrets[<fallback_kind>].value   (e.g. builtrix_event_inbox_secret)
--   3. process.env[<env_name>]
--   4. null
--
-- RLS:
--   - SELECT (redacted view): authenticated user where caller's org_id
--     matches the row's organization_id.
--   - INSERT/UPDATE: service role only (server actions use admin client,
--     verify caller permission before writing).

CREATE TABLE org_integration_secrets (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  kind            text NOT NULL CHECK (kind IN (
                    'voice_iq_inbox_secret'
                  )),
  value           text NOT NULL,
  last4           text NOT NULL,
  rotated_at      timestamptz NOT NULL DEFAULT now(),
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  PRIMARY KEY (organization_id, kind)
);

CREATE INDEX org_integration_secrets_org_idx
  ON org_integration_secrets (organization_id);

ALTER TABLE org_integration_secrets ENABLE ROW LEVEL SECURITY;

-- Authenticated path — caller can SELECT only own-org rows.
-- Note: this still exposes `value` to anyone with rights; the UI must
-- ALWAYS read from `org_integration_secrets_redacted` (below).
CREATE POLICY org_integration_secrets_select_own_org
  ON org_integration_secrets FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

-- Redacted view — never round-trips raw value to the client.
CREATE OR REPLACE VIEW org_integration_secrets_redacted
  WITH (security_invoker = true)
  AS
  SELECT organization_id, kind, last4, rotated_at, created_at, updated_at
    FROM org_integration_secrets;

GRANT SELECT ON org_integration_secrets_redacted TO authenticated;

NOTIFY pgrst, 'reload schema';
