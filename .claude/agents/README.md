# Vibe OS V5 — Subagents

Delegated context windows for the V5 pipeline. Each subagent has its own tools allowlist, an explicit return contract, and a timeout. Implements V5 spec §3 (L0/L1).

## Roster

| Agent | When to use |
|---|---|
| `feature-builder` | Operator says "Build feature: X" / "Fix: X" / "Audit: X" — orchestrates Gates 1–5 via `scripts/v5/build.sh`. |
| `security-scanner` | Gate 4 security scan; CRITICAL halt + auto-fix loop, HIGH/MED/LOW logged + parallel-fixed. |
| `pattern-extractor` | Post-Gate 5: extract reusable patterns into `memory/learned/<product-slug>/`. |

## Invariants

- Every agent declares `tools` — anything not listed is unavailable to it.
- Every agent declares `return_contract` (JSON Schema-ish) — output must match.
- Every agent declares `timeout_minutes`.
- No agent has `Task` in its tools — agents do not nest.
- CI validates all of the above (`tests/agents/contracts.test.mjs`).

## V4 → V5 changes

Removed in V5: `spec-planner`, `test-runner`, `code-reviewer`, `directive-writer`. Plan generation moves to bash + Plan Mode; tests run via bash; solo dev makes code review out-of-scope; directive generation lives in the `directive-from-prompt` skill.

## How agents talk to the rest of the system

```
main session ── Task ──▶ agent
agent ── stdout (final message) ──▶ main session
agent ── tool calls ──▶ Read/Write/Edit/Bash/Grep/Glob/MCP
agent finish ── SubagentStop hook ──▶ memory/logs/subagents/<date>.jsonl
```

Agents do not invoke other agents. They reference skills (bundles of guidance) and bash scripts in `scripts/v5/`.
