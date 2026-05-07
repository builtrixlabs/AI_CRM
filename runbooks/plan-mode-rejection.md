# Runbook — Plan Mode rejection (Gate 2)

**Scope:** What happens when you reject a plan in Plan Mode at Gate 2 of the pipeline. This is the only human checkpoint per D-04, so rejecting is a deliberate signal — V5 needs to interpret it correctly.

---

## What rejection means

Per spec §4 Gate 2, you have three choices in Plan Mode:

| Choice | What V5 does |
|---|---|
| **Approve** | Exit Plan Mode → Gate 3 (TDD execution) |
| **Edit** | V5 regenerates plan with your edits → re-presents in Plan Mode |
| **Reject** | V5 logs reason, exits build, **branch never created** |

A reject **does not** kill the directive. The `directives/<id>.md` file stays. The `orchestration/<id>/{spec,plan,tasks}.md` files stay. Only the build pipeline halts.

---

## After a rejection

V5 returns a `feature-builder` agent summary like:

```json
{
  "directive_id": "20260506T093015Z-lead-capture-form",
  "status": "plan-rejected",
  "preview_url": null,
  "files_changed": [
    "directives/20260506T093015Z-lead-capture-form.md",
    "orchestration/20260506T093015Z-lead-capture-form/spec.md",
    "orchestration/20260506T093015Z-lead-capture-form/plan.md",
    "orchestration/20260506T093015Z-lead-capture-form/tasks.md"
  ],
  "tests_passed": 0,
  "errors": [{"gate": 2, "message": "operator rejected plan: <reason>", "recoverable": true}]
}
```

The plan-rejection event is recorded in `memory/logs/gates.jsonl` with `outcome:plan-rejected`.

---

## Common rejection paths

### "The directive misunderstood my intent"

Most often the directive itself drifted from what you meant. Recovery:

1. Edit `directives/<id>.md` directly — fix `## Problem`, `## Success criteria`, `## Constraints`.
2. Re-issue the same prose intent in Claude Code — `feature-builder` will re-run from Gate 1, but reading your edited directive as input rather than re-deriving from your prompt. (If V5 fails to do this and re-derives, surface the rewritten intent more explicitly: `Build feature based on directives/<id>.md`.)

### "The plan is correct but too big — I want to ship a smaller slice"

1. Accept that the plan is right but the scope is wrong.
2. Reissue with a tighter prompt: `Build feature: <smaller scope>`. V5 generates a fresh directive + plan.
3. The original (bigger) directive stays as a future reference.

### "The plan looks fine but the migrations scare me"

The migration shape is probably the part you most want to review. Three options:

1. **Edit the plan in place** — adjust `## Migrations` in `orchestration/<id>/plan.md`, then approve. V5 regenerates `tasks.md` to match.
2. **Demand local-first migration testing** — add to the plan: "Apply locally and run `bash scripts/v5/supabase.sh rls-test` before any task that touches the new tables."
3. **Reject and split** — issue a separate `Build feature: schema for <slug>` first; that ships the migration alone. Then re-issue the original feature against the new schema.

### "The task list is in the wrong order"

Edit `orchestration/<id>/tasks.md` directly. Reissue. `feature-builder` consumes the file in document order — your edited order will be honored.

---

## What if I reject 3 times on the same prompt?

Per spec OQ-1 (open question with default): after 3 rejections, V5 should prompt: "Refine intent or abort?" Currently the agent doesn't enforce this — it'll keep accepting rejections silently. If you find yourself rejecting repeatedly, take that as the signal: stop and rethink the intent before another iteration.

Pragmatic move: open `directives/<id>.md`, write the intent in your own words at the top of `## Problem`, then issue a fresh `Build feature: <intent>` from there. V5 will treat it as a new directive.

---

## Logs to consult

| Source | What it tells you |
|---|---|
| `memory/logs/gates.jsonl` | All gate transitions including plan-rejected events |
| `directives/<id>.md` | The directive itself (V5 read this to generate the plan) |
| `orchestration/<id>/{spec,plan,tasks}.md` | The artifacts you reviewed in Plan Mode |
| `memory/learned/<product>/patterns.md` | Patterns V5 referenced when generating; lets you see if a stale pattern misled the plan |

---

## When NOT to reject

- "I want a small tweak" → use **Edit** instead. Round-trip is faster.
- "The build looks slow" → approve and observe; Gate 4 will halt if slow becomes fail.
- "I'm tired and want to sleep on it" → approve and review the preview URL tomorrow. The branch + preview are local artifacts; nothing reaches `main` without your merge.
