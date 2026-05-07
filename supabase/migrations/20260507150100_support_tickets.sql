-- D-004 / A2 — support_tickets placeholder
--
-- Org-side raises tickets; super_admin reads + responds via the platform
-- inbox (D-XXX). D-004 ships the table + RLS only; the inbox UI is a
-- placeholder page.

CREATE TABLE support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  raised_by       uuid NOT NULL REFERENCES profiles(id),
  subject         text NOT NULL,
  body            text NOT NULL,
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','responded','closed')),
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL CHECK (created_via IN
                  ('manual','call_audit','whatsapp','email','api_sync',
                   'ai_extraction','import','cp_portal','mih_event','system')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

CREATE INDEX support_tickets_org_idx ON support_tickets (organization_id, status, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_select_org ON support_tickets
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY tickets_insert_org ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY tickets_update_org ON support_tickets
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
