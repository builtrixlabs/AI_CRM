---
name: supabase-rls-policy
description: Use this skill when writing or reviewing a Supabase Row-Level Security policy. Generates deny-all default policies plus explicit allow rules per role.
---

# Supabase RLS Policy

When invoked, follow these steps:

1. Identify the table needing RLS.
2. Always start with: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
3. Add a deny-all default. Then add explicit allow rules per role from `templates/`.
4. Validate: every SELECT / INSERT / UPDATE / DELETE has at least one explicit policy.
5. Add a comment on each policy explaining the rule's intent.

## Templates

- `templates/owner-only.sql` — row owner reads + writes their own rows
- `templates/authenticated-read.sql` — any authenticated user can read
- `templates/service-role-write.sql` — only service_role writes

## Anti-patterns to refuse

- `USING (true)` without a `WITH CHECK` clause
- Policies on tables where RLS is not enabled
- Mixing role checks and ownership checks in a single policy
- Granting `anon` role write access without explicit operator authorization

## Authority

- POLICY 009 (Security Scanning)
- BASELINE 002 (Auth & RBAC Core)
