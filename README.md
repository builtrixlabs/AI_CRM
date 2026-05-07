# <Your App Name>

Scaffolded with [Vibe Coding OS V5](https://github.com/RaghavaSreeram/VIBE_CODE_OS).

## What this is

A Claude-native, hook-enforced solo-dev OS built on Next.js + Supabase + shadcn/ui + Vercel. Bash-first orchestration; one human checkpoint per build (Plan Mode review at Gate 2). Your app code goes in `src/` and `tests/`.

## Getting started

```bash
npm install
npm run prepare       # husky pre-commit hook
npm run dev           # Next.js dev server

# CLI prereqs (one-time): see scripts/v5/PREREQS.md
bash scripts/v5/check-prereqs.sh
```

## Building features

In a Claude Code session, just say:

```
Build feature: <description>
```

The OS will:
1. Generate a directive (Gate 1)
2. Surface spec + plan + tasks in Plan Mode for your review (Gate 2 — your one checkpoint)
3. TDD-implement task by task (Gate 3)
4. Build, test, coverage, security-scan (Gate 4)
5. Deploy to a Vercel preview branch (Gate 5)
6. Watch `main` post-merge — auto-revert if regressed (Gate 6)

You'll get a preview URL. Merge to `main` when satisfied.

## Layout

| Path | Purpose |
|---|---|
| `.claude/hooks/` | Deterministic guardrails (block writes to policy/, .env, etc.) |
| `.claude/skills/` | On-demand knowledge bundles (RLS, shadcn install, Vitest, etc.) |
| `.claude/agents/` | Subagents: feature-builder, security-scanner, pattern-extractor |
| `scripts/v5/` | Bash orchestration entry points (build, verify, deploy, auto-revert) |
| `scripts/mcp/` | The 3 thin MCP servers (supabase, vercel, secret-scanner) |
| `policy/` | Governance rules (read-only, hook-enforced) |
| `baseline/` | Reference contracts (read-only, hook-enforced) |
| `directives/` | Feature intent records |
| `memory/` | Logs, learned patterns (per-product namespaced) |
| `runbooks/` | Recovery procedures |
| `src/` | Your app code |
| `tests/` | Your tests |

## Authority

See `CLAUDE.md` for the operating model and `VIBE_OS_V5_SPEC.md` for the canonical spec.
