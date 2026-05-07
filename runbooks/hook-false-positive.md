# Runbook: Hook False Positive

## Symptoms
- A `PreToolUse` hook (V4) blocks an action you believe is legitimate
- Claude Code shows: `[Vibe OS V4 hook] BLOCKED: <reason>`
- The block is recorded in `.claude/hooks/log/PreToolUse.log` and `memory/logs/execution/<date>.jsonl` with `decision: "block"`

## Diagnosis

1. Read `.claude/hooks/log/PreToolUse.log` — find the most recent BLOCKED entry. It includes the reason and a `ctx` object with the tool name, file path, or command.
2. Decide: is the block correct (the action really violates a policy) or false-positive (the rule is too broad)?

## Recovery for false positive

### Option 1 — temporary disable (single session)

1. Rename the offending hook file: `mv .claude/hooks/PreToolUse.mjs .claude/hooks/PreToolUse.mjs.disabled`
2. Restart Claude Code session.
3. Perform the action.
4. **Immediately re-enable**: `mv .claude/hooks/PreToolUse.mjs.disabled .claude/hooks/PreToolUse.mjs`
5. Append a manual note to `.claude/hooks/log/overrides.log` with timestamp, reason, who.

### Option 2 — narrow the rule (permanent fix)

1. Edit `.claude/hooks/lib/locked-paths.json` to remove the over-broad pattern, OR
2. Edit `.claude/hooks/PreToolUse.mjs` to add an explicit allow-list exception, OR
3. Edit `.claude/hooks/lib/secret-patterns.txt` to refine a too-greedy regex.
4. Run `node --test tests/hooks/*.test.mjs` to confirm no test regressions.
5. Add a new test in `tests/hooks/pretooluse.test.mjs` covering the case that should now pass.
6. Commit the change.

## Recovery if the block was correct

The hook saved you. Don't disable. Instead:

1. If the action was genuinely needed (e.g. updating a baseline), follow the proper modification protocol per `baseline/locked-files.md`:
   - Create a directive authorizing the change
   - Document the rationale in `memory/`
   - Update `baseline/hashes.json` with the new hash AFTER the file change is committed
2. The PreToolUse hook stays active. Use Option 1 (temporary disable) only for the duration of the protocol-followed change.

## Audit trail

Every block logs:
- `.claude/hooks/log/PreToolUse.log` — line per decision
- `memory/logs/execution/<date>.jsonl` — structured JSON entry with `decision: "block"`

Every override:
- `.claude/hooks/log/overrides.log` — manual entry. Operator-maintained.

Reviewing weekly: count overrides. If a single rule is overridden >2x in a week, that's a signal to refine the rule (Option 2 above).

## Anti-patterns

- ❌ Permanently deleting a hook to bypass a single block
- ❌ Editing a hook to add a one-off `if (path == ...)` exception without a test
- ❌ Disabling and forgetting to re-enable
- ❌ Updating `baseline/hashes.json` to mask an unauthorized change
