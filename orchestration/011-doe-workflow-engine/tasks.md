# Tasks — 011-doe-workflow-engine

Group A — schema + seed
- [ ] A1. Migration: `directives`
- [ ] A2. Migration: `directive_invocations` (append-only)
- [ ] A3. Seed migration: 15 default D-01..D-15 rows

Group B — library
- [ ] B1. Types: `TriggerKind`, `ActionKind`, `Outcome`, `DirectiveRow`
- [ ] B2. Pure condition evaluator + tests
- [ ] B3. Action handlers (5) + their tests
- [ ] B4. Trigger registry + matcher
- [ ] B5. Runtime: `dispatchDirective` + idempotency + rate limit
- [ ] B6. Runtime tests: dispatch, idempotent, rate-limited, ceiling

Group C — wiring
- [ ] C1. Inngest function on `lead.created` → dispatch
- [ ] C2. Updated `src/app/api/inngest/route.ts`

Group D — memory
- [ ] D1. decisions D-011.x
- [ ] D2. patterns: doe-event-trigger-table, idempotent-action-via-jsonb-key
