# Runbook: Gate 3 Failure (Execution / TDD)

## Symptoms
- TDD cycle stuck (RED never goes GREEN)
- shadcn install fails
- Supabase migration fails
- A task in `orchestration/<NNN>/tasks.md` repeatedly fails

## Diagnosis

1. `memory/logs/gates.jsonl` → most recent entry with `gate=3, outcome=failed`
2. `memory/logs/execution/<date>.jsonl` filtered to the directive_id
3. Identify which task and which subactivity (RED-write, GREEN-impl, REFACTOR, install, migration)

## Recovery (per failure type)

### TDD stuck in RED

Likely cause: the test asserts a behavior the implementation can't satisfy.

- Read the failing test
- Either:
  - **Simplify the test** — it's over-specified. Drop assertions that aren't in the spec.
  - **Rewrite the implementation** — the test is right; the impl is wrong.
- If the spec itself is wrong, go back to Gate 2 and regenerate via `spec-planner` subagent.

### shadcn install fails

- Check `npx shadcn@latest mcp` is reachable.
- Verify the component name spelling (use the `shadcn-component-install` skill's discovery step).
- Manual fallback: `npx shadcn@latest add <component>`.

### Supabase migration fails

- Read the migration error from logs.
- Common causes: type mismatch, FK constraint violation, RLS policy conflict.
- Fix forward: do NOT delete the migration file. Create a corrective migration.
- Re-run `supabase db push`.
- If types regen needed: `supabase gen types > src/types/database.types.ts`.

### A single task keeps failing after one retry

- Halt the pipeline. Do NOT retry a third time.
- Feature-builder subagent should set `status: "partial"` and return.
- Review the failing task with the operator.

## Validation

- Re-run the failed task only (not the whole gate).
- Confirm test passes / migration applies.
- Resume pipeline at the next task in `orchestration/<NNN>/tasks.md`.

## When to escalate

If the failure is in the spec/plan itself:
1. Roll back to Gate 2.
2. Regenerate spec/plan/tasks via `spec-planner`.
3. Resume at Gate 3 with the new task list.

If the failure is environmental (Supabase down, npm registry timeout):
1. Don't keep retrying. Halt.
2. Report environment status to operator.
3. Resume after the upstream issue is resolved.
