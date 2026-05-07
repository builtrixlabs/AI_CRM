# Runbook: Gate 4 Failure (Verification + Security)

## Symptoms
- `npm run build` / `npm run test` / `npm run test:playwright` fails after auto-retry
- `security-scanner` subagent returns `status: "blocking"` after rescan
- Pipeline halts before reaching Gate 5

## Diagnosis

1. `memory/logs/gates.jsonl` → most recent `gate=4, outcome=failed`
2. `memory/logs/execution/<date>.jsonl` filtered to the directive_id
3. Identify which check failed: `build` | `test` | `playwright` | `security-scanner`
4. Read the corresponding `failed_tests[]` or `findings[]` from the subagent's return JSON

## Recovery (per check)

### Build failure (TypeScript errors)

- Run: `npm run build 2>&1 | tee build.err`
- Common causes:
  - missing import after a refactor
  - type mismatch in generated Supabase types — regenerate: `supabase gen types`
  - shadcn component prop signature changed
- Fix forward; re-run `npm run build` until clean.

### Unit test failure

- Run: `npm run test -- --reporter=verbose`
- If a single test: edit the test or the implementation it covers. Prefer fixing impl over loosening test.
- If many tests: likely a regression. `git diff HEAD~1` to find cause.

### Playwright failure

- Run: `npm run test:playwright -- --debug` (interactive)
- Check Vercel preview is reachable (BASE_URL env)
- Check selectors haven't drifted from latest shadcn version (use `getByRole` / `getByLabel`, not CSS selectors)
- Sometimes preview is slow to be ready — re-run after 30s

### Security scan failure

- Read `security-scanner` return JSON, focus on `findings[]` where `severity: "CRITICAL"` or `"HIGH"` and `auto_fixed: false`
- For `hardcoded-secret`: invoke `secret-fix-and-relocate` skill manually if subagent's auto-fix didn't catch it
- For `missing-rls`: invoke `supabase-rls-policy` skill, add deny-all + explicit allow rules
- For other categories (xss, sql-injection, auth-bypass): manual fix in source. No auto-resolve.
- Re-run: `feature-builder` subagent will auto-rescan and proceed if clean

## Validation

- Re-run `/build` with the same directive (or feature-builder subagent with same prompt)
- Confirm Gate 4 passes
- Confirm Gate 5 deploys

## When to escalate

If a security finding requires architectural change (e.g., switching from raw SQL to Supabase client):
1. Halt at Gate 4
2. Open a new directive describing the architectural change
3. Treat the original feature as blocked until the architectural directive ships
4. Do NOT lower severity to bypass the scanner
