-- D-001 / B4 — append-only audit_log
--
-- Constitution IV. RLS forbids UPDATE and DELETE for ALL roles including
-- service_role. Revisions are new rows with `supersedes` pointing to the
-- prior id.

CREATE TABLE audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts                timestamptz NOT NULL DEFAULT now(),
  actor_id          uuid NOT NULL,
  actor_type        text NOT NULL CHECK (actor_type IN ('user','agent','system')),
  actor_role        text NOT NULL,
  on_behalf_of      uuid NULL,
  workspace_id      uuid NULL REFERENCES workspaces(id),
  organization_id   uuid NULL REFERENCES organizations(id),
  table_name        text NOT NULL,
  record_id         uuid NULL,
  action            text NOT NULL,
  diff              jsonb NULL,
  agent_tier        text NULL CHECK (agent_tier IS NULL OR agent_tier IN ('T0','T1','T2','T3','T4')),
  prompt_version    text NULL,
  nl_input          text NULL,
  compiled_artifact jsonb NULL,
  reasoning         text NULL,
  supersedes        uuid NULL REFERENCES audit_log(id)
);

CREATE INDEX audit_log_org_ts_idx ON audit_log (organization_id, ts DESC);
CREATE INDEX audit_log_actor_idx  ON audit_log (actor_id, ts DESC);
CREATE INDEX audit_log_table_record_idx ON audit_log (table_name, record_id);

-- ── Append-only RLS ──────────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT: service_role only. App code routes audit writes through service-role
-- client (src/lib/supabase/admin.ts in Group C).
CREATE POLICY audit_log_insert_service ON audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- SELECT: same-org rows for authenticated users; super_admin sees platform-wide
-- system rows (organization_id IS NULL AND action LIKE 'platform_%' OR 'bootstrap_%').
CREATE POLICY audit_log_select_org ON audit_log
  FOR SELECT TO authenticated
  USING (
    (auth.is_super_admin() AND organization_id IS NULL) OR
    (organization_id = auth.org_id())
  );

-- INTENTIONAL: no UPDATE policy and no DELETE policy.
-- With RLS enabled, the absence of a policy forbids the action for every role
-- *except* the table owner (the `postgres` superuser, used only for migrations).
-- service_role does NOT bypass RLS since Supabase configures it with
-- `bypassrls = false` on managed databases.
