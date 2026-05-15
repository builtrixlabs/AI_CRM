-- V6 Phase 2 (D-614) — Predefined Message Templates: per-org send policy.
--
-- agent_message_policies tells each AI agent, per agent_kind, whether to
-- auto-send its draft or queue it for operator approval. A missing row for
-- a (org, agent_kind) pair means the default — 'require_approval' — so the
-- table is sparse and new orgs need no seeding (PRD §D-614 AC-2).
--
--   1. agent_message_policies — the table. PK (organization_id, agent_kind);
--      mode is CHECK-constrained to the two policy values.
--   2. RLS — 4 org-scoped policies via public.app_org_id(). Org isolation
--      only; the agents:manage_policies permission gate is enforced in the
--      server action (same posture as brochures / project_sales_assignments).
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.agent_message_policies;  -- drops its policies with it

-- ── agent_message_policies ──────────────────────────────────────────────
-- updated_by is a bare uuid (no FK) to match the created_by / uploaded_by
-- posture of project_sales_assignments (D-608) and brochures (D-607).
CREATE TABLE IF NOT EXISTS agent_message_policies (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_kind      text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('auto_send', 'require_approval')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  PRIMARY KEY (organization_id, agent_kind)
);

ALTER TABLE agent_message_policies ENABLE ROW LEVEL SECURITY;

-- RLS enforces org isolation ONLY — the agents:manage_policies permission
-- gate is enforced in the server action, because the lookup
-- (resolveSendPolicy) runs on the service-role client from inside the
-- agents, which are not request-scoped to a single role.
DROP POLICY IF EXISTS agent_message_policies_select_org ON agent_message_policies;
CREATE POLICY agent_message_policies_select_org
  ON agent_message_policies FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS agent_message_policies_insert_org ON agent_message_policies;
CREATE POLICY agent_message_policies_insert_org
  ON agent_message_policies FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS agent_message_policies_update_org ON agent_message_policies;
CREATE POLICY agent_message_policies_update_org
  ON agent_message_policies FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS agent_message_policies_delete_org ON agent_message_policies;
CREATE POLICY agent_message_policies_delete_org
  ON agent_message_policies FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
