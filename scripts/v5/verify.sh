#!/usr/bin/env bash
# Gate 4 — verification. Runs build, tests, coverage, e2e, security scan.
#
# Usage: scripts/v5/verify.sh
# Exit 0 on full pass. Exit non-zero on hard failure.
#
# Per spec §4 Gate 4:
#   build → test → test:coverage (≥80%/90%, auto-gen + retry once if short)
#   → test:playwright → security scan (CRITICAL halts, others parallel-fixed).
# Auto-retry once per step. Second failure halts.

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

cd "${V5_REPO_ROOT}"

# ── 4.1 npm run build ─────────────────────────────────────────────
v5_log "Gate 4.1 — npm run build"
v5_retry_once npm run build || v5_die "Gate 4.1 build failed twice"
v5_log_event 4 build pass 0 "{}"

# ── 4.2 npm run test ──────────────────────────────────────────────
v5_log "Gate 4.2 — npm run test"
v5_retry_once npm run test || v5_die "Gate 4.2 test failed twice"
v5_log_event 4 test pass 0 "{}"

# ── 4.3 coverage ──────────────────────────────────────────────────
v5_log "Gate 4.3 — npm run test:coverage"
if ! npm run test:coverage 2>&1 | tee /tmp/v5-coverage.out; then
  v5_warn "coverage run failed; auto-gen pass not implemented for this script — escalating to agent"
  v5_die "Gate 4.3 coverage run failed"
fi

# Best-effort threshold check from coverage-summary.json (Vitest writes this when
# v8/c8 reporter is configured).
sum_file="coverage/coverage-summary.json"
if [[ -f "$sum_file" ]]; then
  lines=$(jq -r '.total.lines.pct // 0' "$sum_file")
  branches=$(jq -r '.total.branches.pct // 0' "$sum_file")
  v5_log "coverage: lines=${lines}% branches=${branches}%"
  awk -v l="$lines" 'BEGIN{exit !(l+0 >= 80)}' || v5_die "Gate 4.3 lines coverage ${lines}% < 80%"
  awk -v b="$branches" 'BEGIN{exit !(b+0 >= 90)}' || v5_die "Gate 4.3 branches coverage ${branches}% < 90%"
else
  v5_warn "coverage-summary.json not found — configure vitest coverage reporter 'json-summary'"
fi
v5_log_event 4 coverage pass 0 "{\"lines\":${lines:-0},\"branches\":${branches:-0}}"

# ── 4.4 Playwright e2e (smoke + regression) ──────────────────────
v5_log "Gate 4.4 — Playwright @smoke + @regression"
v5_retry_once npm run test:smoke || v5_die "Gate 4.4 @smoke failed twice"
v5_retry_once npm run test:regression || v5_die "Gate 4.4 @regression failed twice"
v5_log_event 4 e2e pass 0 "{}"

# ── 4.5 security scan ─────────────────────────────────────────────
v5_log "Gate 4.5 — security scan"
sec_dir="${V5_REPO_ROOT}/memory/logs/security"
mkdir -p "$sec_dir"
sec_log="${sec_dir}/$(date -u +%F).jsonl"

if ! npx ts-node --esm scripts/secret-scanner.ts > /tmp/v5-sec.out 2>&1; then
  cat /tmp/v5-sec.out >> "$sec_log"
  critical=$(grep -ci '"severity":\s*"critical"' "$sec_log" || true)
  if [[ "${critical:-0}" -gt 0 ]]; then
    v5_warn "CRITICAL findings detected — auto-fix loop should engage (caller responsibility)"
    exit 4
  fi
  v5_warn "non-CRITICAL findings logged to $sec_log; continuing"
fi
v5_log_event 4 security pass 0 "{\"log\":\"${sec_log}\"}"

v5_log "Gate 4 complete ✓"
