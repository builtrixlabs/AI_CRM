# BASELINE 110 — Graph Data Model

**Version**: 1.0
**Effective Date**: 2026-05-07
**Authority**: D-002 directive (orchestration/002-graph-data-model)
**Status**: Locked (immutable after creation per Constitution VI + POLICY 001 Rule 2)
**Authority Order**: constitution > policy > **baseline (this file)** > memory > directive > conversation

---

## Purpose

Defines the canonical data model for every node, edge, signal, and embedding
in the Builtrix CRM. Every later directive (D-007 lead lifecycle, D-008 Cmd+K,
D-009 Model Gateway, D-010 WhatsApp inbound, D-013 Call Audit, D-112 custom
fields, D-115 Follow-up Agent, etc.) builds on this contract.

To modify any part of this baseline, an amendment directive must:

1. Be authored under `directives/<NNN>-baseline-amendment-110-<topic>.md`.
2. Include impact assessment on every directive that has shipped after D-002.
3. Pass Plan Mode review.
4. Ship a new migration that performs the change atomically.
5. Append the rationale to `memory/decisions.md`.

---

## I. Single `nodes` table — single-table polymorphism

Builtrix CRM uses **one** `nodes` table with a `node_type` discriminator
instead of per-entity tables (`leads`, `deals`, `contacts`, …). Reasons:

- **One Canvas component** for all types (D-006 Canvas).
- **Cross-type semantic search** is a single SQL query against `nodes.embedding`.
- **One provenance contract** — the Constitution III field set lives once.
- **Per-org custom fields** (D-112) extend `data.custom` without DDL drift.

The 10 valid `node_type` values:

```
lead | contact | deal | property | unit |
site_visit | call | activity | document | note
```

Constraint at the table level (`node_type CHECK …`) enforces this set.

---

## II. Type-specific shapes — Zod, not DDL

Each node type's `data` jsonb shape is described by a Zod schema in
`src/lib/nodes/schemas/<type>.ts`. Application code (specifically
`createNode` and `updateNodeData` in `src/lib/nodes/api.ts`) validates
input against the matching schema BEFORE inserting/updating. The DB stores
`data` as `jsonb NOT NULL DEFAULT '{}'` — no per-type column constraints.

This is a deliberate trade-off (decisions log D-002.1):

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Per-type tables | DB-level type safety | Schema explosion, agent code branches per type | ❌ |
| **`nodes.data` jsonb + app-level Zod** | One schema, one Canvas, GIN-indexable | Validation in TS not DB | ✅ (this baseline) |
| EAV | Maximally flexible | 5x slower joins, terrible UX | ❌ |

Reserved subkey on every type: `data.custom: Record<string, unknown>` —
populated by D-112's L1 custom fields engine. D-002 reserves the slot;
D-112 will validate it against the per-org `custom_fields` metadata table.

---

## III. Lifecycle states (PRD §8.2 + this baseline ratifies)

| Type | Allowed states | Terminal states |
|---|---|---|
| `lead` | new, contacted, qualified, **lost**, **on_hold**, **junk** | lost, on_hold, junk |
| `contact` | (stateless) | — |
| `deal` | qualified, site_visit_scheduled, site_visit_done, negotiation, booked, **lost**, **on_hold** | lost, booked, on_hold |
| `property` | available, held, booked, sold | sold |
| `unit` | available, held, booked, sold | sold |
| `site_visit` | scheduled, confirmed, completed, no_show | completed, no_show |
| `call` | (stateless) | — |
| `activity` | (stateless) | — |
| `document` | uploaded, verified, signed | signed |
| `note` | (stateless) | — |

`src/lib/nodes/states.ts` is the source of truth. `validateState(type, state)`
enforces:
- Stateful types: must pick a state in the allowed list; null/undefined rejected.
- Stateless types: state must be null/undefined.

DB does NOT enforce the (type, state) tuple — Plan-Mode trade-off documented
in `memory/decisions.md`. App-level discipline + tests cover the gap.

---

## IV. Edges (graph relations)

Allowed `edge_type` values (DB CHECK):

```
belongs_to | related_to | sourced_from | attended |
mentioned_in | duplicate_of | merged_into
```

Self-loops are forbidden via CHECK constraint
(`from_node_id <> to_node_id`).

Edges carry the same provenance set as nodes; soft-delete only.

Indexes: `(from_node_id, edge_type)` and `(to_node_id, edge_type)`,
both partial on `WHERE deleted_at IS NULL`.

---

## V. node_signals (derived metrics)

Allowed `signal_type` values:

```
intent | engagement | budget_match | velocity
```

D-002 only ships the table. Calculations are domain-specific and produced
by the agents that emit them (D-009 Lead Enrichment Agent for `intent`,
later directives for the rest). Each signal carries its own
`computed_at` + `computed_by` (agent service account or user) on top of
the standard provenance.

---

## VI. Embedding contract

- **Column**: `nodes.embedding vector(1536)` — pgvector.
- **Model**: `text-embedding-3-small` via Model Gateway (D-009 contract).
- **Index**: `ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`.
- **Source text**: `text_of_record(node)` = `label` + extracted strings from
  `data` + recent activity summaries. Implementation deferred to D-009.
- **Refresh**: every `nodes` INSERT or UPDATE OF (`data`, `label`) inserts
  one row into `embedding_queue`. Soft-delete (UPDATE OF `deleted_at`) does
  NOT enqueue (the trigger's UPDATE OF list excludes it).
- **Privacy**: embeddings stored in the same workspace as the source node;
  never exfiltrated. Per Constitution VII PII handling: PII is masked in
  the source text before embedding (D-009 implementation contract).

---

## VII. embedding_queue contract

Schema columns:

```
id            uuid PK
node_id       uuid FK nodes(id) ON DELETE CASCADE
reason        text  -- 'insert' | 'update' | 'manual_refresh'
requested_at  timestamptz
status        text  -- 'pending' | 'processing' | 'done' | 'failed' | 'deferred-d009'
attempts      int
last_error    text
processed_at  timestamptz
```

Visibility: **service-role only**. RLS is enabled with no authenticated
policy → `authenticated` and `anon` see zero rows. `super_admin` sees zero
rows. Only service-role (Inngest worker, server-side scripts) can read or
write the queue.

Workers MUST implement:

- **Idempotent processing**: re-processing a `done` row is a no-op.
- **Bounded attempts**: > 5 → mark `failed`, surface to operator log.
- **No PII in `last_error`**: errors are coded; full context lives in
  application logs (Constitution VII).

D-002 ships an Inngest stub that marks all rows `deferred-d009`. D-009
replaces the body with the real Model Gateway path.

---

## VIII. Provenance & Audit

Every domain table inherits the Constitution III provenance field set as
NOT NULL columns with app-set defaults:

```
created_at, created_by, created_via,
updated_at, updated_by, updated_via,
source_event_id (nullable),
ai_confidence  (nullable, 0..1),
deleted_at, deleted_by, deleted_reason (nullable triple)
```

`createNode` / `updateNodeData` / `softDeleteNode` (api.ts) are the only
ratified mutation entry points. Each writes one `audit_log` row per call.
Direct DB writes from outside this API are forbidden by convention; future
directives must add their writes through analogous helpers.

---

## IX. RLS posture

| Table | Authenticated | Service role |
|---|---|---|
| `nodes` | SELECT + INSERT + UPDATE scoped by `public.app_org_id()` | bypass |
| `edges` | same | bypass |
| `node_signals` | same | bypass |
| `embedding_queue` | **forbidden** (no policy) | bypass |

`super_admin` has no permissive policy on any of the above and
`public.app_org_id()` returns NULL for them → zero rows. Verified in
`tests/integration/nodes-rls.test.ts`.

---

## X. Forbidden patterns

- ❌ Direct INSERT into `nodes` from app code outside the api.ts helpers.
- ❌ Bypassing Zod validation by passing `unvalidated_data` to a server action.
- ❌ Creating new `node_type` values without a baseline-amendment directive.
- ❌ Writing to `embedding` from authenticated clients (RLS would let them
  with `update_org`, but writes must go through the queue → workers).
- ❌ Hard-deleting nodes / edges / signals (soft-delete only).
- ❌ Adding per-type CHECK constraints on `nodes` columns (use Zod).
- ❌ Storing PII inside `embedding` source text without masking (D-009 contract).

---

## XI. References

- Constitution: `memory/constitution.md` (Principles II, III, IV, VI, VII).
- PRD: `docs/PRD.md` §7 (Graph + Vector Data Model), §8.2 (Lifecycle states).
- Directive: `directives/002-graph-data-model.md`.
- Plan Mode artifacts: `orchestration/002-graph-data-model/{spec,plan,tasks}.md`.
- Migrations: `supabase/migrations/20260507130000..20260507130500*`.
- Source code: `src/lib/nodes/`, `src/lib/inngest/`.
- Tests: `tests/lib/nodes/**`, `tests/integration/{nodes-rls,embedding-queue,audit-on-node-mutations}.test.ts`.

---

**END OF BASELINE 110 — locked at ratification 2026-05-07.**
