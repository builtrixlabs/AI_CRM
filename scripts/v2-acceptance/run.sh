#!/usr/bin/env bash
# scripts/v2-acceptance/run.sh
#
# v2 acceptance runner. Wraps the Playwright suite at
# tests/e2e/v2-acceptance.spec.ts with the env it needs and runs the
# demo-data seeder beforehand so populated surfaces have something to
# render.
#
# Inputs (env vars; you can also set them in .env.local):
#   PLAYWRIGHT_BASE_URL          — preview deploy URL (required)
#   SUPABASE_URL                 — Supabase project URL (required)
#   SUPABASE_SERVICE_ROLE_KEY    — service-role key (required)
#   TEST_SUPER_ADMIN_EMAIL       — pre-existing super_admin email (optional;
#                                  enables the authenticated walkthrough)
#   TEST_SUPER_ADMIN_PASSWORD    — that account's password
#   SKIP_SEED=1                  — skip `npm run demo:seed` if you've already
#                                  seeded
#
# Exits 0 on green, non-zero on first failing test.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  # shellcheck disable=SC2046
  set -a
  # shellcheck source=/dev/null
  source <(grep -v '^#' .env.local | sed -E 's/^([A-Z_]+)=(.*)$/export \1=\2/')
  set +a
fi

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[v2-acceptance] missing env: $name" >&2
    exit 2
  fi
}
require PLAYWRIGHT_BASE_URL
require SUPABASE_URL
require SUPABASE_SERVICE_ROLE_KEY

echo "[v2-acceptance] target: $PLAYWRIGHT_BASE_URL"

# Optional: seed the demo org so populated surfaces have something to show.
if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  echo "[v2-acceptance] seeding demo data (npm run demo:seed)…"
  npm run demo:seed
fi

# Run the Playwright spec. forwards env to the spawned worker.
echo "[v2-acceptance] running Playwright (v2-acceptance.spec.ts)…"
npx playwright test tests/e2e/v2-acceptance.spec.ts \
  --reporter=list \
  --project=chromium \
  --output="$ROOT/.playwright/v2-acceptance"

echo "[v2-acceptance] OK"
