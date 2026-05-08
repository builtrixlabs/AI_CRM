#!/usr/bin/env bash
# D-009 / A1 — Seed the global agent_service_accounts rows.
# Idempotent (INSERT ... ON CONFLICT DO NOTHING).
#
# Run manually after migrations apply:
#   bash scripts/seed-agent-service-accounts.sh
#
# Requires: DATABASE_URL or SUPABASE_DB_URL in env.

set -euo pipefail

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: DATABASE_URL or SUPABASE_DB_URL must be set" >&2
  exit 1
fi

psql "$DB_URL" <<'SQL'
INSERT INTO agent_service_accounts
  (agent_type, display_name, max_tier, prompt_version)
VALUES
  ('lead_enrichment', 'Lead Enrichment Agent', 'T1', 'v1')
ON CONFLICT (agent_type) DO NOTHING;

SELECT id, agent_type, max_tier, prompt_version
  FROM agent_service_accounts
  ORDER BY agent_type;
SQL

echo "[seed-agent-service-accounts] done."
