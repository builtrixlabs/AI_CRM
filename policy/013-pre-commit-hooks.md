# POLICY 013 — Pre-Commit Secret Detection

**Status**: Active
**Authority Level**: Immutable
**Effective Date**: 2026-03-05
**Introduced In**: V3.0

---

## Purpose

This policy enforces automatic secret detection before any git commit in Gate 5. A pre-commit hook scans staged files for exposed credentials and blocks the commit if secrets are found.

---

## Integration Point

Pre-commit scanning runs as the FIRST step of Gate 5, BEFORE any git operations:

```
Gate 5 Flow:
  SECRET SCAN → git checkout -b → git add → git commit → git push → Vercel deploy
```

This does NOT modify POLICY 002. It prepends a validation step to Gate 5 through CLAUDE.md instructions and a husky pre-commit hook.

---

## What Is Scanned

All staged files are scanned for:

### Provider-Specific Patterns
1. **AWS** — Access key IDs (`AKIA...`), secret keys
2. **Stripe** — Live secret keys (`sk_live_...`), live publishable keys
3. **OpenAI** — API keys (`sk-...`)
4. **Supabase** — Service role keys, anon keys in source (should be in .env)
5. **GitHub** — Personal access tokens (`ghp_...`, `gho_...`)
6. **Google** — API keys, OAuth secrets

### Generic Patterns
7. **Passwords** — `password = "..."`, `pwd = "..."`
8. **API Keys** — `api_key = "..."`, `apiKey = "..."`
9. **Private Keys** — RSA, DSA, EC, OPENSSH private key headers
10. **JWT Tokens** — `eyJ...` patterns
11. **Connection Strings** — Database URLs with embedded credentials

---

## On Detection

1. **BLOCK** the commit immediately
2. **REPORT** each finding: file path, line number, pattern matched, severity
3. **SUGGEST** remediation: move value to `.env.local`, use `process.env.VARIABLE_NAME`
4. **GENERATE** `.env.example` with placeholder values if it doesn't exist

---

## Exclusions

The scanner ignores:
- Files in `.gitignore` (already excluded from commits)
- `.env.example` files (placeholder values expected)
- Test files containing "mock", "fixture", "example" in the matched line
- Lock files (`package-lock.json`, `pnpm-lock.yaml`)
- Binary files (images, fonts)

---

## Auto-Remediation

When secrets are detected during the autonomous pipeline:
1. AI moves the secret value to `.env.local`
2. AI replaces the hardcoded value with `process.env.VARIABLE_NAME`
3. AI updates `.env.example` with a placeholder
4. AI re-stages the fixed files
5. Commit proceeds

---

## Husky Hook

The pre-commit hook at `/.husky/pre-commit` runs `scripts/secret-scanner.ts`:
- Exit code 0 → clean, commit proceeds
- Exit code 1 → secrets found, commit blocked

---

## Enforcement

This policy is enforced by:
- Husky pre-commit hook (automatic on every commit)
- CLAUDE.md v3.0 instructions (Gate 5 pre-validation)
- Agent-Shield MCP (deeper scanning in Gate 4)

---

**END OF POLICY 013**
