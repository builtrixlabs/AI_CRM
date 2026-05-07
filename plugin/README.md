# Vibe OS V4 — Plugin

Distributable bundle of hooks, skills, subagents, runbooks, and the policy/baseline framework. Same-repo packaging: this repo IS the plugin.

## Commands

```bash
# Scaffold a fresh consumer repo
node plugin/bin/cli.mjs init <target>
# or, after `npm link`:
npx vibe-os init <target>

# Run pending migrations against the consumer at <target> (default: cwd)
npx vibe-os upgrade [target] [--rollback] [--dry-run]

# Report OS health
npx vibe-os health [target] [--json]
```

## init

Copies the canonical artifacts (`.claude/{hooks,skills,agents,commands,settings.json}`, `policy/`, `baseline/`, `runbooks/`, `scripts/secret-scanner.ts`, `.husky/pre-commit`, `.mcp.json`) into `<target>`. Creates empty `directives/`, `memory/{logs,learned}/`, `orchestration/`, `specs/`, `execution/`, `src/`, `tests/`. Writes `memory/project-init.md`.

Flags:
- `--force` — overwrite existing files in target
- `--reuse-existing` — skip files that already exist
- `--dry-run` — show what would happen
- `--verbose` — log each copy

Fails fast if any conflict and neither flag set.

## upgrade

Runs migrations from `plugin/migrations/`. Each migration exports `forward({target, log})` and `rollback({target, log})`. State tracked in `<target>/memory/logs/migrations.jsonl` so re-running is idempotent.

```bash
npx vibe-os upgrade --dry-run    # preview
npx vibe-os upgrade              # forward
npx vibe-os upgrade --rollback   # reverse
```

## health

Reports:
- Plugin version
- Open directives (count + 3 most recent)
- Last 5 gate events (from `memory/logs/gates.jsonl`)
- Hooks: file presence + last fired
- MCP servers: count + per-server status (enabled/disabled)
- Memory: today's audit entries + patterns file size

```bash
npx vibe-os health           # human-readable
npx vibe-os health --json    # for tools
```

## Authority

- BASELINE 010 (Plugin Contract)
- PRD §5.5 (FR-5.1 through FR-5.6)

## Distribution roadmap

V4.0 ships in-repo (this folder). Public package (`@builtrix/vibe-os`) on a private registry is a Phase 5 task per the PRD. When that lands, the local invocation `node plugin/bin/cli.mjs <cmd>` becomes `npx @builtrix/vibe-os <cmd>`.
