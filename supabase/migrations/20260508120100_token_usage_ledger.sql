-- D-009 / A2 — token_usage_ledger (append-only via trigger; D-001.10 pattern).
-- Per-call log of every Model Gateway invocation (success or failure).
-- Pre-call cap check (Model Gateway) SUMs this table for the current
-- calendar month per organization_id.

CREATE TABLE token_usage_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES organizations(id),
  agent_id        uuid NULL REFERENCES agent_service_accounts(id),
  request_id      text NOT NULL,
  model_used      text NOT NULL,
  call_kind       text NOT NULL CHECK (call_kind IN ('complete','embed')),
  tokens_in       int NOT NULL DEFAULT 0,
  tokens_out      int NOT NULL DEFAULT 0,
  duration_ms     int NULL,
  status          text NOT NULL CHECK (status IN ('ok','error')),
  error_code      text NULL,
  ts              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX token_usage_ledger_org_ts_idx
  ON token_usage_ledger (organization_id, ts DESC);

CREATE INDEX token_usage_ledger_request_id_idx
  ON token_usage_ledger (request_id);

-- Append-only via trigger (RLS no-policy is insufficient because
-- service_role has bypassrls=true; same precedent as audit_log
-- D-001.10).
CREATE OR REPLACE FUNCTION token_usage_ledger_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'token_usage_ledger is append-only';
END;
$$;

CREATE TRIGGER token_usage_ledger_no_update
  BEFORE UPDATE ON token_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION token_usage_ledger_append_only();

CREATE TRIGGER token_usage_ledger_no_delete
  BEFORE DELETE ON token_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION token_usage_ledger_append_only();

CREATE TRIGGER token_usage_ledger_no_truncate
  BEFORE TRUNCATE ON token_usage_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION token_usage_ledger_append_only();

ALTER TABLE token_usage_ledger ENABLE ROW LEVEL SECURITY;

-- Authenticated users see only their org's ledger rows. org_admin can
-- audit per-month spend; sales_rep can see (read-only, info only).
-- super_admin sees zero rows because app_org_id() returns NULL for
-- platform-tier accounts.
CREATE POLICY token_usage_ledger_select_own_org
  ON token_usage_ledger FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
