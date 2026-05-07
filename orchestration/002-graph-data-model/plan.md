# Plan — 002-graph-data-model

## Files to be created

### Migrations (`supabase/migrations/`)

| File | Lines (~) | Purpose |
|---|---|---|
| `20260507130000_pgvector_extension.sql` | 5 | `CREATE EXTENSION IF NOT EXISTS vector;` |
| `20260507130100_nodes.sql` | 90 | nodes table + provenance + 3 indexes (org/ws/type/state, gin(data), ivfflat(embedding)) |
| `20260507130200_edges.sql` | 70 | edges table + provenance + (from, edge_type) and (to, edge_type) indexes |
| `20260507130300_node_signals.sql` | 60 | node_signals table + provenance + (node_id, type, time) index |
| `20260507130400_embedding_queue.sql` | 60 | embedding_queue table + `enqueue_node_embedding()` trigger function + AFTER INSERT/UPDATE trigger on nodes |
| `20260507130500_nodes_rls.sql` | 90 | RLS on all 4 new tables + `NOTIFY pgrst, 'reload schema'` |

### Application code (`src/lib/nodes/`)

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/nodes/types.ts` | 30 | `NodeType` literal-union + `EdgeType` + `SignalType` |
| `src/lib/nodes/states.ts` | 60 | per-type allowed states map + `validateState(type, state)` |
| `src/lib/nodes/schemas/lead.ts` | 30 | Zod schema for lead's data shape |
| `src/lib/nodes/schemas/contact.ts` | 25 | Zod schema for contact |
| `src/lib/nodes/schemas/deal.ts` | 35 | Zod schema for deal |
| `src/lib/nodes/schemas/property.ts` | 30 | Zod schema for property |
| `src/lib/nodes/schemas/unit.ts` | 30 | Zod schema for unit |
| `src/lib/nodes/schemas/site_visit.ts` | 30 | Zod schema for site_visit |
| `src/lib/nodes/schemas/call.ts` | 30 | Zod schema for call |
| `src/lib/nodes/schemas/activity.ts` | 25 | Zod schema for activity |
| `src/lib/nodes/schemas/document.ts` | 30 | Zod schema for document |
| `src/lib/nodes/schemas/note.ts` | 20 | Zod schema for note |
| `src/lib/nodes/schemas/index.ts` | 25 | exports `nodeSchemaFor(type)` resolver |
| `src/lib/nodes/api.ts` | 130 | `createNode`, `updateNodeData`, `softDeleteNode` with Zod validation + audit log writes |
| `src/lib/nodes/index.ts` | 20 | re-exports |

### Inngest (`src/lib/inngest/`)

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/inngest/client.ts` | 25 | exports typed `inngest` client |
| `src/lib/inngest/functions/embedding-refresh.ts` | 50 | function definition; reads `embedding_queue`, sets status='deferred-d009', logs TODO |
| `src/app/api/inngest/route.ts` | 20 | Inngest webhook handler (POST/PUT) |

### Tests

| File | Type | Lines (~) | Purpose |
|---|---|---|---|
| `tests/lib/nodes/schemas.test.ts` | Vitest unit | 200 | per-type Zod schema acceptance + rejection (10 types × 2-3 cases each) |
| `tests/lib/nodes/states.test.ts` | Vitest unit | 60 | `validateState` accepts valid pairs, rejects mismatches |
| `tests/lib/nodes/api.test.ts` | Vitest unit | 150 | mocked supabase client; createNode validates Zod, writes audit; updateNodeData merges + revalidates; softDeleteNode |
| `tests/integration/nodes-rls.test.ts` | integration | 130 | rep A creates a lead in Org A → rep B in Org B sees 0; super_admin sees 0 |
| `tests/integration/edges-cascade.test.ts` | integration | 80 | edges respect org boundary; deleting a node soft-deletes edges to/from it (UPDATE deleted_at = now() trigger) |
| `tests/integration/embedding-queue.test.ts` | integration | 90 | INSERT into nodes triggers exactly one embedding_queue row; UPDATE OF data triggers another; TRUNCATE doesn't (it's blocked) |
| `tests/integration/audit-on-node-mutations.test.ts` | integration | 80 | createNode writes one audit_log row; updateNodeData writes another with diff |

### Baseline

| File | Lines (~) | Purpose |
|---|---|---|
| `baseline/110-graph-data-model.md` | 200 | "locked, immutable after creation" — describes data model, edge types, node states, embedding-queue contract |

## Files to be modified

| File | Change |
|---|---|
| `package.json` | add deps: `inngest` (runtime), `zod` (runtime) — both in Constitution VII stack |
| `vitest.config.ts` | extend `include` to cover `tests/lib/nodes/**` |
| `runbooks/integration-tests.md` | add Inngest local-dev and embedding-queue notes |

## Migrations applied via

```
supabase db push   # applies migrations 20260507130000..20260507130500
```

## Tests (TDD order — RED → GREEN → REFACTOR per task)

Group order in [tasks.md](tasks.md):

1. **Group A — pure Zod schemas (no DB)** A1..A11. RED → GREEN per type, then states + state validator.
2. **Group B — migrations + integration tests against real DB** B1..B7.
3. **Group C — Inngest scaffold + embedding-queue end-to-end** C1..C4.
4. **Group D — baseline doc + verify + PR** D1..D5.

## Coverage estimate

- **Lines** target ≥ 80% on `src/lib/nodes/`. Realistic 90% (Zod schemas have minimal branches; api.ts has error paths).
- **Branches** target ≥ 90% on `src/lib/nodes/`. Realistic 92%.
- **Stretch (`@stretch` tag)**: property-based fuzz the Zod parsers with `fast-check`. Not blocking.

## Risks (for Plan Mode reviewer)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | pgvector + ivfflat index creation on Supabase managed DB. | Low | pgvector is officially supported on Supabase since 2023; `lists = 100` works at zero rows. If it fails at apply, fall back to `vector_l2_ops` or defer index to D-009. |
| P-2 | Trigger fires on every UPDATE of `data` or `label` — D-007 lifecycle changes will enqueue many rows. | Med | Job is a stub for D-002; D-009 plan must add rate limiting + batch processing. Documented in baseline 110. |
| P-3 | Inngest dev account / keys are not yet provisioned. | Low | The function works locally via `inngest-cli dev`. Production keys deferred to D-009. |
| P-4 | Bulk updates in D-014 hardening could spike `embedding_queue` row count. | Low | Status `deferred-d009` rows can be truncated when D-009 lands. |
| P-5 | The 10 Zod schemas are the source of truth for node `data` shapes. Once committed they're effectively a contract for D-007 (lead lifecycle), D-013 (Call Audit). | Med | Plan-Mode reviewer must walk each schema against PRD §6.1 and §8 before approving. |
| P-6 | `ai_confidence` numeric(3,2) — what's the convention when it's not AI-driven? | Low | Stays NULL for human-authored writes. App contract: `ai_confidence` ⇒ AI involvement; NULL ⇒ human or system. |
| P-7 | Embedding column is NULL until D-009 backfills. Consumers querying `embedding IS NOT NULL` get 0 rows in D-002 / D-007 / D-008 (Cmd+K). | Low | Cmd+K (D-008) ships in catalog mode; semantic search is V2. Documented. |
| P-8 | RLS on `embedding_queue` blocks authenticated users entirely (intentional). But admin UIs in D-005 might want to surface "embedding lag" to org_admin. | Low | Add a SELECT-only policy for org_admin in D-005 if requested; D-002 keeps it locked down. |

## Out-of-scope reaffirmation

D-002 does NOT ship:
- Real embedding computation, OpenAI/Anthropic calls (D-009 Model Gateway)
- Lead Enrichment Agent or any agent runtime (D-009)
- node_signals calculation logic (the table is provisioned; signal producers ship with their agents)
- Canvas rendering, lead lifecycle, Cmd+K (D-006/D-007/D-008)
- Custom-fields metadata table (`custom_fields` from D-112 — `data.custom` subkey is reserved here only)
- shadcn install (still deferred — D-004)
