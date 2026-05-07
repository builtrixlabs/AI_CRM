#!/usr/bin/env bash
# V5 entry point. Invoked by the feature-builder agent.
#
# Usage: scripts/v5/build.sh "<operator intent>"
#
# Orchestrates Gates 1 → 5. The agent (not this script) owns Plan Mode at Gate 2
# and Gate 3 task-by-task execution: those are inherently interactive with the
# Claude Code session. This script:
#   - runs Gate 1 (directive-gen.sh) and Gate 2 setup (plan-gen.sh)
#   - prints the orchestration paths for the agent to surface in Plan Mode
#   - the agent then iterates tdd-task.sh in Gate 3
#   - then the agent calls verify.sh (Gate 4) and deploy.sh (Gate 5)
#   - this script can also be invoked with `--gate <n>` to run a single gate
#
# This split keeps the agent in control of the conversational moments
# (Plan Mode review, per-task TDD writes) while bash owns the deterministic
# orchestration steps.

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

# ── arg parsing ───────────────────────────────────────────────────
gate=all
if [[ "${1:-}" == "--gate" ]]; then
  gate="${2:-all}"; shift 2
fi
intent="${1:-}"
[[ -n "$intent" ]] || v5_die "usage: build.sh [--gate 1|2|3|4|5] \"<intent>\""

# ── Gate 1 — directive ───────────────────────────────────────────
if [[ "$gate" == all || "$gate" == 1 ]]; then
  v5_log "── Gate 1 — directive ─────────────────"
  directive_path=$(bash "$(dirname "$0")/directive-gen.sh" "$intent")
  v5_log "directive: ${directive_path}"
fi

# ── Gate 2 — plan content (Plan Mode is engaged by agent, not script) ────
if [[ "$gate" == all || "$gate" == 2 ]]; then
  v5_log "── Gate 2 — plan content ──────────────"
  : "${directive_path:?directive_path not set; run --gate 1 first or omit --gate}"
  plan_dir=$(bash "$(dirname "$0")/plan-gen.sh" "$directive_path")
  v5_log "plan: ${plan_dir}"
  v5_log "→ agent should now engage Plan Mode and surface ${plan_dir}/{spec,plan,tasks}.md"
  # When this script runs in agent context, exit here so the agent can take over.
  if [[ "$gate" == all ]]; then
    v5_log "halting before Gate 3 — agent now drives TDD per task"
    exit 0
  fi
fi

# Gates 3, 4, 5 are agent-driven (Gate 3 is per-task, 4 calls verify.sh,
# 5 calls deploy.sh). This script does not invoke them automatically; it
# exists so they can be re-run individually for debugging.

case "$gate" in
  3) v5_die "Gate 3 is per-task; invoke scripts/v5/tdd-task.sh directly" ;;
  4) bash "$(dirname "$0")/verify.sh" ;;
  5) v5_die "Gate 5 needs <directive-id> + commit message; call scripts/v5/deploy.sh directly" ;;
  all) ;;
  *)  v5_die "unknown gate: $gate" ;;
esac
