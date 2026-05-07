-- D-002 / B2 — nodes table (single-table polymorphism by node_type)
--
-- Constitution III provenance + IV audit + VII stack discipline.
-- Single nodes table with node_type discriminator + jsonb data column —
-- chosen over per-type tables (PRD §7) so one Canvas component covers all
-- types and semantic search across types is trivial.

CREATE TABLE nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  node_type       text NOT NULL CHECK (node_type IN
                  ('lead','contact','deal','property','unit',
                   'site_visit','call','activity','document','note')),
  label           text NOT NULL,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding       vector(1536) NULL,
  state           text NULL,
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

-- Hot path: org + workspace + type + state filters. Most canvas queries.
CREATE INDEX nodes_org_ws_type_state_idx
  ON nodes (organization_id, workspace_id, node_type, state)
  WHERE deleted_at IS NULL;

-- jsonb queries (custom fields under data.custom included)
CREATE INDEX nodes_data_gin_idx ON nodes USING gin (data);

-- Semantic similarity search via pgvector. ivfflat with 100 lists is the
-- starting point; D-009 will REINDEX after backfill if a different lists
-- count proves better at scale.
CREATE INDEX nodes_embedding_idx
  ON nodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
