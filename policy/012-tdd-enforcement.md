# POLICY 012 — TDD-First Enforcement

**Status**: Active
**Authority Level**: Immutable
**Effective Date**: 2026-03-05
**Introduced In**: V3.0

---

## Purpose

This policy enforces Test-Driven Development (TDD) during Gate 3 Execution. Tests are written BEFORE implementation code, ensuring every feature is built against defined expectations.

---

## TDD Cycle

For each task in the speckit task breakdown:

```
RED:      Write test → Run test → Test FAILS (expected behavior defined)
GREEN:    Write implementation → Run test → Test PASSES (minimum code)
REFACTOR: Clean up code → Run test → Test still PASSES (improved quality)
```

---

## Gate 3 Sequence (Enhanced)

```
Previous (V2.1):
  Install components → Create migrations → Write code → Write tests

New (V3.0):
  Install components → Create migrations → Write TESTS → Write CODE → Verify TESTS PASS → Refactor
```

This does NOT modify POLICY 002. It specifies the execution ORDER within Gate 3 through CLAUDE.md instructions.

---

## Test File Requirements

| Type | Naming | Location | Purpose |
|------|--------|----------|---------|
| Unit | `[feature].test.ts` | `/tests/unit/` | Component/function logic |
| Integration | `[feature].integration.test.ts` | `/tests/integration/` | Service interactions |
| E2E | `[feature].e2e.ts` | `/tests/e2e/` | Full user workflows |

---

## Coverage Target

- **New code**: 80% line coverage target (reported in logs, not blocking in V3.0)
- **Critical paths**: Auth, payments, data mutations — 100% coverage expected
- Coverage report logged to `/memory/logs/execution/[date]_coverage.md`

---

## Per-Task TDD

Each task from `speckit.tasks` gets its own TDD cycle:

```
Task 1: "Create user dashboard page"
  → RED:   Write test for dashboard rendering
  → GREEN: Implement dashboard component
  → REFACTOR: Clean up, extract shared components

Task 2: "Add transaction history table"
  → RED:   Write test for table data loading
  → GREEN: Implement table with data fetching
  → REFACTOR: Optimize queries, memoize renders
```

---

## Test-First Verification

Before writing implementation code, AI MUST:
1. Create the test file
2. Run the test (expect FAIL with clear error indicating missing implementation)
3. Only then write the implementation

If tests are written AFTER code, this is a policy violation logged to memory.

---

## Exceptions

- **Configuration files** (next.config.ts, tailwind.config.ts) — No TDD required
- **Type definitions** (*.d.ts) — No TDD required
- **Static content** (markdown, images) — No TDD required
- **Migration files** (SQL) — Validated by Supabase, not unit tests

---

## Enforcement

This policy is enforced by:
- CLAUDE.md v3.0 instructions (Gate 3 execution order)
- Vitest (unit test runner)
- Playwright (E2E test runner)
- Intent Logger (logs TDD cycle compliance)

---

**END OF POLICY 012**
