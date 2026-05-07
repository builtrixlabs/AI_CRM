#!/usr/bin/env bash
# Gate 3 — run a single TDD task: RED → GREEN → REFACTOR.
#
# This script is the contract between feature-builder agent and the v5 pipeline:
# the agent reads tasks.md, then for each task invokes the appropriate writer
# skill to produce code, then calls this script to verify the RED→GREEN→REFACTOR
# loop holds.
#
# Usage: scripts/v5/tdd-task.sh <task-id> <test-file>
#  task-id:    free-form identifier (logged)
#  test-file:  path of the failing test that the impl is supposed to make pass

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

task_id="${1:-}" test_file="${2:-}"
[[ -n "$task_id" && -n "$test_file" ]] || v5_die "usage: tdd-task.sh <task-id> <test-file>"
[[ -f "$test_file" ]] || v5_die "test file not found: $test_file"

# Determine runner from extension
case "$test_file" in
  *.spec.ts|*.spec.tsx|*.spec.mjs|*.spec.js|*e2e*) runner="npx playwright test --reporter=line $test_file" ;;
  *.test.ts|*.test.tsx|*.test.mjs|*.test.js)        runner="npx vitest run $test_file --reporter=basic" ;;
  *)                                                 v5_die "unrecognized test file pattern: $test_file" ;;
esac

# RED — confirm the test currently fails (sanity check that we wrote a real test)
v5_log "[$task_id] RED: expecting failure"
if eval "$runner" >/tmp/v5-tdd.out 2>&1; then
  v5_die "[$task_id] RED check failed — test passed before impl. Was it a real test?"
fi

# GREEN — caller is expected to have written the impl by now (this script is invoked
# AFTER the agent writes both test and impl). We re-run.
v5_log "[$task_id] GREEN: re-running after impl"
v5_retry_once eval "$runner" > /tmp/v5-tdd.out 2>&1 \
  || { cat /tmp/v5-tdd.out >&2; v5_die "[$task_id] GREEN failed — test still fails after impl"; }

# REFACTOR — re-run to confirm green is stable
v5_log "[$task_id] REFACTOR: stability re-run"
eval "$runner" > /tmp/v5-tdd.out 2>&1 \
  || { cat /tmp/v5-tdd.out >&2; v5_die "[$task_id] REFACTOR failed — test went red again"; }

v5_log_event 3 tdd-task pass 0 "{\"task\":\"${task_id}\",\"test\":\"${test_file}\"}"
v5_log "[$task_id] RED → GREEN → REFACTOR ✓"
