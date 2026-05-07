-- D-002 / B3 — edges table (graph relations between nodes)

CREATE TABLE edges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  from_node_id    uuid NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
  to_node_id      uuid NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
  edge_type       text NOT NULL CHECK (edge_type IN
                  ('belongs_to','related_to','sourced_from','attended',
                   'mentioned_in','duplicate_of','merged_into')),
  weight          numeric NULL,
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
  deleted_reason  text NULL,
  -- Forbid self-loops
  CONSTRAINT edges_no_self_loop CHECK (from_node_id <> to_node_id)
);

CREATE INDEX edges_from_idx ON edges (from_node_id, edge_type) WHERE deleted_at IS NULL;
CREATE INDEX edges_to_idx   ON edges (to_node_id,   edge_type) WHERE deleted_at IS NULL;
