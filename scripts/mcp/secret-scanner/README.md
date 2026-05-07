# scripts/mcp/secret-scanner

Stdio MCP server exposing the V5 secret scanner to Claude Code.

## Why this exists (vs the bash CLI)

`scripts/secret-scanner.ts` is the pre-commit guard — it scans **git-staged** files only and exits with status. That's the right shape for a hook, the wrong shape for a build pipeline that wants to scan freshly-written code before staging.

This MCP exposes the same regex matchers as MCP tools:
- `scan_paths` — walk files / directories (skips `node_modules`, `.git`, `dist`, `build`, `coverage`, `memory/logs`)
- `scan_text` — scan an in-memory string (no I/O), useful for checking a Claude-generated diff

Both return structured findings + severity summary.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `scan_paths` | `paths: string[]`, `severity_min?: CRITICAL\|HIGH\|MEDIUM\|LOW` | `{findings:[…], summary:{critical,high,medium,low}}` |
| `scan_text` | `content: string`, `file_hint?: string`, `severity_min?` | same |

`severity_min` filters out anything below that level. Default is `LOW` (return everything).

## Patterns

11 detectors covering AWS/Stripe/OpenAI/GitHub/Google/private keys/connection strings/password+API-key assignments. Pattern source is duplicated from `scripts/secret-scanner.ts` (kept in sync manually; both files cite POLICY 009-security-scanning).

## Run locally

```
node scripts/mcp/secret-scanner/server.mjs
```

It speaks JSON-RPC over stdio. The smoke test under `tests/mcp/secret-scanner.test.mjs` boots it and asserts both tools list correctly + that `scan_text` flags a planted Stripe key.

## Wired into

`.mcp.json` `secret-scanner` entry. Loaded automatically when Claude Code starts in this repo.
