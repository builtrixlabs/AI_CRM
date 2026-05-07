# BASELINE 012 — Subagent Contract

**Version:** 1.0
**Effective Date:** 2026-05-04
**Authority:** PRD §5.4 (FR-4.1 through FR-4.6)
**Status:** V4 introduced

---

## Purpose

Defines the contract between the Vibe OS main session and any subagent under `.claude/agents/`. Every subagent MUST conform. CI validates via `tests/agents/contracts.test.mjs`.

## File format

Each subagent is a single Markdown file with YAML frontmatter:

```markdown
---
name: <subagent-name>            # MUST match filename minus .md
description: <≤200 chars>        # imperative trigger ("Use this when …")
tools:                           # allowlist; tools not listed are unavailable
  - Read
  - Write
  - Bash
return_contract:                 # JSON Schema-ish object describing the single return message
  type: object
  required: [<field>, …]
  properties:
    <field>:
      type: string|integer|number|boolean|array|object
      enum: [<vals>]             # optional
      nullable: true             # optional
      description: <text>        # optional
timeout_minutes: <int>           # hard cap; on overflow, return status:"partial"
---

<body — agent's instructions>
```

## Mandatory invariants

| ID | Rule |
|---|---|
| SC-1 | `name` field MUST match the filename (without `.md`). |
| SC-2 | `description` MUST be ≤200 chars and start with the imperative trigger pattern (`Use this when …`). |
| SC-3 | `tools` MUST be present and non-empty. Anything not listed is unavailable to the subagent. |
| SC-4 | `tools` MUST NOT include `Task` (FR-4.4 — subagents do not invoke other subagents). |
| SC-5 | `return_contract` MUST be present and contain `type`, `required`, `properties`. |
| SC-6 | `timeout_minutes` MUST be a positive integer ≤ 30. |
| SC-7 | The subagent MUST return EXACTLY ONE message matching `return_contract`. |
| SC-8 | The body MUST document at least: inputs, steps, constraints, return format. |
| SC-9 | The subagent MUST NOT modify `policy/` or `baseline/` (the PreToolUse hook blocks this anyway). |
| SC-10 | All MCPs the subagent uses MUST be listed in `tools` with the `mcp__<server>__*` syntax. |

## Allowed return statuses

Subagents conventionally use one of these in their `status` field:

- `success` — work completed as requested
- `partial` — some work completed, some pending (timeout, recoverable error)
- `failed` — work could not be completed
- `clean` / `warnings` / `blocking` — for review/scan-style agents

## Communication with the main session

- **Input:** the single prompt the main session passes via the `Task` tool. Self-contained — the subagent has no memory of the main session.
- **Output:** ONE final message — the assistant's last message before exit. SHOULD be valid JSON conforming to `return_contract`. The main session parses this.
- **Side effects:** any tool calls the agent makes are logged by the `PostToolUse` hook to `memory/logs/execution/<date>.jsonl`.
- **On exit:** the `SubagentStop` hook logs the return payload to `memory/logs/subagents/<date>.jsonl`.

## Lifecycle

```
main session ── Task(subagent_type, prompt) ──▶ subagent (cold context, isolated)
                                                  ↓
                                                  Read/Write/Edit/Bash/MCP (tool calls)
                                                  ↓
subagent ── final message ──▶ main session
SubagentStop hook ── log to memory/logs/subagents/<date>.jsonl
```

## Validation

CI runs `tests/agents/contracts.test.mjs` on every PR. Validation covers:

- File presence: all 7 required subagents exist (FR-4.1)
- Frontmatter parseable (SC-1, SC-2)
- `name` matches filename (SC-1)
- `description` ≤200 chars and starts with imperative (SC-2)
- `tools` present and non-empty (SC-3)
- `tools` does not include `Task` (SC-4 / FR-4.4)
- `return_contract` present with `type`, `required`, `properties` (SC-5)
- `timeout_minutes` is a positive integer (SC-6)

Live behavior (does the agent actually return matching JSON?) is validated by integration tests once the agent has run at least once in a real session — see `runbooks/phase-3-ab-comparison.md`.

## Authority

- POLICY 002 (Execution Gating)
- POLICY 005 (MCP Interaction Authority)
- POLICY 011 (Token Optimization) — subagents exist to keep main thread tight
