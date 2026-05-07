#!/usr/bin/env bash
# Gate 1 — generate a directive for an operator prose intent.
#
# Usage: scripts/v5/directive-gen.sh "<intent>"
# Output: prints the absolute path of the new directive on stdout.
#
# Reads memory/learned/<product>/patterns.md (if exists) for prior context.
# Writes directives/<ISO-timestamp>-<slug>.md.

set -euo pipefail
source "$(dirname "$0")/_lib.sh"

intent="${1:-}"
[[ -n "$intent" ]] || v5_die "usage: directive-gen.sh \"<intent>\""

slug=$(v5_slugify "$intent")
[[ -n "$slug" ]] || v5_die "could not derive slug from intent: $intent"

id=$(v5_directive_id "$slug")
file="${V5_REPO_ROOT}/directives/${id}.md"
mkdir -p "${V5_REPO_ROOT}/directives"

# Type detection
case "$intent" in
  "Build feature:"*|"build feature:"*) kind=feature ;;
  "Fix:"*|"fix:"*)                     kind=fix ;;
  "Audit:"*|"audit:"*)                 kind=audit ;;
  "Enhance:"*|"enhance:"*)             kind=enhance ;;
  *)                                   kind=feature ;;
esac

# Pattern-memory context (optional)
product_slug=$(jq -r '.name // "default"' "${V5_REPO_ROOT}/package.json" 2>/dev/null || echo default)
patterns_file="${V5_REPO_ROOT}/memory/learned/${product_slug}/patterns.md"
patterns_ref="(none)"
[[ -f "$patterns_file" ]] && patterns_ref="memory/learned/${product_slug}/patterns.md"

cat > "$file" <<EOF
# Directive ${id}

**Kind:** ${kind}
**Created:** $(date -u +%FT%TZ)
**Intent:** ${intent}
**Patterns referenced:** ${patterns_ref}

## Problem
<what is the operator trying to achieve, in their words>

## Success criteria
- <observable outcome 1>
- <observable outcome 2>

## Constraints
- Stack: Next.js + TypeScript + Supabase + Vercel + Vitest + Playwright + shadcn (D-05)
- Coverage targets: ≥80% lines, ≥90% branches (D-06)
- Security: CRITICAL = 0 after auto-fix (D-07)

## Out of scope
- <explicit non-goals>

## Notes for Plan Mode (Gate 2)
- Spec author should reflect on prior patterns from \`${patterns_ref}\` if relevant.
- Estimate: <S/M/L based on file count + migration count>
EOF

v5_log_event 1 directive-gen pass 0 "{\"id\":\"${id}\",\"kind\":\"${kind}\"}"
v5_log "directive written: directives/${id}.md"
printf '%s\n' "$file"
