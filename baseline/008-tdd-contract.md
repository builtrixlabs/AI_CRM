# BASELINE 008 — TDD Contract

**Version**: 1.0
**Effective Date**: 2026-03-05
**Authority**: POLICY 012 — TDD-First Enforcement
**Status**: Locked (immutable after creation)

---

## Purpose

Defines the Test-Driven Development cycle, test file conventions, and coverage reporting format for Gate 3 execution.

---

## TDD Cycle Definition

### RED Phase
1. Read the task requirements from speckit.tasks output
2. Create test file with descriptive test cases
3. Run tests — they MUST FAIL (no implementation exists yet)
4. Failing tests define the expected behavior

```typescript
// Example RED phase — test/unit/user-dashboard.test.ts
describe('UserDashboard', () => {
  it('renders transaction history table', () => {
    // This test WILL FAIL — component doesn't exist yet
    render(<UserDashboard />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('displays loading state while fetching', () => {
    render(<UserDashboard />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
```

### GREEN Phase
1. Write the MINIMUM code to make tests pass
2. No extra features, no premature optimization
3. Run tests — they MUST PASS

### REFACTOR Phase
1. Clean up implementation without changing behavior
2. Extract shared utilities, optimize imports
3. Run tests — they MUST STILL PASS
4. If tests fail during refactor → revert refactor changes

---

## Test File Conventions

| Type | Location | Naming | Runner |
|------|----------|--------|--------|
| Unit | `/tests/unit/` | `[feature].test.ts` | Vitest |
| Integration | `/tests/integration/` | `[feature].integration.test.ts` | Vitest |
| E2E | `/tests/e2e/` | `[feature].e2e.ts` | Playwright |

### Test Structure
```typescript
describe('[FeatureName]', () => {
  describe('[ComponentOrFunction]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

---

## Per-Task TDD Mapping

Each task from `speckit.tasks` maps to a TDD cycle:

```
Task: "Create user dashboard page"
├── RED:      tests/unit/user-dashboard.test.ts (FAIL)
├── GREEN:    src/app/dashboard/page.tsx (tests PASS)
└── REFACTOR: Extract shared components (tests still PASS)

Task: "Add transaction history API"
├── RED:      tests/unit/transactions-api.test.ts (FAIL)
├── GREEN:    src/app/api/transactions/route.ts (tests PASS)
└── REFACTOR: Extract query utilities (tests still PASS)
```

---

## Coverage Reporting

### Target
- **New code**: 80% line coverage
- **Critical paths** (auth, payments, data mutations): 100% coverage
- Coverage is REPORTED but not BLOCKING in V3.0

### Report Format
```markdown
## Coverage Report: [directive-name]
**Timestamp:** [ISO-8601]
**Files Tested:** [N]
**Lines Covered:** [N/Total] ([percentage]%)
**Branches Covered:** [N/Total] ([percentage]%)
**Functions Covered:** [N/Total] ([percentage]%)
**Uncovered Files:**
- [file-path]: [reason]
```

Written to `/memory/logs/execution/[date]_coverage.md`

---

## Exceptions (No TDD Required)

- Configuration files: `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`
- Type definitions: `*.d.ts`
- Static assets: images, fonts, markdown
- Migration files: `.sql` (validated by Supabase)
- Build scripts: `/scripts/**`
- Spec/plan/task files: `/orchestration/**`, `/specs/**`

---

## Violation Handling

If tests are written AFTER implementation (violation detected):
1. Log violation to `/memory/logs/execution/` with explanation
2. Continue pipeline (don't block)
3. Add note to coverage report: "TDD order violation — tests written post-implementation"

---

**END OF BASELINE 008**
