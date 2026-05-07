---
name: vitest-from-spec
description: Use this skill when writing a Vitest unit test from a spec or task. Generates a RED test first that asserts the spec's stated behavior, before any implementation.
---

# Vitest From Spec

When invoked, follow these steps:

1. Read the spec / task description. Extract the input shape, expected output, and edge cases.
2. Choose a path: `src/<feature>/<name>.ts` ↔ `tests/<feature>/<name>.test.ts` (mirror layout).
3. Write the test from `templates/unit.test.ts`. Each `it(...)` block asserts ONE behavior.
4. Run: `npm run test -- <test file>` — confirm it FAILS (RED) for the right reason (function missing or assertion wrong, not import error).
5. Hand off to implementation. Re-run after impl: confirm GREEN.
6. REFACTOR pass: clean up; re-run; confirm still GREEN.

## What to test

- Happy path with realistic input
- Boundary values (0, empty, max, null where allowed)
- Failure modes (throws, returns error)
- Invariants the spec calls out

## What not to test

- Framework code (React's render, Next's router)
- Implementation details that the spec doesn't constrain
- Mocked third-party services beyond what the contract requires

## Authority

- POLICY 012 (TDD Enforcement)
- BASELINE 008 (TDD Contract)
