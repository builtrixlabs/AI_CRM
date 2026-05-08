-- D-011 / A2 — directive_invocations: append-only ledger.
--
-- One row per dispatch attempt. Powers the rate limit, idempotency
-- check, and operator visibility ("did D-09 fire on this lead?").
-- Append-only via trigger (D-001.10 pattern).

CREATE TABLE directive_invocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  directive_id    uuid NOT NULL REFERENCES directives(id),
  organization_id uuid NULL REFERENCES organizations(id),
  workspace_id    uuid NULL REFERENCES workspaces(id),
  subject_node_id uuid NULL REFERENCES nodes(id),
  trigger_id      text NOT NULL,           -- caller-provided dedup key
  outcome         text NOT NULL CHECK (outcome IN
                   ('dispatched','skipped_condition','skipped_disabled',
                    'skipped_idempotent','rate_limited',
                    'failed_tier_ceiling','pending_approval','error')),
  details         jsonb NULL,
  audit_log_id    uuid NULL                -- FK omitted to avoid cycles
);

CREATE INDEX directive_invocations_directive_ts_idx
  ON directive_invocations (directive_id, ts DESC);

CREATE INDEX directive_invocations_org_ts_idx
  ON directive_invocations (organization_id, ts DESC);

-- Idempotency: one DISPATCHED row per (directive_id, subject_node_id, trigger_id).
CREATE UNIQUE INDEX directive_invocations_idempotent_idx
  ON directive_invocations (directive_id, subject_node_id, trigger_id)
  WHERE outcome = 'dispatched';

-- Append-only via trigger.
CREATE OR REPLACE FUNCTION public.directive_invocations_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'directive_invocations is append-only';
END;
$$;

CREATE TRIGGER directive_invocations_no_update
  BEFORE UPDATE ON directive_invocations
  FOR EACH ROW EXECUTE FUNCTION public.directive_invocations_append_only();

CREATE TRIGGER directive_invocations_no_delete
  BEFORE DELETE ON directive_invocations
  FOR EACH ROW EXECUTE FUNCTION public.directive_invocations_append_only();

CREATE TRIGGER directive_invocations_no_truncate
  BEFORE TRUNCATE ON directive_invocations
  FOR EACH STATEMENT EXECUTE FUNCTION public.directive_invocations_append_only();

ALTER TABLE directive_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY directive_invocations_select_own
  ON directive_invocations FOR SELECT TO authenticated
  USING (
    organization_id = public.app_org_id()
    OR public.app_is_super_admin()
  );

NOTIFY pgrst, 'reload schema';
