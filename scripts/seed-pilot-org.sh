#!/usr/bin/env bash
# D-015 — Seed a demo pilot organization for V0 acceptance testing.
#
# Idempotent. Creates:
#   - one organization (slug taken as $1)
#   - one workspace inside it
#   - one team inside the workspace
#   - one org_owner profile (email taken as $2)
#   - one sales_rep profile (email taken as $3)
#   - the user_app_roles bridge rows
#
# Use this BEFORE the real pilot to validate the runbook end-to-end
# against a throwaway org. Real pilot orgs go through the
# `/platform/organizations/new` UI.
#
# Run:
#   bash scripts/seed-pilot-org.sh demo-pilot owner@example.com rep@example.com
#
# Requires: DATABASE_URL or SUPABASE_DB_URL.

set -euo pipefail

ORG_SLUG="${1:-demo-pilot}"
OWNER_EMAIL="${2:-owner@example.com}"
REP_EMAIL="${3:-rep@example.com}"

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: DATABASE_URL or SUPABASE_DB_URL must be set" >&2
  exit 1
fi

echo "[seed-pilot-org] org=$ORG_SLUG owner=$OWNER_EMAIL rep=$REP_EMAIL"

psql "$DB_URL" <<SQL
DO \$\$
DECLARE
  sys_uuid uuid := '00000000-0000-0000-0000-000000000000';
  v_org_id uuid;
  v_ws_id  uuid;
  v_team_id uuid;
  v_owner_id uuid;
  v_rep_id   uuid;
BEGIN
  -- ── Org ───────────────────────────────────────────────────────────
  INSERT INTO organizations (slug, name, plan_tier, primary_contact_email,
                             created_by, created_via, updated_by, updated_via)
  VALUES ('$ORG_SLUG', 'Demo Pilot ($ORG_SLUG)', 'professional',
          '$OWNER_EMAIL', sys_uuid, 'system', sys_uuid, 'system')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organizations WHERE slug = '$ORG_SLUG';

  -- ── Workspace ─────────────────────────────────────────────────────
  INSERT INTO workspaces (organization_id, slug, name,
                          created_by, created_via, updated_by, updated_via)
  VALUES (v_org_id, '$ORG_SLUG-default', 'Default workspace',
          sys_uuid, 'system', sys_uuid, 'system')
  ON CONFLICT (organization_id, slug) DO NOTHING;

  SELECT id INTO v_ws_id FROM workspaces
    WHERE organization_id = v_org_id AND slug = '$ORG_SLUG-default';

  -- ── Team ──────────────────────────────────────────────────────────
  INSERT INTO teams (organization_id, workspace_id, slug, name,
                     created_by, created_via, updated_by, updated_via)
  VALUES (v_org_id, v_ws_id, 'inside-sales', 'Inside Sales',
          sys_uuid, 'system', sys_uuid, 'system')
  ON CONFLICT (workspace_id, slug) DO NOTHING;

  SELECT id INTO v_team_id FROM teams
    WHERE workspace_id = v_ws_id AND slug = 'inside-sales';

  -- ── Profiles (require corresponding auth.users to exist; if not, skip) ──
  -- This script does NOT create auth.users rows. Operator must
  -- magic-link those separately, then re-run to create profiles.
  SELECT id INTO v_owner_id FROM auth.users WHERE email = '$OWNER_EMAIL';
  SELECT id INTO v_rep_id   FROM auth.users WHERE email = '$REP_EMAIL';

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'auth.users for owner $OWNER_EMAIL not found — skipping profile';
  ELSE
    INSERT INTO profiles (id, email, organization_id, base_role,
                          created_by, created_via, updated_by, updated_via)
    VALUES (v_owner_id, '$OWNER_EMAIL', v_org_id, 'org_owner',
            sys_uuid, 'system', sys_uuid, 'system')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO user_app_roles (user_id, organization_id, workspace_id, app_role,
                                granted_by, reason,
                                created_by, created_via, updated_by, updated_via)
    VALUES (v_owner_id, v_org_id, v_ws_id, 'org_owner',
            sys_uuid, 'pilot seed',
            sys_uuid, 'system', sys_uuid, 'system')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_rep_id IS NULL THEN
    RAISE NOTICE 'auth.users for rep $REP_EMAIL not found — skipping profile';
  ELSE
    INSERT INTO profiles (id, email, organization_id, base_role,
                          created_by, created_via, updated_by, updated_via)
    VALUES (v_rep_id, '$REP_EMAIL', v_org_id, 'sales_rep',
            sys_uuid, 'system', sys_uuid, 'system')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO user_app_roles (user_id, organization_id, workspace_id, app_role,
                                granted_by, reason,
                                created_by, created_via, updated_by, updated_via)
    VALUES (v_rep_id, v_org_id, v_ws_id, 'sales_rep',
            sys_uuid, 'pilot seed',
            sys_uuid, 'system', sys_uuid, 'system')
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'org_id=%, ws_id=%, team_id=%', v_org_id, v_ws_id, v_team_id;
END \$\$;

SELECT slug, name, plan_tier FROM organizations WHERE slug = '$ORG_SLUG';
SQL

echo "[seed-pilot-org] done."
echo
echo "Next steps:"
echo "  1. Sign in $OWNER_EMAIL via Supabase magic link (or invite from /platform)."
echo "  2. Sign in $REP_EMAIL the same way."
echo "  3. Re-run this script to populate profiles (it's idempotent)."
echo "  4. Run docs/runbooks/pilot-smoke-test.md."
