-- D-002 / B4 — node_signals (intent / engagement / budget_match / velocity)
--
-- Calculations are domain-specific and will be produced by the agents that
-- generate them (D-009 onwards). D-002 only ships the table + indexes.

CREATE TABLE node_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  node_id         uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  signal_type     text NOT NULL CHECK (signal_type IN
                  ('intent','engagement','budget_match','velocity')),
  signal_value    numeric NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  computed_by     uuid NOT NULL,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

CREATE INDEX node_signals_node_type_time_idx
  ON node_signals (node_id, signal_type, computed_at DESC)
  WHERE deleted_at IS NULL;
