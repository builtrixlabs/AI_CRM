---
name: secret-fix-and-relocate
description: Use this skill when a hardcoded secret is detected in source. Moves the value to .env.local, replaces the literal with process.env.NAME, and updates .env.example with a placeholder.
---

# Secret Fix and Relocate

When invoked, follow these steps:

1. Identify the secret type from the detection report (AWS key, Stripe, OpenAI, DB URL, generic).
2. Decide an env var name in SCREAMING_SNAKE_CASE; prefix with `NEXT_PUBLIC_` ONLY if the value is intended for the browser (rare for secrets).
3. Append to `.env.local`: `<NAME>=<value>` — never commit this file.
4. Replace the literal in source with `process.env.<NAME>!` (TS) or `process.env.<NAME>` (JS), with a runtime guard if optional.
5. Update `.env.example` with `<NAME>=<placeholder-describing-the-value>` so other operators know what to set.
6. Re-run the secret scanner: `npm run test:security` (or stage and trigger pre-commit). Confirm clean.

## Refuse to do

- Move a secret that's already revoked — flag and exit; the operator should generate a new one.
- Replace a secret literal with a hardcoded "default" — only `process.env`.
- Commit `.env.local` even once. Confirm `.gitignore` covers it before staging.

## Authority

- POLICY 013 (Pre-Commit Secret Detection)
- BASELINE 009 (Pre-Commit Contract)
