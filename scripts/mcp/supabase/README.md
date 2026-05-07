# scripts/mcp/supabase

Stdio MCP server for the Supabase Management API — narrow, scoped, async-only.

## What this does (and doesn't)

Per spec §6.1, V5 keeps Supabase ops in bash wherever possible (`scripts/v5/supabase.sh` for migrate-new / migrate-up local / type gen / RLS local-test). This MCP only handles operations that genuinely need async API + auth:

| Tool | Purpose |
|---|---|
| `list_branches` | Enumerate Supabase preview branches on the linked project |
| `apply_migration_to_branch` | Apply a `.sql` migration file to a preview branch (or main) — idempotent via sha256-derived migration name |
| `wait_for_branch_ready` | Poll until a preview branch reaches READY/FAILED/timeout |

What's **not** here:
- Migration authoring → use the `migration-supabase-safe` skill
- Local DB reset / push → `bash scripts/v5/supabase.sh migrate-up`
- TypeScript type gen → `bash scripts/v5/supabase.sh types`
- RLS testing locally → `bash scripts/v5/supabase.sh rls-test`

## Why this is risk-flagged

Spec §10 calls out: *"Supabase branch-deploys + RLS policy testing hard to automate end-to-end. Phase C dedicates 2 days to Supabase preview env. If unsolved, fall back to local-only RLS testing + flag in directive."*

Mitigations baked into this MCP:
- Tools degrade to `{error: "..."}` on missing auth, missing project ref, or missing migration file — never crashes
- `apply_migration_to_branch` is idempotent: the migration name is a `sha256` of the SQL body. Re-applying the same SQL returns `state: "skipped"` rather than failing or duplicating
- `wait_for_branch_ready` defaults to 180s timeout (Supabase preview branches commonly take 60-120s to provision)
- All API errors include the HTTP status + first 300 chars of the response body so failures are debuggable from the MCP transcript

## Auth

Reads `SUPABASE_ACCESS_TOKEN` from env. Generate at https://supabase.com/dashboard/account/tokens.

Project ref resolves in this order:
1. `SUPABASE_PROJECT_REF` env var
2. `project_id = "..."` line in `supabase/config.toml`

## Setup

```bash
# Personal access token (full scope)
export SUPABASE_ACCESS_TOKEN=sbp_...

# Project ref — either env var or supabase/config.toml
export SUPABASE_PROJECT_REF=zyxabc123

# Or, after `supabase link --project-ref zyxabc123`,
# the config.toml gets the project_id automatically.
```

## Run locally

```
node scripts/mcp/supabase/server.mjs
```

JSON-RPC over stdio. The smoke test under `tests/mcp/supabase.test.mjs` boots without auth and confirms the auth-error path returns a structured error rather than crashing.

## Wired into

`.mcp.json` `vibe-supabase` entry. Loaded automatically when Claude Code starts in this repo. Note: the existing `supabase` HTTP relay (`https://mcp.supabase.com/mcp`) is also wired and provides broader Supabase coverage; this V5 MCP focuses specifically on V5's preview-branch workflow.
