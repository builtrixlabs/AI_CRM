#!/usr/bin/env bash
# Gate 5 — branch + commit + push + Vercel preview URL.
#
# Usage: scripts/v5/deploy.sh <directive-id> "<commit-msg>"
# Output: prints preview URL on stdout.
#
# Steps per spec §4 Gate 5:
#  1. Pre-commit secret scan
#  2. git checkout -b feature/<slug>
#  3. git add . && git commit
#  4. git push origin feature/<slug>
#  5. Poll Vercel preview URL (60s, then `vercel ls --json` fallback)
#  6. Append gates.jsonl entry
#  7. Arm Gate 6 watchdog (handled by GitHub Action; we just confirm workflow exists)

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

id="${1:-}" msg="${2:-}"
[[ -n "$id" && -n "$msg" ]] || v5_die "usage: deploy.sh <directive-id> \"<commit-msg>\""

cd "${V5_REPO_ROOT}"

# ── 5.1 secret scan ───────────────────────────────────────────────
v5_log "Gate 5.1 — pre-commit secret scan"
npx ts-node --esm scripts/secret-scanner.ts \
  || v5_die "Gate 5.1 secret scan failed — fix before push"

# ── 5.2 branch ────────────────────────────────────────────────────
slug=$(printf '%s' "$id" | sed -E 's/^[0-9TZ-]+-//')   # strip ISO-timestamp prefix
[[ -n "$slug" ]] || slug="$id"
branch="feature/${slug}"

if ! git rev-parse --verify "$branch" >/dev/null 2>&1; then
  v5_log "Gate 5.2 — creating branch $branch"
  git checkout -b "$branch"
else
  v5_log "Gate 5.2 — branch $branch exists; switching"
  git checkout "$branch"
fi

# ── 5.3 commit ────────────────────────────────────────────────────
v5_log "Gate 5.3 — commit"
git add .
git commit -m "$msg" || v5_warn "nothing to commit"

# ── 5.4 push ──────────────────────────────────────────────────────
v5_log "Gate 5.4 — push origin $branch"
git push -u origin "$branch"

# ── 5.5 preview URL ──────────────────────────────────────────────
v5_log "Gate 5.5 — Vercel preview URL"
preview="$(bash "$(dirname "$0")/vercel.sh" wait-preview "$branch")" \
  || v5_die "Gate 5.5 preview URL not captured"

# ── 5.6 / 5.7 — log + arm watchdog ────────────────────────────────
v5_log_event 5 deploy pass 0 "{\"branch\":\"${branch}\",\"preview\":\"${preview}\"}"

if [[ ! -f "${V5_REPO_ROOT}/.github/workflows/post-merge-watchdog.yml" ]]; then
  v5_warn "Gate 6 watchdog workflow missing — Phase D output not present"
fi

v5_log "Gate 5 complete ✓"
printf '%s\n' "$preview"
