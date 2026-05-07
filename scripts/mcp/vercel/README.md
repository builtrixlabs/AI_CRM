# scripts/mcp/vercel

Stdio MCP server for the Vercel REST API. Per spec §6.2, this MCP only handles operations bash genuinely can't:
- Async preview-URL polling that needs more than a 60-second window
- Deploy state inspection by ID
- Authed redeploy at a specific SHA (Gate 6 auto-revert flow)

The simpler `vercel ls --json` polling lives in `scripts/v5/vercel.sh` and is sufficient for the happy-path Gate 5 case.

## Tools

| Tool | Args | Purpose |
|---|---|---|
| `wait_for_preview` | `branch`, `timeout_s?` (default 120), `poll_interval_s?` (default 5) | Poll for the latest deployment matching a git branch until READY/ERROR/CANCELED. Returns the preview URL on READY. |
| `get_deploy_status` | `deployment_id` | Look up a deployment by ID. Returns state, URL, aliases, timestamps. |
| `redeploy` | `git_sha`, `target?` (production/preview, default production), `name?` | Trigger a fresh deploy at a specific SHA. Used by Gate 6 after auto-revert. |

## Auth

Reads `VERCEL_TOKEN` from env. Project + team scoping resolves in this order:
1. `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` env vars
2. `.vercel/project.json` written by `vercel link`

If neither resolves, every tool call returns `{error: "..."}` with a clear message instead of crashing.

## Setup

```bash
# Get a token at https://vercel.com/account/tokens (scope: full account)
export VERCEL_TOKEN=...
# Link the project (creates .vercel/project.json)
vercel link
```

## Run locally

```
node scripts/mcp/vercel/server.mjs
```

JSON-RPC over stdio. The smoke test under `tests/mcp/vercel.test.mjs` boots it without a token and confirms the auth-error path returns a structured error rather than crashing.

## Wired into

`.mcp.json` `vercel` entry. Loaded automatically when Claude Code starts in this repo.
