-- D-010 / A1 — append-only ledger for inbound WhatsApp webhooks.
--
-- Constitution IV (audit immutable) + III (provenance). Every webhook
-- POST writes one row regardless of dispatch outcome. Operators can
-- replay without spelunking provider logs.

CREATE TABLE whatsapp_inbound_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NULL REFERENCES organizations(id),
  workspace_id    uuid NULL REFERENCES workspaces(id),
  wa_message_id   text NOT NULL,
  from_phone_e164 text NULL,
  status          text NOT NULL CHECK (status IN ('ok','deduped','orphan','rejected','error')),
  reason          text NULL,
  activity_id     uuid NULL REFERENCES nodes(id),
  lead_id         uuid NULL REFERENCES nodes(id)
);

-- Idempotency-friendly index — same wa_message_id may appear multiple
-- times (one per provider retry). The activity_id stays unique via
-- the per-org dedup contract (see B5 in tasks.md).
CREATE INDEX whatsapp_inbound_log_message_idx
  ON whatsapp_inbound_log (wa_message_id, ts DESC);

CREATE INDEX whatsapp_inbound_log_org_ts_idx
  ON whatsapp_inbound_log (organization_id, ts DESC);

-- Append-only via trigger (D-001.10 pattern; service_role bypasses RLS,
-- triggers do not).
CREATE OR REPLACE FUNCTION public.whatsapp_inbound_log_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'whatsapp_inbound_log is append-only';
END;
$$;

CREATE TRIGGER whatsapp_inbound_log_no_update
  BEFORE UPDATE ON whatsapp_inbound_log
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_inbound_log_append_only();

CREATE TRIGGER whatsapp_inbound_log_no_delete
  BEFORE DELETE ON whatsapp_inbound_log
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_inbound_log_append_only();

CREATE TRIGGER whatsapp_inbound_log_no_truncate
  BEFORE TRUNCATE ON whatsapp_inbound_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.whatsapp_inbound_log_append_only();

ALTER TABLE whatsapp_inbound_log ENABLE ROW LEVEL SECURITY;

-- Org-scoped SELECT (org_admin can audit).
CREATE POLICY whatsapp_inbound_log_select_own_org
  ON whatsapp_inbound_log FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
