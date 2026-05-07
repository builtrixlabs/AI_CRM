# Spec — 002-graph-data-model

## Acceptance criteria

### Schema (DB)

- [ ] **AC-1** `pgvector` extension is enabled (`CREATE EXTENSION IF NOT EXISTS vector;`).
- [ ] **AC-2** `nodes` table exists with columns matching the data model below; `embedding vector(1536)`.
- [ ] **AC-3** `edges` table exists referencing nodes from/to; `edge_type` constrained to the 7 valid values.
- [ ] **AC-4** `node_signals` table exists referencing nodes; `signal_type` constrained to the 4 valid values.
- [ ] **AC-5** `embedding_queue` table exists with one row per node refresh request.
- [ ] **AC-6** Indexes: `nodes (org_id, workspace_id, node_type, state) WHERE deleted_at IS NULL`; `nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`; `nodes USING gin (data)`; `edges (from_node_id, edge_type)` and `edges (to_node_id, edge_type)`; `node_signals (node_id, signal_type, computed_at DESC)`.
- [ ] **AC-7** Postgres trigger `nodes_after_change_enqueue_embedding` fires on INSERT/UPDATE of `nodes` and inserts a row into `embedding_queue` with `node_id`, `reason`, `requested_at = now()`.

### RLS

- [ ] **AC-8** `nodes_select_org` — authenticated users see only `organization_id = public.app_org_id() AND deleted_at IS NULL`.
- [ ] **AC-9** `nodes_insert_org` — INSERT requires `organization_id = public.app_org_id()`.
- [ ] **AC-10** `nodes_update_org` — UPDATE USING and WITH CHECK by `organization_id = public.app_org_id()`.
- [ ] **AC-11** Same set on `edges` and `node_signals` (org-scoped).
- [ ] **AC-12** super_admin sees 0 rows from each new table (negative test).
- [ ] **AC-13** `embedding_queue` is service-role only — no authenticated SELECT/INSERT policy; no policy = forbidden for authenticated.

### Zod schemas (app)

- [ ] **AC-14** `src/lib/nodes/types.ts` exports `NodeType` union of the 10 strings.
- [ ] **AC-15** `src/lib/nodes/schemas/<type>.ts` for each of the 10 types; default-export a Zod schema for the `data` jsonb shape.
- [ ] **AC-16** `src/lib/nodes/index.ts` exports `nodeSchemaFor(type: NodeType)` returning the right Zod schema.
- [ ] **AC-17** `createNode(input)` validates `input.data` against `nodeSchemaFor(input.node_type)` and rejects on `parse` failure with a typed error (no DB write attempted).
- [ ] **AC-18** Same for `updateNodeData(id, partial)` — validated against the schema and merged.

### Audit

- [ ] **AC-19** Every successful `createNode` writes one `audit_log` row with `action='node_create'`, `table_name='nodes'`, `record_id=<new-id>`, `diff` containing the inserted payload.
- [ ] **AC-20** Every successful `updateNodeData` writes one `audit_log` row with `action='node_update'`, `diff` containing `before` and `after` fragments.

### Inngest scaffold

- [ ] **AC-21** `inngest.config.ts` exists, exports a typed `inngest` client.
- [ ] **AC-22** Function `embedding.refresh` is registered; trigger event `node.embedding.refresh-requested` is sent on every embedding_queue write (via Postgres NOTIFY OR a polling job — Plan to decide).
- [ ] **AC-23** Function body is a stub: log `TODO: D-009 wire Model Gateway`, mark queue row processed with `status='deferred-d009'`. No real embedding call.

### Quality gates

- [ ] All untagged unit tests pass.
- [ ] Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/nodes/`.
- [ ] Integration suite still green (existing 11/11 from D-001 + new ≥ 8 covering nodes RLS + audit).
- [ ] CRITICAL security findings = 0.

### Baseline

- [ ] **AC-24** `baseline/110-graph-data-model.md` ratified — text describes data model, edge types, node states, embedding queue contract, and "do not modify without amendment directive".

---

## Data model

### Migration `20260507130000_pgvector_extension.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Migration `20260507130100_nodes.sql`

```sql
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
  state           text NULL,                        -- type-specific (PRD §8.2)
  -- Provenance
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

-- Hot path: org + workspace + type filters
CREATE INDEX nodes_org_ws_type_state_idx
  ON nodes (organization_id, workspace_id, node_type, state)
  WHERE deleted_at IS NULL;

-- jsonb queries (custom fields included)
CREATE INDEX nodes_data_gin_idx ON nodes USING gin (data);

-- Semantic similarity search
CREATE INDEX nodes_embedding_idx
  ON nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Migration `20260507130200_edges.sql`

```sql
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
  -- Provenance (full set, same shape as nodes)
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, created_via text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL, updated_via text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence numeric(3,2) NULL,
  deleted_at timestamptz NULL, deleted_by uuid NULL, deleted_reason text NULL
);

CREATE INDEX edges_from_idx ON edges (from_node_id, edge_type) WHERE deleted_at IS NULL;
CREATE INDEX edges_to_idx   ON edges (to_node_id,   edge_type) WHERE deleted_at IS NULL;
```

### Migration `20260507130300_node_signals.sql`

```sql
CREATE TABLE node_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  node_id         uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  signal_type     text NOT NULL CHECK (signal_type IN
                  ('intent','engagement','budget_match','velocity')),
  signal_value    numeric NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  computed_by     uuid NOT NULL,                    -- agent service account or user
  -- Provenance (same set)
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, created_via text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL, updated_via text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence numeric(3,2) NULL,
  deleted_at timestamptz NULL, deleted_by uuid NULL, deleted_reason text NULL
);

CREATE INDEX node_signals_node_type_time_idx
  ON node_signals (node_id, signal_type, computed_at DESC)
  WHERE deleted_at IS NULL;
```

### Migration `20260507130400_embedding_queue.sql`

```sql
CREATE TABLE embedding_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id      uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (reason IN ('insert','update','manual_refresh')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','done','failed','deferred-d009')),
  attempts     int NOT NULL DEFAULT 0,
  last_error   text NULL,
  processed_at timestamptz NULL
);

CREATE INDEX embedding_queue_status_idx
  ON embedding_queue (status, requested_at);

CREATE OR REPLACE FUNCTION public.enqueue_node_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO embedding_queue (node_id, reason)
  VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END);
  PERFORM pg_notify('node_embedding_request', NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nodes_after_change_enqueue_embedding ON nodes;
CREATE TRIGGER nodes_after_change_enqueue_embedding
  AFTER INSERT OR UPDATE OF data, label
  ON nodes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_node_embedding();
```

### Migration `20260507130500_nodes_rls.sql`

```sql
ALTER TABLE nodes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;

-- Pattern, repeated per table:
CREATE POLICY nodes_select_org ON nodes
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);
CREATE POLICY nodes_insert_org ON nodes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());
CREATE POLICY nodes_update_org ON nodes
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- Same for edges, node_signals.
-- embedding_queue: NO authenticated policy = forbidden. Only service_role inserts/reads.

NOTIFY pgrst, 'reload schema';
```

---

## Node-type schemas (Zod, `src/lib/nodes/schemas/`)

Each schema describes the `data` jsonb shape for that node type. Custom fields land under a reserved `custom` subkey (D-112 will validate them separately).

| Type | Key fields (excerpt) | Lifecycle states |
|---|---|---|
| `lead` | `phone`, `email`, `source`, `intent_score?`, `notes?`, `custom?` | `new` → `contacted` → `qualified` |
| `contact` | `phone`, `email`, `name`, `relationship?`, `custom?` | (none) |
| `deal` | `lead_id`, `expected_value`, `currency`, `pricing_sheet?`, `custom?` | `qualified` → `site_visit_scheduled` → `site_visit_done` → `negotiation` → `booked` / `lost` |
| `property` | `name`, `city`, `rera_number?`, `unit_count?`, `custom?` | `available` → `held` → `booked` → `sold` |
| `unit` | `property_id`, `unit_no`, `bhk`, `floor?`, `price`, `custom?` | mirrors property at unit level |
| `site_visit` | `lead_id`, `deal_id?`, `scheduled_at`, `coordinator_id?`, `custom?` | `scheduled` → `confirmed` → `completed` → `no_show` |
| `call` | `lead_id?`, `deal_id?`, `direction` (`inbound`/`outbound`), `duration_seconds`, `recording_url?`, `summary?`, `custom?` | (none) |
| `activity` | `subject_node_id`, `kind` (`whatsapp`/`email`/`note`/`task`/`meeting`), `summary`, `custom?` | (none) |
| `document` | `kind` (`offer_letter`/`booking_form`/`agreement`/...), `signed_url`, `version`, `custom?` | `uploaded` → `verified` → `signed` |
| `note` | `body` (markdown), `pinned?`, `custom?` | (none) |

---

## API contracts

### `src/lib/nodes/index.ts`

```ts
export type { NodeType } from "./types";
export { nodeSchemaFor } from "./schemas";
export { createNode, updateNodeData, softDeleteNode } from "./api";
```

### `createNode`

```ts
export async function createNode(input: {
  organization_id: string;
  workspace_id: string;
  node_type: NodeType;
  label: string;
  data: unknown;                        // validated against nodeSchemaFor(node_type)
  state?: string;
  created_via?: CreatedVia;
}): Promise<{ id: string }>;
```

Validates `input.data` via `nodeSchemaFor(input.node_type).parse(input.data)` BEFORE the INSERT. On parse error, throws `NodeValidationError` with the Zod issues attached; the DB is not touched. On success, inserts and writes `audit_log` row `action='node_create'`.

### `updateNodeData`

```ts
export async function updateNodeData(
  id: string,
  partial: Record<string, unknown>,    // partial data update
  via?: CreatedVia
): Promise<void>;
```

Reads the current `node_type` and the existing `data`, merges the partial, validates the merged result, then UPDATE. Audit row `action='node_update'` with `diff: { before, after }`.

### `softDeleteNode`

```ts
export async function softDeleteNode(id: string, reason: string): Promise<void>;
```

Sets `deleted_at`, `deleted_by`, `deleted_reason`. Audit row `action='node_delete'`. Cascading hard deletes are forbidden.

---

## Inngest

- `inngest.config.ts` — exports `inngest` client + the embedding refresh function.
- `embedding.refresh` function:
  - Trigger: `node.embedding.refresh-requested` event, OR scheduled poll of `embedding_queue WHERE status='pending'`.
  - Body for D-002: marks the queue row `status='deferred-d009'`, logs the TODO. No model gateway call.

D-002 ships the scaffold; D-009 will replace the body to call Model Gateway.

---

## UI surface

None. D-002 ships SQL + TS library code only.

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | `ivfflat` requires populated data to build a useful index. Empty index at D-002 is fine, will rebuild after D-009 backfill. | Document in baseline 110; D-009 plan must include a `REINDEX` or `vector_l2_ops` rebuild step. |
| RQ-2 | Trigger fires on every UPDATE of `data` or `label`. A bulk update from D-014 hardening could enqueue thousands of rows. | Job in D-002 just defers; the real risk lands in D-009. Document; add rate-limit guard in D-009. |
| RQ-3 | `embedding_queue` could grow unboundedly if D-009 is delayed. | Acceptable for D-002; Model Gateway directive will TRUNCATE `WHERE status='deferred-d009'` once it can process them. |
| RQ-4 | Storing all node types in one table means future per-type-only constraints are harder. | The `data` jsonb + Zod app validation contract supplies type discipline; DB has `node_type` CHECK + per-type RLS later if needed. |
| RQ-5 | `state` column is type-specific. Without per-type CHECK, a `lead` row could carry a `property` state. | App-level: `createNode` / `updateNodeData` validates state against the node_type's allowed enum (defined in `src/lib/nodes/states.ts`). DB-level: documented as Plan-Mode trade-off. |
| RQ-6 | pgvector index on empty table fails on Supabase managed DB? | Verified pgvector is available on Supabase. The `WITH (lists = 100)` is safe at zero rows. Plan B: defer index creation to a separate migration that runs after D-009 backfill. |
| RQ-7 | Inngest needs `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` envs at runtime. We don't have an Inngest account yet. | For D-002 stub, function runs locally via `inngest-cli dev`; production keys deferred until D-009 enables real processing. Documented. |
