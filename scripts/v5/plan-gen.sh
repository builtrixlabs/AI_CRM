#!/usr/bin/env bash
# Gate 2 — generate spec + plan + tasks for a directive, ready for Plan Mode review.
#
# Usage: scripts/v5/plan-gen.sh <directive-path>
# Output: writes orchestration/<id>/{spec.md,plan.md,tasks.md}; prints the dir to stdout.
#
# Plan Mode itself is engaged by the Claude Code agent (Shift+Tab); this script
# only assembles the artifacts. The agent surfaces them inline to the operator.

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

directive="${1:-}"
[[ -n "$directive" && -f "$directive" ]] || v5_die "usage: plan-gen.sh <directive-path>"

id=$(basename "$directive" .md)
out="${V5_REPO_ROOT}/orchestration/${id}"
mkdir -p "$out"

# spec.md — acceptance criteria, data model, API contracts
cat > "${out}/spec.md" <<EOF
# Spec — ${id}

## Acceptance criteria
- [ ] <criterion 1, observable in preview URL>
- [ ] <criterion 2>
- [ ] All untagged tests pass (100%)
- [ ] Coverage ≥80% lines / ≥90% branches
- [ ] CRITICAL security findings = 0

## Data model
\`\`\`sql
-- migrations to be authored under supabase/migrations/
\`\`\`

## API contracts
- Routes: <list>
- Server actions: <list>
- RLS: <policy description>

## UI surface
- Pages: <list>
- shadcn components needed: <list>
EOF

# plan.md — files to be created/modified, migrations, tests, coverage
cat > "${out}/plan.md" <<EOF
# Plan — ${id}

## Files to be created
- src/...
- tests/...

## Files to be modified
- src/...

## Migrations
- supabase/migrations/<NNN>_<slug>.sql

## Tests (TDD order: RED → GREEN → REFACTOR per task)
- tests/<slug>.test.ts (Vitest unit, untagged → must pass)
- tests/e2e/<slug>.spec.ts (Playwright @smoke)

## Coverage estimate
- Lines: target ≥80%
- Branches: target ≥90%
- Stretch: <list of @stretch tests>

## Risks
- <call out anything Plan Mode reviewer should weigh>
EOF

# tasks.md — ordered task list for Gate 3
cat > "${out}/tasks.md" <<EOF
# Tasks — ${id}

Ordered for TDD execution. \`scripts/v5/tdd-task.sh\` consumes one at a time.

1. [unit] <task 1: write failing test, then minimal impl>
2. [migration] <task 2: schema change + RLS>
3. [unit] <task 3>
4. [e2e@smoke] <task 4: Playwright smoke>
5. [refactor] <task 5: clean while green>
EOF

v5_log_event 2 plan-gen pass 0 "{\"id\":\"${id}\"}"
v5_log "plan artifacts written: orchestration/${id}/{spec,plan,tasks}.md"
printf '%s\n' "$out"
