#!/usr/bin/env bash
# D-001 / D1 — Bootstrap the first super_admin user.
#
# Usage:
#   scripts/bootstrap-super-admin.sh <email> [password]
#
# If <password> is omitted, the user is created with a magic-link flow only
# (passwordless). If <password> is supplied, the user can sign in via
# email + password as well.
#
# Idempotent:
#   - If <email> already exists in profiles with base_role='super_admin' →
#     update password (when supplied), write a 'bootstrap_super_admin_replay'
#     audit row, exit 0.
#   - If <email> exists with a different role → fail loudly. Don't auto-promote.
#   - Otherwise → create auth.users + profiles + (optionally send magic link)
#     + audit row.
#
# Required env:
#   SUPABASE_URL                — https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY   — service role key
#
# This script writes to audit_log, which (per Constitution IV) only service_role
# can INSERT into. It MUST be run from a trusted machine with the key in env.

set -euo pipefail

EMAIL="${1:-}"
PASSWORD="${2:-}"
if [[ -z "$EMAIL" ]]; then
  echo "Usage: $(basename "$0") <email> [password]" >&2
  exit 2
fi

: "${SUPABASE_URL:?SUPABASE_URL required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}"

REST="${SUPABASE_URL}/rest/v1"
AUTH="${SUPABASE_URL}/auth/v1"
H_KEY=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
H_JSON=(-H "Content-Type: application/json")

log() { printf '[bootstrap] %s\n' "$*" >&2; }

write_audit() {
  local actor_id="$1" action="$2" record_id="${3:-null}"
  local body
  if [[ "$record_id" == "null" ]]; then
    body=$(jq -n --arg id "$actor_id" --arg action "$action" '{
      actor_id: $id, actor_type:"system", actor_role:"system",
      table_name:"profiles", action:$action
    }')
  else
    body=$(jq -n --arg id "$actor_id" --arg rid "$record_id" --arg action "$action" '{
      actor_id: $id, actor_type:"system", actor_role:"system",
      table_name:"profiles", record_id:$rid, action:$action
    }')
  fi
  curl -fsS -X POST "${REST}/audit_log" "${H_KEY[@]}" "${H_JSON[@]}" -d "$body" > /dev/null
}

# 1. Idempotency check.
existing=$(curl -fsS "${REST}/profiles?email=eq.${EMAIL}&select=id,base_role" "${H_KEY[@]}")
count=$(echo "$existing" | jq 'length')

if [[ "$count" -gt 0 ]]; then
  role=$(echo "$existing" | jq -r '.[0].base_role')
  user_id=$(echo "$existing" | jq -r '.[0].id')
  if [[ "$role" != "super_admin" ]]; then
    log "FATAL: ${EMAIL} exists with base_role=${role}; cannot bootstrap as super_admin"
    exit 1
  fi
  log "${EMAIL} already provisioned as super_admin (id=${user_id})"
  if [[ -n "$PASSWORD" ]]; then
    log "updating password via auth admin"
    pw_body=$(jq -n --arg pw "$PASSWORD" '{password: $pw, email_confirm: true}')
    curl -fsS -X PUT "${AUTH}/admin/users/${user_id}" "${H_KEY[@]}" "${H_JSON[@]}" -d "$pw_body" > /dev/null
  fi
  write_audit "$user_id" "bootstrap_super_admin_replay" "$user_id"
  log "done (replay)"
  exit 0
fi

# 2. Create auth.users row.
log "creating auth user for ${EMAIL}"
if [[ -n "$PASSWORD" ]]; then
  auth_user=$(curl -fsS -X POST "${AUTH}/admin/users" "${H_KEY[@]}" "${H_JSON[@]}" \
    -d "$(jq -n --arg email "$EMAIL" --arg pw "$PASSWORD" '{email:$email, password:$pw, email_confirm:true}')")
else
  auth_user=$(curl -fsS -X POST "${AUTH}/admin/users" "${H_KEY[@]}" "${H_JSON[@]}" \
    -d "$(jq -n --arg email "$EMAIL" '{email:$email, email_confirm:true}')")
fi
user_id=$(echo "$auth_user" | jq -r '.id')

if [[ -z "$user_id" || "$user_id" == "null" ]]; then
  log "FATAL: auth admin returned no user id; response=${auth_user}"
  exit 1
fi

# 3. Insert profile.
log "inserting profile id=${user_id}"
profile_body=$(jq -n --arg id "$user_id" --arg email "$EMAIL" '{
  id: $id,
  organization_id: null,
  email: $email,
  display_name: $email,
  base_role: "super_admin",
  created_by: $id,
  created_via: "system",
  updated_by: $id,
  updated_via: "system"
}')
curl -fsS -X POST "${REST}/profiles" "${H_KEY[@]}" "${H_JSON[@]}" -H "Prefer: return=minimal" -d "$profile_body" > /dev/null

# 4. Send magic-link only if no password (so passwordless users can still sign in).
if [[ -z "$PASSWORD" ]]; then
  log "sending magic link to ${EMAIL}"
  curl -fsS -X POST "${AUTH}/admin/generate_link" "${H_KEY[@]}" "${H_JSON[@]}" \
    -d "$(jq -n --arg email "$EMAIL" '{type:"magiclink", email:$email}')" > /dev/null
fi

# 5. Audit row.
write_audit "$user_id" "bootstrap_super_admin" "$user_id"

if [[ -n "$PASSWORD" ]]; then
  log "OK super_admin bootstrapped for ${EMAIL} with password (no magic link sent)"
else
  log "OK super_admin bootstrapped for ${EMAIL}; magic link sent"
fi
