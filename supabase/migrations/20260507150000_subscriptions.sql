-- D-004 / A1 — subscriptions: one row per organization
--
-- Plan-tier resource limits (max users, leads/mo, AI tokens) are recorded
-- but not enforced in D-004; enforcement lands in D-005 (user count) and
-- D-009 (LLM token caps). RLS scoped by app_org_id() — super_admin sees zero
-- rows by construction. Provisioning + plan changes go through service-role.

CREATE TABLE subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  plan_tier           text NOT NULL CHECK (plan_tier IN
                      ('starter','professional','enterprise','custom')),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
  starts_at           timestamptz NOT NULL DEFAULT now(),
  current_period_end  timestamptz NULL,
  notes               text NULL,
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

CREATE INDEX subscriptions_org_idx ON subscriptions (organization_id) WHERE deleted_at IS NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Org-scoped read; service-role writes only (provisioning + plan changes).
CREATE POLICY subscriptions_select_org ON subscriptions
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

NOTIFY pgrst, 'reload schema';
