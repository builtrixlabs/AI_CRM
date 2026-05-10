-- D-208/D-311+ / V3.x — column-level encryption for webhook_endpoints.secret
--
-- v2/v3.0 stored the HMAC signing secret as plain TEXT. V3.x backlog item 7
-- requires at-rest encryption, mirroring the AES-256-GCM scheme used for
-- profiles.mfa_secret (D-300). This migration is additive only: legacy
-- rows keep their `secret` text column; new writes go to `secret_payload`
-- JSONB. App reads payload if present, falls back to text.
--
-- Migration of existing rows is a one-shot operator script (out of scope
-- for this DDL — see runbooks/v3-webhook-secret-encryption.md).

ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS secret_payload jsonb NULL;

COMMENT ON COLUMN webhook_endpoints.secret_payload IS
  'AES-256-GCM-encrypted HMAC signing secret. Shape: {iv, ciphertext, alg, key_version}. Encrypted with WEBHOOK_SECRET_ENCRYPTION_KEY env (32-byte hex). Read via lib/webhooks/secret-crypto.getEndpointSecret(); falls back to legacy `secret` text when payload is null.';

-- Make the legacy column nullable so future migrations can drop it without
-- back-compat shims for new endpoints.
ALTER TABLE webhook_endpoints
  ALTER COLUMN secret DROP NOT NULL;
