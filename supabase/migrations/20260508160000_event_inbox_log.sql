-- D-013 / A1 — append-only ledger for inbound cross-product events.
--
-- Constitution IV (immutable audit) + III (provenance via
-- source_event_id flowing onto the corresponding `call`/`document` node).
-- Operators replay from this table when sister-product integration
-- has gaps.

CREATE TABLE event_inbox_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NULL REFERENCES organizations(id),
  event_id        text NOT NULL,                  -- provider uuid (string)
  event_kind      text NOT NULL,                  -- 'call.audited' | 'call.objection_detected' | ...
  source_product  text NOT NULL,                  -- 'call_audit' | 'legal_auditor' | 'mih'
  status          text NOT NULL CHECK (status IN ('ok','deduped','rejected','error')),
  reason          text NULL,
  resulting_node_id uuid NULL REFERENCES nodes(id)
);

CREATE INDEX event_inbox_log_event_id_idx
  ON event_inbox_log (event_id, ts DESC);

CREATE INDEX event_inbox_log_org_ts_idx
  ON event_inbox_log (organization_id, ts DESC);

-- Append-only via trigger (D-001.10 pattern).
CREATE OR REPLACE FUNCTION public.event_inbox_log_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'event_inbox_log is append-only';
END;
$$;

CREATE TRIGGER event_inbox_log_no_update
  BEFORE UPDATE ON event_inbox_log
  FOR EACH ROW EXECUTE FUNCTION public.event_inbox_log_append_only();

CREATE TRIGGER event_inbox_log_no_delete
  BEFORE DELETE ON event_inbox_log
  FOR EACH ROW EXECUTE FUNCTION public.event_inbox_log_append_only();

CREATE TRIGGER event_inbox_log_no_truncate
  BEFORE TRUNCATE ON event_inbox_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.event_inbox_log_append_only();

ALTER TABLE event_inbox_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_inbox_log_select_own
  ON event_inbox_log FOR SELECT TO authenticated
  USING (
    organization_id = public.app_org_id()
    OR public.app_is_super_admin()
  );

NOTIFY pgrst, 'reload schema';
