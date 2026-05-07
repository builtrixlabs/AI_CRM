#!/usr/bin/env bash
# Supabase ops via the official CLI. Bash where possible per D-03; the MCP at
# scripts/mcp/supabase covers async-API-required operations (preview branches).
#
# Subcommands:
#   migrate-new <slug>         — create a timestamped migration file
#   migrate-up                 — apply migrations to local DB (`db reset && db push`)
#   types                      — regenerate TypeScript types
#   rls-test [test-spec]       — run RLS tests against local
#
# Usage: scripts/v5/supabase.sh <subcommand> [args...]

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

v5_require_cli supabase

cmd="${1:-}"; shift || true
case "$cmd" in

  migrate-new)
    slug="${1:-}"
    [[ -n "$slug" ]] || v5_die "usage: supabase.sh migrate-new <slug>"
    cd "${V5_REPO_ROOT}"
    supabase migration new "$slug"
    v5_log_event 3 supabase-migrate-new pass 0 "{\"slug\":\"${slug}\"}"
    ;;

  migrate-up)
    cd "${V5_REPO_ROOT}"
    v5_log "supabase db reset (local)"
    v5_retry_once supabase db reset || v5_die "supabase db reset failed twice"
    v5_log "supabase db push (local)"
    v5_retry_once supabase db push || v5_die "supabase db push failed twice"
    v5_log_event 3 supabase-migrate-up pass 0 "{}"
    ;;

  types)
    cd "${V5_REPO_ROOT}"
    out="${1:-src/lib/database.types.ts}"
    mkdir -p "$(dirname "$out")"
    supabase gen types typescript --local > "$out" \
      || v5_die "supabase gen types failed"
    v5_log "regenerated types: $out"
    v5_log_event 3 supabase-gen-types pass 0 "{\"out\":\"${out}\"}"
    ;;

  rls-test)
    cd "${V5_REPO_ROOT}"
    spec="${1:-supabase/tests}"
    [[ -d "$spec" || -f "$spec" ]] || v5_die "RLS test path not found: $spec"
    supabase test db || v5_die "supabase RLS test failed"
    v5_log_event 4 supabase-rls-test pass 0 "{}"
    ;;

  *)
    v5_die "unknown subcommand: $cmd (try migrate-new | migrate-up | types | rls-test)"
    ;;
esac
