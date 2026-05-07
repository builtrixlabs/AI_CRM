#!/usr/bin/env bash
# Install a shadcn component during Gate 3 execution.
#
# Spec §4 Gate 3 side activities: shadcn components installed via
# `bash scripts/v5/install-shadcn.sh <comp>`.
#
# Usage: scripts/v5/install-shadcn.sh <component-name> [<component-name>...]

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

[[ $# -gt 0 ]] || v5_die "usage: install-shadcn.sh <component> [<component>...]"

cd "${V5_REPO_ROOT}"

for comp in "$@"; do
  v5_log "shadcn add $comp"
  v5_retry_once npx shadcn@latest add "$comp" --yes \
    || v5_die "shadcn add $comp failed twice"
  v5_log_event 3 shadcn-install pass 0 "{\"component\":\"${comp}\"}"
done
