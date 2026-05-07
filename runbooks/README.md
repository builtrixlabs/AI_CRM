# Runbooks

Explicit recovery procedures for predictable failures. PRD §10.2 / FR-6.5.

| File | Trigger |
|---|---|
| `gate-3-failure.md` | TDD stuck, shadcn install fails, migration fails |
| `gate-4-failure.md` | Build/test/playwright/security scan fails after retry |
| `hook-false-positive.md` | A PreToolUse hook blocks legitimate work |
| `phase-3-ab-comparison.md` | Validation procedure for V3 → V4 subagent swap (PRD §8.2 step 3.5) |
| `cutover-procedure.md` | Operator procedure for V3 → V4 cutover: tag, merge, version bump (PRD §8.2 phase 5) |

## Pending (later phases)

| File | When |
|---|---|
| `gate-1-failure.md` | Phase 4 (low frequency in practice) |
| `gate-2-failure.md` | Phase 4 (speckit failures) |
| `gate-5-failure.md` | Phase 4 (deploy / push / Vercel webhook issues) |
| `plugin-upgrade-rollback.md` | Phase 4 (after `bin/upgrade.ts` lands) |

## Conventions

Every runbook has:
- **Symptoms** — how the operator notices the problem
- **Diagnosis** — where to look (log paths)
- **Recovery** — concrete actions
- **Validation** — how to know it's fixed
- **When to escalate** — limits of automated recovery
