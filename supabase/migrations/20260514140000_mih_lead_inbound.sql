-- V6 Phase 1 (D-604) — Marketing Intelligence Hub inbound API schema.
--
-- Implements docs/baselines/122-mih-inbound-contract.md §7:
--   1. nodes.source_external_id — MIH's stable id; the org-scoped dedup key.
--   2. nodes.source_payload     — the raw MIH payload, archived for audit.
--   3. dedup index on (organization_id, source_external_id) for lead rows.
--   4. mih_inbound_log          — per-request audit table (raw payload +
--      outcome) backing MIH-integration observability.
--
-- source_external_id joins source_event_id as a cross-cutting provenance
-- column on nodes (baseline/110 §VIII) — not a per-type CHECK constraint,
-- so baseline/110 §X is not crossed.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.mih_inbound_log;
--   DROP INDEX IF EXISTS public.nodes_source_external_id_idx;
--   ALTER TABLE public.nodes DROP COLUMN IF EXISTS source_payload;
--   ALTER TABLE public.nodes DROP COLUMN IF EXISTS source_external_id;

-- ── nodes provenance columns (baseline 122 §7) ──────────────────────────
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS source_external_id text;
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

-- Dedup hot path: lookup a lead by (org, MIH external_id). Partial — only
-- lead rows with a non-null external id participate.
CREATE INDEX IF NOT EXISTS nodes_source_external_id_idx
  ON nodes (organization_id, source_external_id)
  WHERE deleted_at IS NULL
    AND node_type = 'lead'
    AND source_external_id IS NOT NULL;

-- ── mih_inbound_log ─────────────────────────────────────────────────────
-- One row per inbound POST /api/sister/v1/leads request — the MIH-specific
-- audit/observability ledger. Keeps the full raw payload + MIH fields +
-- outcome that the generic event_inbox_log does not model.
CREATE TABLE IF NOT EXISTS mih_inbound_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id     text NOT NULL,
  phone_e164      text,
  source          text,
  source_channel  text,
  status          text NOT NULL CHECK (status IN
                  ('created', 'duplicate_merged', 'rejected', 'rate_limited')),
  lead_id         uuid REFERENCES nodes(id),
  reason          text,
  raw_payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mih_inbound_log_org_external_idx
  ON mih_inbound_log (organization_id, external_id);

CREATE INDEX IF NOT EXISTS mih_inbound_log_org_received_idx
  ON mih_inbound_log (organization_id, received_at DESC);

ALTER TABLE mih_inbound_log ENABLE ROW LEVEL SECURITY;

-- SELECT — same-org authenticated (org admins observe MIH traffic).
-- super_admin sees none (app_org_id() is NULL for them), consistent with
-- the audit_log / nodes RLS posture. Writes are service-role only (the
-- route uses the admin client) — no INSERT/UPDATE/DELETE policy is added,
-- mirroring the embedding_queue posture (baseline/110 §VII).
DROP POLICY IF EXISTS mih_inbound_log_select_org ON mih_inbound_log;
CREATE POLICY mih_inbound_log_select_org
  ON mih_inbound_log FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
