-- D-440 — org_sister_product_tokens: per-org bearer tokens for sister
-- products (Post-Sales CRM, lead-sources app, Legal Auditor, future).
--
-- Bearer-token model (not signing-secret). Each token belongs to
-- (organization_id, product_kind). The plaintext token is generated
-- server-side, returned ONCE at issuance, and stored only as a SHA-256
-- hash. Sister products POST `Authorization: Bearer <token>` to
-- /api/sister/v1/* and /api/sister/events/*; D-441/442/443 consume.
--
-- super_admin issues these via /platform/sister-products. org_admin
-- and operational roles never see tokens.

CREATE TABLE org_sister_product_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_kind    text NOT NULL CHECK (product_kind IN (
                    'post_sales_crm',
                    'lead_sources',
                    'legal_auditor'
                  )),
  token_hash      text NOT NULL,
  last4           text NOT NULL,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  last_used_at    timestamptz NULL,
  revoked_at      timestamptz NULL,
  revoked_by      uuid NULL,
  UNIQUE (token_hash)
);

-- Hot path: partial index for the verify lookup (skip revoked rows).
CREATE INDEX org_sister_product_tokens_active_hash_idx
  ON org_sister_product_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- Admin UI: list tokens per org.
CREATE INDEX org_sister_product_tokens_org_kind_idx
  ON org_sister_product_tokens (organization_id, product_kind);

ALTER TABLE org_sister_product_tokens ENABLE ROW LEVEL SECURITY;

-- super_admin only — neither org_admin nor anyone else can read these.
CREATE POLICY org_sister_product_tokens_select_super
  ON org_sister_product_tokens FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

-- Writes go through service role (server actions). Verify path also runs
-- under service role because we look up by hash directly.

NOTIFY pgrst, 'reload schema';
