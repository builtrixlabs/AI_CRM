# BASELINE 009 — Pre-Commit Secret Detection Contract

**Version**: 1.0
**Effective Date**: 2026-03-05
**Authority**: POLICY 013 — Pre-Commit Secret Detection
**Status**: Locked (immutable after creation)

---

## Purpose

Defines the secret detection patterns, scanner behavior, and remediation protocol for the pre-commit hook.

---

## Detection Patterns

### Provider-Specific

| Provider | Pattern | Example Match |
|----------|---------|--------------|
| **AWS Access Key** | `AKIA[0-9A-Z]{16}` | AKIAIOSFODNN7EXAMPLE |
| **AWS Secret Key** | `(?<![A-Za-z0-9/+=])[0-9a-zA-Z/+=]{40}(?![A-Za-z0-9/+=])` | wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY |
| **Stripe Live Secret** | `sk_live_[0-9a-zA-Z]{24,}` | sk_live_EXAMPLExxxxxxxxxxxxxxxx |
| **Stripe Live Pub** | `pk_live_[0-9a-zA-Z]{24,}` | pk_live_EXAMPLExxxxxxxxxxxxxxxx |
| **OpenAI** | `sk-[a-zA-Z0-9]{20,}` | sk-EXAMPLExxxxxxxxxxxxxxxx |
| **GitHub PAT** | `ghp_[a-zA-Z0-9]{36}` | ghp_EXAMPLExxxxxxxxxxxxxxxxxxxxxxxxxxxx |
| **GitHub OAuth** | `gho_[a-zA-Z0-9]{36}` | gho_EXAMPLExxxxxxxxxxxxxxxxxxxxxxxxxxxx |
| **Google API Key** | `AIza[0-9A-Za-z_-]{35}` | AIzaEXAMPLExxxxxxxxxxxxxxxxxxxxxxxxxxx |
| **Supabase Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | JWT format keys |

### Generic Patterns

| Pattern Type | Regex | Notes |
|-------------|-------|-------|
| **Password assignment** | `(?i)(password\|passwd\|pwd)\s*[=:]\s*['"][^'"]{8,}['"]` | Min 8 chars to reduce false positives |
| **API key assignment** | `(?i)(api[_-]?key\|apikey\|api[_-]?secret)\s*[=:]\s*['"][^'"]+['"]` | Generic key patterns |
| **Private key header** | `-----BEGIN (RSA\|DSA\|EC\|OPENSSH\|PGP) PRIVATE KEY-----` | Any private key format |
| **Connection string** | `(postgres\|mysql\|mongodb\|redis)://[^:]+:[^@]+@` | DB URLs with credentials |
| **Bearer token** | `(?i)(bearer\|token)\s*[=:]\s*['"][a-zA-Z0-9_.-]{20,}['"]` | Auth tokens |

---

## Exclusion Rules

Files and patterns that are EXCLUDED from scanning:

### File Exclusions
- `*.test.ts`, `*.test.tsx` — Test files (may contain mock secrets)
- `*.e2e.ts` — E2E test files
- `.env.example` — Placeholder files
- `*.md` — Documentation files
- `package-lock.json`, `pnpm-lock.yaml` — Lock files
- `*.png`, `*.jpg`, `*.svg`, `*.ico` — Binary/image files
- `*.woff`, `*.woff2`, `*.ttf` — Font files

### Content Exclusions
Lines containing these words reduce severity to LOW:
- `example`, `placeholder`, `dummy`, `sample`, `test`, `mock`, `fake`
- `TODO`, `FIXME`, `CHANGEME`, `REPLACE_ME`

---

## Scanner Output Format

```typescript
interface SecretFinding {
  file: string;           // Relative file path
  line: number;           // Line number (1-indexed)
  column: number;         // Column number (1-indexed)
  pattern: string;        // Pattern name that matched
  matched_text: string;   // First 8 chars + "..." (never expose full secret)
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  suggestion: string;     // Remediation instruction
}
```

### Exit Codes
- `0` — No secrets found (commit proceeds)
- `1` — Secrets found (commit blocked)

---

## Remediation Protocol

When a secret is detected:

1. **Move to .env.local**:
   ```
   # .env.local (NEVER committed)
   STRIPE_SECRET_KEY=sk_live_actual_value
   ```

2. **Replace in source with process.env**:
   ```typescript
   // Before (BLOCKED)
   const stripe = new Stripe("sk_live_actual_value");

   // After (ALLOWED)
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
   ```

3. **Update .env.example**:
   ```
   # .env.example (committed, shows structure)
   STRIPE_SECRET_KEY=sk_live_your_key_here
   ```

---

## Integration with Agent-Shield

The pre-commit scanner (BASELINE 009) handles quick, git-hook-level scanning.
Agent-Shield (BASELINE 005) handles deeper, Gate 4-level scanning.

```
Pre-commit (fast):  Regex patterns on staged files → block commit
Agent-Shield (deep): Full code analysis → block deployment
```

Both must pass for code to reach production.

---

**END OF BASELINE 009**
