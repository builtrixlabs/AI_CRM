# Runbook: Phase 3 A/B Comparison (V3 `/build` vs V4 `feature-builder`)

**Purpose:** Validate per PRD §8.2 step 3.5 that the V4 `feature-builder` subagent matches or beats V3 `/build` on token usage and time-to-preview, before swapping over (steps 3.6 + 3.7).

## Prerequisites

- V4 hooks active (Phase 1 done)
- V4 skills present (Phase 2 done)
- V4 subagents present (Phase 3 done)
- `agent-shield` and `learning-engine` MCPs still enabled in `.mcp.json` (V3 path still operable)
- `npm install` clean
- Vercel + Supabase connected to a sandbox project (NOT production)

## Scope

Run **3 small features** through each path. Choose features the operator would build anyway — don't fabricate. Suggested sample types:

1. A read-only list page (e.g. "show all budgets for the user")
2. A form + mutation (e.g. "add a transaction with amount, category, date")
3. A small refactor (e.g. "extract the totals computation into a shared lib")

## Procedure

For each of the 3 features, run BOTH paths in fresh sessions:

### Path A — V3 `/build`

1. Fresh Claude Code session.
2. `/build <feature description>`
3. Wait for the pipeline to finish (or fail).
4. Capture metrics into `memory/reports/ab-phase-3.jsonl`:
   - `path`: `"v3"`
   - `feature`: short description
   - `directive_id`: from the resulting directive file
   - `start_ts`, `end_ts`, `duration_ms`
   - `tokens_in`, `tokens_out` (from session usage panel or transcript)
   - `gate_reached`: 1–5
   - `outcome`: `"success" | "partial" | "failed"`
   - `preview_url`
   - `tests_passed`

### Path B — V4 `feature-builder`

1. Fresh Claude Code session.
2. Manually invoke the feature-builder subagent: `Use the feature-builder subagent to build feature: <description>`
3. The subagent runs the same pipeline in isolated context.
4. Read its return JSON into the same `memory/reports/ab-phase-3.jsonl` with `"path": "v4"`.

> Note: until step 3.6 lands, the `/build` slash command still goes through the V3 path. The subagent path is invoked explicitly.

## Acceptance criteria (PRD §8.2 step 3.5)

For V4 to advance to step 3.6, across the 3 features:

| Metric | Threshold |
|---|---|
| V4 avg tokens | ≤ V3 avg tokens (target ≤60% per PRD §3.1) |
| V4 avg duration | ≤ V3 avg duration |
| V4 success rate | ≥ V3 success rate |
| Subagent return contract compliance | 100% (every V4 run returns valid JSON per `feature-builder.md`'s schema) |

If V4 falls short on any metric, do not proceed to step 3.6. Open an issue describing the gap; iterate on `feature-builder.md`; rerun a single feature comparison.

## Step 3.6 — Replace `/build` with subagent invocation

Once acceptance is met, edit `.claude/commands/build.md`:

```markdown
# /build — Vibe OS V4 feature pipeline

Delegates to the `feature-builder` subagent.

## Usage
/build [feature description]

## Behavior

Spawn the `feature-builder` subagent with the feature description.
Subagent runs Gate 1 → Gate 5 in isolated context and returns the structured summary.
Surface the summary back to the operator.
```

(The actual delegation is the operator/main session calling Task with `subagent_type: feature-builder`.)

Validate one more feature build through `/build` to confirm the swap works.

## Step 3.7 — Disable redundant MCPs

In `.mcp.json`, **disable** (don't delete) the entries for:

- `agent-shield` (replaced by `security-scanner` subagent)
- `learning-engine` (replaced by `pattern-extractor` subagent)

Replace each entry with `"disabled": true` (Claude Code respects this) OR comment out the entry (move to `.mcp.json.disabled` for clean restore). Keep the V3 source under `scripts/mcp-servers/` for now; deletion is Phase 4 cleanup.

Run another feature build to confirm the V4 subagents fully cover the V3 MCPs' jobs.

## Rollback

If V4 subagents fail in production after step 3.6 / 3.7:
1. Revert `.claude/commands/build.md` (`git restore .claude/commands/build.md`).
2. Re-enable the MCPs in `.mcp.json`.
3. Restart Claude Code session.
4. Open a hook-false-positive style report describing what broke.
