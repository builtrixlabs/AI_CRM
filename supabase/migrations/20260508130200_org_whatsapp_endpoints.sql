-- D-010 / A2 — per-org WhatsApp webhook endpoint registry.
--
-- A row per org that has WhatsApp enabled, with the HMAC secret used
-- to sign inbound POSTs. Stored as a *hash* (not the raw secret); the
-- endpoint reconstructs the digest for `crypto.timingSafeEqual`.
--
-- The route uses (organization_id ? row exists ? row.workspace_default)
-- to resolve the workspace for orphan inbox creation when no lead matches.

CREATE TABLE org_whatsapp_endpoints (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_default_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- HMAC-SHA256 of the shared secret (hex). Equality-checked at verify time.
  secret_sha256         text NOT NULL,
  active                boolean NOT NULL DEFAULT true,
  -- Provenance (Constitution III — abridged: this table is set by org_admin
  -- via D-016 in the future; for V0 the bootstrap script seeds it).
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  created_via           text NOT NULL DEFAULT 'manual'
                        CHECK (created_via IN ('manual','system')),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  updated_via           text NOT NULL DEFAULT 'manual',
  deleted_at            timestamptz NULL,
  deleted_by            uuid NULL,
  deleted_reason        text NULL,
  UNIQUE (organization_id) -- one active endpoint per org for V0
);

CREATE INDEX org_whatsapp_endpoints_active_idx
  ON org_whatsapp_endpoints (organization_id)
  WHERE deleted_at IS NULL AND active = true;

ALTER TABLE org_whatsapp_endpoints ENABLE ROW LEVEL SECURITY;

-- super_admin sees all; org_admin sees own org only; nobody else.
CREATE POLICY org_whatsapp_endpoints_select_admin
  ON org_whatsapp_endpoints FOR SELECT TO authenticated
  USING (
    public.app_is_super_admin()
    OR organization_id = public.app_org_id()
  );

-- Writes via service-role only for V0 (D-016 will add the org_admin UI).
NOTIFY pgrst, 'reload schema';
