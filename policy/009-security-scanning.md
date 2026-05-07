# POLICY 009 — Security Scanning (AgentShield)

**Status**: Active
**Authority Level**: Immutable
**Effective Date**: 2026-03-05
**Introduced In**: V3.0

---

## Purpose

This policy defines mandatory security scanning before any code is deployed. The AgentShield MCP scans all code written during Gate 3 for vulnerabilities before Gate 5 deployment proceeds.

---

## Integration Point

Security scanning is a **sub-step of Gate 4 (Verification)**, executed AFTER build and tests pass, BEFORE Gate 5 begins.

```
Gate 4 Flow:
  npm run build → npm run test → npm run test:playwright → AGENT-SHIELD SCAN → Gate 4 complete
```

This does NOT modify POLICY 002. It extends Gate 4's verification scope through CLAUDE.md instructions.

---

## Scan Categories

1. **Hardcoded Secrets** — API keys, tokens, passwords in source code
2. **SQL Injection** — Unparameterized queries, string concatenation in SQL
3. **XSS Vectors** — Unescaped user input rendered in HTML/JSX
4. **Environment Leaks** — `.env` values referenced directly instead of `process.env`
5. **Dependency Vulnerabilities** — Known CVEs in installed packages
6. **Insecure Patterns** — eval(), innerHTML with user data, dangerouslySetInnerHTML without sanitization

---

## Severity Levels

| Level | Impact | Pipeline Action |
|-------|--------|----------------|
| **CRITICAL** | Exposed secrets, SQL injection | **GATE FAIL** — auto-fix and rescan once |
| **HIGH** | XSS, insecure auth patterns | **GATE FAIL** — auto-fix and rescan once |
| **MEDIUM** | Missing input validation, weak patterns | **WARNING** — logged, pipeline proceeds |
| **LOW** | Code style security suggestions | **WARNING** — logged, pipeline proceeds |

---

## Auto-Retry Protocol

On CRITICAL/HIGH finding:
1. AI analyzes the finding
2. AI applies fix (move secret to .env.local, parameterize query, sanitize input)
3. AI re-runs scan ONCE
4. If finding persists after fix → GATE FAIL → report to human

---

## Scan Scope

- **Full Scan**: All files in `/src`, `/tests`, `/execution` (on first build)
- **Incremental Scan**: Only files modified in current directive (subsequent builds)

---

## False Positive Handling

The scanner applies confidence thresholds to avoid blocking on false positives:
- Test files (`*.test.ts`, `*.e2e.ts`) — secret patterns in test fixtures are MEDIUM, not CRITICAL
- `.env.example` files — placeholder values are ignored
- Comments containing "example", "placeholder", "dummy" — downgraded to LOW

---

## Reporting

All findings logged to `/memory/logs/execution/[date]_security-scan.md` with:
- File path and line number
- Category and severity
- Description of vulnerability
- Suggested fix
- Whether auto-fixed or reported

---

## MCP Authority

- **agent-shield** MCP has **READ-ONLY** access to `/src`, `/tests`, `/execution`
- **agent-shield** NEVER modifies code directly — it reports findings
- AI reads findings and applies fixes through normal execution path
- Scan reports written to `/memory/logs/execution/` via intent-logger

---

## Enforcement

This policy is enforced by:
- CLAUDE.md v3.0 instructions (Gate 4 extended verification)
- Agent-Shield MCP (scan execution)
- Execution Gate MCP (blocks Gate 5 on CRITICAL/HIGH findings)

---

**END OF POLICY 009**
