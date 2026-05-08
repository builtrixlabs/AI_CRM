# Plan — 014-v0-hardening

## Steps

1. Run vitest, capture failures.
2. Fix the canvas/api.test.ts mock to handle the audit_log query
   path that D-009's group D added to `getLeadCanvas`.
3. Re-run vitest until green.
4. Run `npm run build` — must exit 0.
5. Run `npx tsc --noEmit` (exclude e2e tracked separately) — must
   be clean for non-e2e files.
6. Audit RLS on D-010..D-013 tables — write summary in
   `memory/decisions.md` D-014.x entries.
7. Author `docs/architecture.md` summarizing V0.
