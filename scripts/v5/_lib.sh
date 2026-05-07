#!/usr/bin/env bash
# Shared helpers for scripts/v5/*.sh. Sourced, not executed.
#
# Conventions:
#  - Every public script sources this with: source "$(dirname "$0")/_lib.sh"
#  - All emitted output uses v5_log / v5_die. Bare `echo` is for stdout payloads only.
#  - Every public script runs v5_log_event at start + finish so memory/logs/execution
#    captures durations.

set -euo pipefail

# ── Repo discovery ─────────────────────────────────────────────
V5_REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
V5_LOG_DIR="${V5_REPO_ROOT}/memory/logs/execution"
mkdir -p "${V5_LOG_DIR}" "${V5_REPO_ROOT}/memory/logs/security" \
         "${V5_REPO_ROOT}/memory/logs/regressions" 2>/dev/null || true

# ── stderr-only logging (stdout is reserved for script payloads) ──
v5_log()   { printf '%s [v5] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
v5_warn()  { printf '%s [v5][warn] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
v5_die()   { printf '%s [v5][fatal] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; exit 1; }

# ── Append a structured event to today's execution log ────────────
v5_log_event() {
  # args: <gate> <op> <outcome> <duration_ms> [extra_json]
  local gate="$1" op="$2" outcome="$3" duration="${4:-0}" extra="${5:-{\}}"
  local ts file
  ts="$(date -u +%FT%TZ)"
  file="${V5_REPO_ROOT}/memory/logs/gates.jsonl"
  printf '{"ts":"%s","gate":%s,"op":"%s","outcome":"%s","duration_ms":%s,"extra":%s}\n' \
    "$ts" "$gate" "$op" "$outcome" "$duration" "$extra" >> "$file"
}

# ── Time a command, log the result ────────────────────────────────
v5_timed() {
  # args: <gate> <op> <command...>
  local gate="$1" op="$2"; shift 2
  local start end duration outcome=pass
  start=$(date +%s%3N 2>/dev/null || python -c 'import time;print(int(time.time()*1000))')
  if "$@"; then outcome=pass; else outcome=fail; fi
  end=$(date +%s%3N 2>/dev/null || python -c 'import time;print(int(time.time()*1000))')
  duration=$((end - start))
  v5_log_event "$gate" "$op" "$outcome" "$duration"
  [[ "$outcome" == pass ]]
}

# ── Slug helper ──────────────────────────────────────────────────
v5_slugify() {
  # args: <free text>
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' \
    | cut -c1-60
}

# ── Atomic directive numbering: ISO timestamp + slug ─────────────
v5_directive_id() {
  # args: <slug>
  local slug="$1" stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  printf '%s-%s' "$stamp" "$slug"
}

# ── Require a CLI, with friendly error ───────────────────────────
v5_require_cli() {
  command -v "$1" >/dev/null 2>&1 || v5_die "missing CLI: $1 — see scripts/v5/PREREQS.md"
}

# ── Repeatable retry-once wrapper for npm scripts ────────────────
v5_retry_once() {
  # args: <command...>
  if "$@"; then return 0; fi
  v5_warn "first attempt failed, retrying once: $*"
  if "$@"; then return 0; fi
  return 1
}
