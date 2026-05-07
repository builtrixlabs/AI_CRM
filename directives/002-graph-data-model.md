# Directive 002 — Graph Data Model

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §4 D-002 + docs/PRD.md §7
**Authority:** memory/constitution.md (Principles II tenant isolation, III provenance, IV audit, VI baseline immutability, VII stack discipline)

---

## Problem

The Builtrix CRM is BOTH relational (this lead came from this campaign and is also this contact who walked into our showroom) AND semantic (find leads similar to ones who booked in Q1). Two architectural choices follow from PRD §7:

1. **Single `nodes` table** with `node_type` discriminator instead of per-entity tables (`leads`, `deals`, ...). Reasons: one Canvas component for all types, easy semantic search across types, one provenance contract, embedding similarity is trivial.
2. **`edges` table** for relations and **`node_signals` table** for derived signals (intent, engagement, budget_match, velocity).

Embeddings are stored in a `vector(1536)` column via pgvector. The actual embedding computation lands in D-009 (Model Gateway); D-002 ships the schema + a queue that D-009 will process.

This is a baseline-tier deliverable: once shipped it cannot be modified except via a constitution-amendment-style migration directive (Constitution VI).

## Success criteria

- [ ] `nodes`, `edges`, `node_signals`, `embedding_queue` tables exist with full Constitution III provenance.
- [ ] pgvector extension enabled; `nodes.embedding vector(1536)` column with `ivfflat` index using `vector_cosine_ops`.
- [ ] RLS scopes every read/write by `public.app_org_id()` — cross-tenant access returns 0 rows; verified positively + negatively.
- [ ] Postgres trigger on `nodes` INSERT/UPDATE inserts a row into `embedding_queue` (one row per node update).
- [ ] Inngest is wired (devDep + minimal `inngest.config.ts` + one function `embedding.refresh`); the function reads the queue and currently logs `TODO: D-009 wire Model Gateway` (stub).
- [ ] Zod schemas for all 10 node types in `src/lib/nodes/schemas/<type>.ts` (lead, contact, deal, property, unit, site_visit, call, activity, document, note).
- [ ] `src/lib/nodes/index.ts` exports a discriminated union of all 10 node-data shapes, plus a `nodeSchemaFor(type)` resolver.
- [ ] Helper functions `createNode()` / `updateNodeData()` validate against the type-specific Zod schema before writing — rejected payloads never reach the DB.
- [ ] Audit row written on every `createNode` / `updateNodeData` (Constitution IV).
- [ ] Baseline doc `baseline/110-graph-data-model.md` ratified at the end of the directive (immutable after).
- [ ] Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/nodes/`.

## Constraints

- **Stack** (Constitution VII): Next.js 16 / React 19 / TS strict / Supabase Postgres / pgvector / Inngest (locked stack — first-time use here, NOT a deviation). All as listed in Constitution.
- **Migrations**: additive only. Soft-delete only. Constitution VI baseline immutability applies once ratified.
- **Provenance**: every new table inherits the full provenance set per D-001 pattern.
- **Audit**: every state change appends an `audit_log` row via service-role client.
- **No app surfaces**: D-002 ships SQL + types + library code only. No new pages. The Canvas (D-006) consumes these.
- **No model gateway**: Embedding computation is D-009. Job stub returns "TODO: D-009".
- **TDD**: each task = RED test → minimal impl → REFACTOR (V5 D-06).

## Out of scope (explicit non-goals)

- Model Gateway, Anthropic / OpenAI calls, real embedding computation (D-009)
- Lead Enrichment Agent or any agent runtime (D-009)
- Intent scoring algorithm (D-006 + D-009)
- Canvas component or any UI (D-006)
- Lead lifecycle / state transitions (D-007)
- Cmd+K semantic search (D-008)
- Custom fields engine (D-112) — `data.custom` subkey is reserved but the metadata table is later
- `node_signals` calculation / population — D-002 ships the table, calculations are domain-specific and land with the agents that produce them
- Cross-product event bus (Call Audit / Legal Auditor / MIH integration) — D-013, D-014, D-118+

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md` (all D-001 patterns, confidence 1):

- **tenant-isolation-via-jwt-claim** — apply same `public.app_org_id()` predicate on every new RLS policy.
- **provenance-as-not-null-columns** — every new table inherits the full provenance field set.
- **append-only-via-trigger** — `audit_log` is the truth; no shortcuts.
- **supabase-helpers-in-public-app-prefix** — any new SQL helpers live in `public.app_*`.
- **postgrest-notify-after-ddl** — no DDL outside `supabase/migrations/` without a NOTIFY.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/002-graph-data-model/`.
- Estimate: **L** (3 tables + extension + 10 Zod schemas + Inngest scaffold + baseline doc + integration tests; 4–6 working sessions).
- After ratification, the schema is immutable per Constitution VI. Reviewer must confirm:
  - Field set on `nodes` covers every node type's needs without per-type column add-ons (custom fields land in `data.custom`).
  - The 10 node types and their states match PRD §8.2.
  - Edge types (`belongs_to | related_to | sourced_from | attended | mentioned_in | duplicate_of | merged_into`) cover known relations from PRD §6.1 / §7 / §8.
  - Embedding queue design is compatible with Inngest patterns we'll use in D-010 (WhatsApp webhook), D-013 (Call Audit events).
