# Vibe OS V4 — Hooks

Deterministic guardrails for Claude Code. Implements PRD §5.3 (FR-3.1 through FR-3.8) and §6.3 (NFR-S1, NFR-S2, NFR-S6).

## Files

| File | Purpose | PRD ref |
|---|---|---|
| `PreToolUse.mjs` | Block writes to `policy/`, `baseline/`, `.git/`, `.env*`. Block dangerous bash (`rm -rf`, off-feature force-push). Block bash containing secrets. | FR-3.1, FR-3.2, NFR-S1, NFR-S2, NFR-S6 |
| `PostToolUse.mjs` | Append every tool call to `memory/logs/execution/<date>.jsonl`. | FR-3.3 |
| `SessionStart.mjs` | Inject ≤500-token summary of `memory/learned/patterns.md` + recent directives into the session. | FR-3.4, NFR-P2 |
| `Stop.mjs` | Queue pattern extraction if Gate 5 reached today (extractor lands in Phase 3). | FR-3.5 |
| `SubagentStop.mjs` | Log subagent return payloads to `memory/logs/subagents/`. | FR-3.6 |
| `lib/util.mjs` | Shared: stdin JSON, jsonl append, path matching, block/allow helpers. | — |
| `lib/locked-paths.json` | Config: immutable globs, append-only globs, dangerous bash substrings. | FR-3.1 |
| `lib/secret-patterns.txt` | Regex (one per line) for secret detection in bash commands. Mirrors `scripts/secret-scanner.ts`. | NFR-S2 |

## Deviations from PRD

- **Language: Node `.mjs` instead of POSIX bash + `jq`.** Reason: `jq` is not installed on the operator's Windows box (Git Bash); Node ≥18 is. Same portability outcome (NFR-PT1), one less system dep. Settings.json invokes via `node .claude/hooks/X.mjs`, which is shell-portable.
- **Tests: Node's built-in `node:test` runner instead of `bats`.** Reason: zero new deps; bats not installed. Same coverage; see `tests/hooks/`.

## Contract

All hooks read JSON from stdin (Claude Code hook contract):

```json
{ "session_id": "...", "tool_name": "Write", "tool_input": {...}, "hook_event_name": "PreToolUse", ... }
```

- **Exit 0** — allow.
- **Exit 2** — block; stderr is shown to Claude.
- **Fail-open on internal errors (NFR-R6)** — a buggy hook MUST NOT block legit work. Errors logged to `.claude/hooks/log/<hook>.log`.

## Logs

- Audit (every tool call): `memory/logs/execution/YYYY-MM-DD.jsonl`
- Subagent returns: `memory/logs/subagents/YYYY-MM-DD.jsonl`
- Hook runtime (allow/block decisions): `.claude/hooks/log/<HookName>.log`

## Override (NFR-R6, UC8)

If a hook false-positives, the operator can bypass by temporarily renaming the offending hook file. Every block is logged, so the override decision is auditable.

## Tests

```
node --test tests/hooks/
```

See `tests/hooks/README.md` for fixtures and how to add cases.
