# Plan — 011-doe-workflow-engine

## Files to be created

### Migrations
| File | Lines (~) | Purpose |
|---|---|---|
| `supabase/migrations/20260508140000_directives.sql` | 90 | directives table + RLS |
| `supabase/migrations/20260508140100_directive_invocations.sql` | 80 | append-only ledger |
| `supabase/migrations/20260508140200_seed_default_directives.sql` | 200 | 15 D-01..D-15 rows seeded NULL-org |

### Library — DOE
| File | Purpose |
|---|---|
| `src/lib/doe/types.ts` | Trigger, Action kinds, DirectiveRow, Outcome enum |
| `src/lib/doe/runtime.ts` | `dispatchDirective`, `loadActiveDirectives`, condition + idempotency + rate limit |
| `src/lib/doe/conditions.ts` | `evaluateCondition` — pure-function predicate evaluator |
| `src/lib/doe/actions/index.ts` | action registry |
| `src/lib/doe/actions/surface_on_canvas.ts` | T0 |
| `src/lib/doe/actions/flag_lead.ts` | T1 |
| `src/lib/doe/actions/send_template_message.ts` | T2 (writes activity stub) |
| `src/lib/doe/actions/notify_user.ts` | T0 |
| `src/lib/doe/actions/attach_node.ts` | T1 |
| `src/lib/doe/triggers/index.ts` | trigger registry + matcher |
| `src/lib/doe/index.ts` | re-exports |
| `src/lib/inngest/functions/doe-on-lead-created.ts` | Inngest function listening on `lead.created` |

### Tests
| File | Purpose |
|---|---|
| `tests/lib/doe/runtime.test.ts` | dispatch, idempotency, rate limit, tier ceiling |
| `tests/lib/doe/conditions.test.ts` | predicate evaluator |
| `tests/lib/doe/actions/*.test.ts` | one per action |

## TDD order

1. Schema migrations.
2. Types + condition evaluator (pure).
3. Each action handler + its test.
4. Runtime + its test.
5. Inngest function wiring.

## Coverage targets

- `src/lib/doe/**` ≥ 80%/90%.

## Risks

- **Service-role table writes for the seed migration** — the seed
  rows have no human creator. Use the system uuid + `created_via='system'`.
- **Idempotency key uniqueness** — implemented as a unique
  partial index on `directive_invocations(directive_id,
  subject_node_id, trigger_id) WHERE outcome='dispatched'`.
- **Rate limit query** — per-directive per-org SUM over 24h
  window. Indexed.
