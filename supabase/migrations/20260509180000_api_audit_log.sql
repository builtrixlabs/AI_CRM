-- D-204 — api_audit_log: per-request security + cost trail.
--
-- Append-only via trigger (same pattern as audit_log, token_usage_ledger).
-- One row per API request that opts in via withApiAudit() wrapper.
--
-- RLS:
--   - SELECT: super_admin sees all; org_admin sees only own-org rows.
--   - INSERT: service role only (server actions / route wrappers).
--   - UPDATE / DELETE: blocked by trigger.

CREATE TABLE api_audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts                  timestamptz NOT NULL DEFAULT now(),
  method              text NOT NULL,
  path                text NOT NULL,
  status_code         int NOT NULL,
  user_id             uuid NULL,
  organization_id     uuid NULL REFERENCES organizations(id) ON DELETE SET NULL,
  ip                  text NULL,
  user_agent          text NULL,
  latency_ms          int NULL,
  permission_checked  text NULL,
  rate_limit_remaining int NULL
);

CREATE INDEX api_audit_log_ts_idx ON api_audit_log (ts DESC);
CREATE INDEX api_audit_log_org_ts_idx ON api_audit_log (organization_id, ts DESC);
CREATE INDEX api_audit_log_path_status_idx ON api_audit_log (path, status_code);

-- Append-only.
CREATE OR REPLACE FUNCTION api_audit_log_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'api_audit_log is append-only';
END;
$$;

CREATE TRIGGER api_audit_log_no_update
  BEFORE UPDATE ON api_audit_log
  FOR EACH ROW EXECUTE FUNCTION api_audit_log_append_only();

CREATE TRIGGER api_audit_log_no_delete
  BEFORE DELETE ON api_audit_log
  FOR EACH ROW EXECUTE FUNCTION api_audit_log_append_only();

CREATE TRIGGER api_audit_log_no_truncate
  BEFORE TRUNCATE ON api_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION api_audit_log_append_only();

ALTER TABLE api_audit_log ENABLE ROW LEVEL SECURITY;

-- super_admin sees everything.
CREATE POLICY api_audit_log_select_super
  ON api_audit_log FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

-- org_admin / org_owner / authenticated users see only own-org rows.
CREATE POLICY api_audit_log_select_own_org
  ON api_audit_log FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
