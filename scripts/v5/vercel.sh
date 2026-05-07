#!/usr/bin/env bash
# Vercel ops. Bash entry; the MCP at scripts/mcp/vercel handles auth + true async.
#
# Subcommands:
#   wait-preview <branch>      — poll for the preview URL of a feature branch (60s, then `vercel ls --json` fallback)
#   redeploy <git-sha>         — trigger a fresh deploy at a specific sha (used by Gate 6 after revert)
#
# Usage: scripts/v5/vercel.sh <subcommand> [args...]

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

v5_require_cli vercel
v5_require_cli jq

cmd="${1:-}"; shift || true
case "$cmd" in

  wait-preview)
    branch="${1:-}"
    [[ -n "$branch" ]] || v5_die "usage: vercel.sh wait-preview <branch>"
    cd "${V5_REPO_ROOT}"
    deadline=$(( $(date +%s) + 60 ))
    while [[ $(date +%s) -lt $deadline ]]; do
      url="$(vercel ls --json 2>/dev/null \
              | jq -r --arg b "$branch" '.[]? | select(.meta.gitCommitRef == $b) | .url' \
              | head -1)"
      if [[ -n "${url:-}" && "$url" != "null" ]]; then
        printf 'https://%s\n' "$url"
        v5_log_event 5 vercel-preview-poll pass 0 "{\"branch\":\"${branch}\"}"
        exit 0
      fi
      sleep 5
    done
    # 60s expired — fallback: pick the latest from `vercel ls --json` regardless of branch
    url="$(vercel ls --json 2>/dev/null | jq -r '.[0].url' || echo '')"
    if [[ -n "${url:-}" && "$url" != "null" ]]; then
      v5_warn "preview URL not branch-matched; falling back to latest: $url"
      printf 'https://%s\n' "$url"
      v5_log_event 5 vercel-preview-poll fallback 0 "{\"branch\":\"${branch}\"}"
      exit 0
    fi
    v5_log_event 5 vercel-preview-poll fail 0 "{\"branch\":\"${branch}\"}"
    v5_die "preview URL not captured within 60s and fallback empty"
    ;;

  redeploy)
    sha="${1:-}"
    [[ -n "$sha" ]] || v5_die "usage: vercel.sh redeploy <git-sha>"
    cd "${V5_REPO_ROOT}"
    vercel --prod --yes --git-commit-sha="$sha" \
      || v5_die "vercel redeploy failed for $sha"
    v5_log_event 6 vercel-redeploy pass 0 "{\"sha\":\"${sha}\"}"
    ;;

  *)
    v5_die "unknown subcommand: $cmd (try wait-preview | redeploy)"
    ;;
esac
