-- D-208 — webhook_endpoints + webhook_deliveries.
--
-- v2 demo lens: real outbound HTTP delivery is V3. The "test" button
-- writes a synthetic delivery row so the surface is demoable end-to-end.

CREATE TABLE webhook_endpoints (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  url                 text NOT NULL,
  secret              text NOT NULL,
  events_subscribed   jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled             boolean NOT NULL DEFAULT true,
  -- Provenance
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  deleted_at          timestamptz NULL,
  deleted_by          uuid NULL
);

CREATE INDEX webhook_endpoints_org_idx
  ON webhook_endpoints (organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_select_own_org
  ON webhook_endpoints FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE TABLE webhook_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  endpoint_id         uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_kind          text NOT NULL,
  status_code         int NOT NULL,
  latency_ms          int NULL,
  response_preview    text NULL,
  ts                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_deliveries_endpoint_ts_idx
  ON webhook_deliveries (endpoint_id, ts DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_select_own_org
  ON webhook_deliveries FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
