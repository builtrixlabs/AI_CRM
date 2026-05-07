# Tasks — 002-graph-data-model

Ordered for TDD execution. Estimated working sessions: **4-6**. Group boundaries are natural commit points.

---

## Group A — Pure schemas + states (no DB, no Inngest)

### A1. [unit] `src/lib/nodes/types.ts`

- Test: `NodeType` literal-union has exactly 10 members; importing each as a string compiles.
- Implement type definitions: `NodeType`, `EdgeType` (7 values), `SignalType` (4 values), `CreatedVia`.

### A2. [unit] Zod schema for `lead`

- Test: valid lead `{ phone, email, source }` parses; missing `phone` rejects; `intent_score` outside [0..100] rejects; unknown top-level key rejects (strict).
- Implement `src/lib/nodes/schemas/lead.ts`.

### A3. [unit] Zod schema for `contact`

- Test: at least one of `phone` / `email` required; both NULL rejects.
- Implement.

### A4. [unit] Zod schema for `deal`

- Test: `lead_id` UUID required; `expected_value` non-negative number; `currency` ISO-3 string (default `INR`).
- Implement.

### A5. [unit] Zod schemas for `property`, `unit`

- Test: property requires `name + city`; unit requires `property_id + unit_no + bhk + price`.
- Implement.

### A6. [unit] Zod schemas for `site_visit`, `call`

- Test: site_visit requires `lead_id + scheduled_at` (ISO datetime); call requires `direction in ['inbound','outbound'] + duration_seconds >= 0`.
- Implement.

### A7. [unit] Zod schemas for `activity`, `document`, `note`

- Test: activity requires `subject_node_id + kind + summary`; document requires `kind + signed_url + version`; note requires `body` (markdown string ≥ 1 char).
- Implement.

### A8. [unit] `nodeSchemaFor(type)` resolver

- Test: returns the correct Zod schema for each of the 10 types; throws for an invalid type.
- Implement `src/lib/nodes/schemas/index.ts`.

### A9. [unit] `src/lib/nodes/states.ts`

- Test: `validateState('lead', 'qualified')` ok; `validateState('lead', 'booked')` rejects (booked is deal); `validateState('contact', 'anything')` ok (no states).
- Implement state map per spec.

### Commit checkpoint A

- [ ] All Group A tests green.
- [ ] Coverage of `src/lib/nodes/{schemas,states,types}` ≥ 90% lines.
- [ ] Commit: `feat(nodes): zod schemas for 10 node types + state map (D-002 group A)`

---

## Group B — Migrations + integration tests

### B1. [migration] pgvector extension

- Write `20260507130000_pgvector_extension.sql`.
- `supabase db push --dry-run` to syntax-check.

### B2. [migration] nodes table + indexes

- Write `20260507130100_nodes.sql` per spec.
- Include the gin index on `data` and the ivfflat index on `embedding`.

### B3. [migration] edges table

- Write `20260507130200_edges.sql`.

### B4. [migration] node_signals table

- Write `20260507130300_node_signals.sql`.

### B5. [migration] embedding_queue + trigger

- Write `20260507130400_embedding_queue.sql`.
- Trigger `nodes_after_change_enqueue_embedding` fires AFTER INSERT OR UPDATE OF data, label.

### B6. [migration] RLS policies

- Write `20260507130500_nodes_rls.sql` per spec.
- Include `NOTIFY pgrst, 'reload schema'`.

### B7. [integration] node-rls

- `tests/integration/nodes-rls.test.ts` — provisions 2 orgs, asserts cross-org SELECT returns 0; super_admin sees 0 from each new table.

### B8. [integration] embedding-queue

- `tests/integration/embedding-queue.test.ts` — INSERT a node → expect 1 row in `embedding_queue` with reason='insert'. UPDATE its data → expect another with reason='update'. service-role only.

### B9. [integration] audit-on-node-mutations

- `tests/integration/audit-on-node-mutations.test.ts` — `createNode` API writes 1 audit row; `updateNodeData` writes another with `diff: { before, after }`.

### Commit checkpoint B

- [ ] All Group B integration tests green against the linked Supabase project.
- [ ] `supabase migration list` shows local + remote in sync.
- [ ] Commit: `feat(db): graph schema (nodes/edges/node_signals) + RLS + embedding queue (D-002 group B)`

---

## Group C — App API + Inngest scaffold

### C1. [unit] `createNode`

- Test (mocked supabase): valid input → INSERT; invalid Zod → throws `NodeValidationError` and DB is NOT touched (mock asserts `from` called only for audit_log).
- Implement `src/lib/nodes/api.ts::createNode`.

### C2. [unit] `updateNodeData`

- Test: reads existing data, merges partial, re-validates against the type's schema; on success writes UPDATE + audit row with before/after diff.
- Implement.

### C3. [unit] `softDeleteNode`

- Test: sets `deleted_at`, `deleted_by`, `deleted_reason`; writes audit row `action='node_delete'`.
- Implement.

### C4. [route] Inngest scaffold

- Create `src/lib/inngest/client.ts`, `src/lib/inngest/functions/embedding-refresh.ts`.
- Create `src/app/api/inngest/route.ts` registering the function via `serve` from `inngest/next`.
- Function body for D-002: read pending queue rows, set status='deferred-d009', log TODO. No model call.
- Test: a dry call to the function with a fake event marks the row as deferred.

### Commit checkpoint C

- [ ] `npm run build` green.
- [ ] All Group C unit + integration tests green.
- [ ] Commit: `feat(nodes): createNode/updateNodeData/softDeleteNode API + Inngest scaffold (D-002 group C)`

---

## Group D — Baseline doc + verify + PR

### D1. [doc] Baseline `baseline/110-graph-data-model.md`

- Describe the data model, edge types, node states, embedding queue contract.
- Header: "Locked. Modify only via amendment directive per Constitution VI."
- Note: this file MUST be added in the same commit that ratifies it; future PRs cannot modify it.

### D2. [doc] Update memory

- Append patterns: `node-data-as-jsonb-with-zod-validation`, `embedding-queue-pattern`, `inngest-job-stub-deferred`.
- Append decisions: D-002.1 single nodes table; D-002.2 jsonb + Zod over per-type tables; D-002.3 embedding queue stub for D-009.

### D3. [verify] V5 Gate 4 — full suite

- `npm run test` (all unit) → 40 + ~50 new = ~90.
- `npm run test:integration` → 11 + ~8 new = ~19.
- `npm run test:coverage` → ≥ 80 / ≥ 90 on `src/lib/nodes/`.
- `npm run build` → green.
- Security: `npm run test:security` → 0 CRITICAL.

### D4. [deploy] Vercel preview

- Push branch — Vercel auto-builds. Add Inngest env vars (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) for preview if needed; for D-002 the function only logs, so dummy values are fine.

### D5. [merge] open PR

- `gh pr create --base v1 --head feature/002-graph-data-model`.

---

## Commit cadence summary

| Checkpoint | Commit message |
|---|---|
| A | `feat(nodes): zod schemas for 10 node types + state map (D-002 group A)` |
| B | `feat(db): graph schema (nodes/edges/node_signals) + RLS + embedding queue (D-002 group B)` |
| C | `feat(nodes): createNode/updateNodeData/softDeleteNode API + Inngest scaffold (D-002 group C)` |
| D | `doc(baseline): ratify 110-graph-data-model + update memory (D-002 group D)` |

Final PR title: `feat: D-002 graph data model`

---

## Reviewer questions for Plan Mode

1. **Single `nodes` table vs per-type tables.** PRD chose single. Plan reaffirms. Reviewer: confirm; this decision is largely reversible later via VIEW + per-type subset, but the canvas component would have to be rewritten.
2. **Embedding queue model: trigger + Inngest poll vs `pg_notify` listener.** Plan ships both — trigger writes a queue row AND emits `pg_notify`. D-009 will pick whichever pattern Inngest's PG adapter supports best. Acceptable?
3. **State validation: app-level only.** No CHECK constraint on `(node_type, state)` pairs in the DB. Plan validates via `validateState()` in TS at write time. Reviewer: acceptable trade-off, or add CHECK?
4. **Zod schemas as Constitution VI baseline.** The 10 schemas + state map become baseline contracts (D-007 lead lifecycle, D-013 Call Audit will assume them). Reviewer: walk each schema before approving.
5. **`embedding_queue` is service-role only.** No authenticated visibility. If org_admin in D-005 wants to surface "embedding lag", that's a follow-up directive. Acceptable?
6. **Inngest in D-002 vs D-010.** Inngest scaffold ships here because D-002 is the first directive that *needs* a queue. Real Inngest cloud setup waits until D-009. Acceptable?
