# BASELINE 011 — Hook Contract

**Version:** 1.0
**Effective Date:** 2026-05-04
**Authority:** PRD §5.3 (FR-3.1 through FR-3.8), §6.3 (NFR-S6), §6.5 (NFR-PT1)
**Status:** V4 introduced

---

## Purpose

Defines the contract between Claude Code's hook subsystem and Vibe OS hooks. Every hook installed under `.claude/hooks/` MUST conform to this contract. Tests live in `tests/hooks/`.

## Hook events covered

| Event | Trigger | Block-capable | Output channel |
|---|---|---|---|
| `PreToolUse` | Before any tool call | Yes (exit 2) | stderr → Claude |
| `PostToolUse` | After any tool call | No (post-event) | stderr → Claude (informational only) |
| `SessionStart` | Session boot | No | stdout → injected as additionalContext |
| `Stop` | Session end | No | stderr → Claude |
| `SubagentStop` | Subagent return | No | stderr → Claude |

## I/O contract

**Input** — JSON via stdin:
```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "PreToolUse|PostToolUse|SessionStart|Stop|SubagentStop",
  "tool_name": "string (PreToolUse/PostToolUse only)",
  "tool_input": "object (PreToolUse/PostToolUse only)",
  "tool_response": "object (PostToolUse only)"
}
```

**Output:**
- Exit `0` — allow / acknowledge
- Exit `2` — block (only PreToolUse honors as block; other events surface stderr but proceed)
- Other exit codes — treated as hook error → fail-open (action proceeds), error logged

**stdout / stderr:**
- `SessionStart`: stdout becomes additionalContext injected to the session.
- All others: stderr is shown to Claude as a system message; stdout is ignored.

## Mandatory invariants

| ID | Rule |
|---|---|
| HC-1 | Every hook MUST log every decision to `.claude/hooks/log/<HookName>.log` (allow + block). |
| HC-2 | Every hook MUST exit within `timeout` seconds declared in `.claude/settings.json` (default ≤2s, recommended max 5s). |
| HC-3 | A hook's internal error MUST NOT block legitimate work (NFR-R6 fail-open). The hook logs the error and exits 0. |
| HC-4 | `PreToolUse` blocks SHALL NOT modify tool input. They either allow (exit 0) or block (exit 2). |
| HC-5 | `PostToolUse` MUST append to `memory/logs/execution/<date>.jsonl`. The append MUST be atomic (single `appendFile` call). |
| HC-6 | `SessionStart` stdout MUST be ≤500 tokens (≈2000 chars). Hooks SHALL self-truncate. |
| HC-7 | All audit log writes are append-only (NFR-S6). The PreToolUse hook itself enforces this for `memory/logs/**`. |
| HC-8 | A hook script MUST NOT depend on a non-portable runtime (e.g. `jq`). It MAY depend on Node ≥18 (already required). |

## Configuration

`.claude/settings.json`:
```json
{
  "hooks": {
    "<EventName>": [
      { "matcher": "<tool regex>", "hooks": [{ "type": "command", "command": "<shell>", "timeout": 5 }] }
    ]
  }
}
```

`matcher` is omitted for events without a tool (SessionStart, Stop, SubagentStop). For PreToolUse and PostToolUse, the regex matches against `tool_name`.

## Override (NFR-R6 / UC8)

When a hook false-positives:
1. Operator temporarily renames the offending hook file (e.g. `PreToolUse.mjs` → `PreToolUse.mjs.disabled`).
2. The operator's reason is logged (manually) to `.claude/hooks/log/overrides.log`.
3. The hook is fixed and re-enabled. The override entry stays in the log for audit.

## Testing

Every hook MUST have at least one test in `tests/hooks/`:
- An "allow path" — benign input → exit 0 → no spurious block log
- A "block path" (PreToolUse only) — forbidden input → exit 2 → audit log entry written

Run: `node --test tests/hooks/*.test.mjs`

## Authority

- POLICY 001 (Structural Integrity)
- POLICY 005 (MCP Interaction Authority) — hooks are NOT MCPs but enforce the same boundaries
- POLICY 013 (Pre-Commit Hooks) — git-level secret scan complements the runtime PreToolUse scan
