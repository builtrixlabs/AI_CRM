#!/usr/bin/env bash
# Verify required CLIs per scripts/v5/PREREQS.md. Exit 0 = all good. Exit 2 = missing.
# Auth checks (gh, vercel, supabase) are advisory: --strict promotes them to hard fails.

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

declare -A CLIS=(
  [bash]="--version"
  [git]="--version"
  [node]="--version"
  [npm]="--version"
  [jq]="--version"
  [gh]="--version"
  [supabase]="--version"
  [vercel]="--version"
)

missing=0
for cli in "${!CLIS[@]}"; do
  if command -v "$cli" >/dev/null 2>&1; then
    ver=$(eval "$cli ${CLIS[$cli]}" 2>/dev/null | head -1 || echo "?")
    printf '  ✓ %-10s %s\n' "$cli" "$ver"
  else
    printf '  ✗ %-10s (missing)\n' "$cli"
    missing=$((missing + 1))
  fi
done

# Auth checks
if command -v gh >/dev/null 2>&1; then
  gh auth status >/dev/null 2>&1 && printf '  ✓ gh auth\n' || { printf '  ⚠ gh auth not logged in\n'; [[ $STRICT == 1 ]] && missing=$((missing + 1)); }
fi
if command -v vercel >/dev/null 2>&1; then
  vercel whoami >/dev/null 2>&1 && printf '  ✓ vercel auth\n' || { printf '  ⚠ vercel not logged in\n'; [[ $STRICT == 1 ]] && missing=$((missing + 1)); }
fi

if [[ $missing -gt 0 ]]; then
  v5_warn "$missing prerequisite(s) missing — see scripts/v5/PREREQS.md"
  exit 2
fi

v5_log "all prerequisites OK"
