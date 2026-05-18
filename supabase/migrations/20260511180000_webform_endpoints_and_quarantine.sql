-- D-417 / A1 — webform_endpoints + leads_quarantine.
--
-- Per-org token-authenticated lead ingestion endpoints. Tokens are stored as
-- sha256 hashes; an 8-char plaintext prefix is kept for UI display. The
-- ingestion API (src/app/api/leads/ingest/[token]/route.ts) verifies the
-- token against this table and writes either a lead node or a quarantine row.
--
-- Additive only — no DROP, no destructive ALTER. Idempotent on re-apply via
-- IF NOT EXISTS / CREATE OR REPLACE.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS webform_endpoints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    uuid NULL REFERENCES workspaces(id) ON DELETE SET NULL,
  label           text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  -- token_hash = digest(plaintext, 'sha256'). UNIQUE so lookup-by-hash is O(1).
  token_hash      bytea NOT NULL UNIQUE,
  -- First 8 chars of the plaintext token, for UI display (e.g. "wf_abc123…").
  token_prefix    text NOT NULL CHECK (length(token_prefix) BETWEEN 4 AND 16),
  is_active       boolean NOT NULL DEFAULT true,
  last_received_at timestamptz NULL,
  received_count   integer NOT NULL DEFAULT 0,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL DEFAULT 'manual',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL DEFAULT 'manual',
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

CREATE INDEX IF NOT EXISTS webform_endpoints_org_idx
  ON webform_endpoints (organization_id, is_active)
  WHERE deleted_at IS NULL;

ALTER TABLE webform_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webform_endpoints_select_own ON webform_endpoints;
CREATE POLICY webform_endpoints_select_own
  ON webform_endpoints FOR SELECT TO authenticated
  USING (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  );

DROP POLICY IF EXISTS webform_endpoints_insert_own ON webform_endpoints;
CREATE POLICY webform_endpoints_insert_own
  ON webform_endpoints FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  );

DROP POLICY IF EXISTS webform_endpoints_update_own ON webform_endpoints;
CREATE POLICY webform_endpoints_update_own
  ON webform_endpoints FOR UPDATE TO authenticated
  USING (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  );

-- ── leads_quarantine ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads_quarantine (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  webform_endpoint_id uuid NULL REFERENCES webform_endpoints(id) ON DELETE SET NULL,
  source          text NOT NULL,
  raw_payload     jsonb NOT NULL,
  error_reason    text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz NULL,
  resolved_by     uuid NULL,
  resolved_action text NULL CHECK (resolved_action IN ('promoted','rejected') OR resolved_action IS NULL)
);

CREATE INDEX IF NOT EXISTS leads_quarantine_org_unresolved_idx
  ON leads_quarantine (organization_id, received_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE leads_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_quarantine_select_own ON leads_quarantine;
CREATE POLICY leads_quarantine_select_own
  ON leads_quarantine FOR SELECT TO authenticated
  USING (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  );

-- INSERTs to leads_quarantine come from the ingestion route via the service
-- role client (no RLS). UPDATEs (mark resolved) gated to org admins.
DROP POLICY IF EXISTS leads_quarantine_update_own ON leads_quarantine;
CREATE POLICY leads_quarantine_update_own
  ON leads_quarantine FOR UPDATE TO authenticated
  USING (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR (organization_id = public.app_org_id() AND public.app_is_org_admin_or_super())
  );

NOTIFY pgrst, 'reload schema';
