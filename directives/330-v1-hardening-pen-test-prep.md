# Directive 330 — V3.0 sign-off (V1 hardening + pen-test prep)

**Kind:** hardening (V3 / Phase D — closes V3.0)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Branch target:** `v2`
**Source:** `docs/plans/v3-plan-v1.md` §6 D-330

---

## Problem

Phases A–C shipped the production-grade auth boundary, billing, real-estate completeness, and the first production agent. Before tagging `v3.0` we need the prep package an external pen-test vendor needs and the SOC2 readiness checklist an enterprise customer's security review will ask for. D-330 is **mostly documentation + a focused test extension** — the heavy work (vendor engagement, SOC2 certification) is operator-led post-tag.

## Success criteria (production target — docs + tests)

### Documentation

- [ ] **AC-1** `docs/security/threat-model.md` — OWASP Top 10 (2021) scored against the codebase. For each item: status (Mitigated / Partial / Acknowledged-as-V3.x), evidence file paths + the directive that addresses it, residual risk note.
- [ ] **AC-2** `docs/security/auth-flow.md` — text-based auth flow diagrams (sign-in, MFA enrollment, MFA verify, suspend, RLS query path). ASCII so a security reviewer can read in any browser without an image-renderer.
- [ ] **AC-3** `docs/security/soc2-readiness.md` — control-evidence checklist. Each control: location of audit evidence (audit_log table, hooks, runbooks), responsible party (operator vs. system), maturity (Level 1 / 2 / 3).

### Test extension (RLS pt 2)

- [ ] **AC-4** Extend `tests/integration/rls-audit.test.ts` (D-302) with a pinpoint check for SECURITY DEFINER functions: enumerate `pg_proc` for each `app_*` / `prune_*` function we ship, assert each has explicit `search_path` set (no search-path injection vector). This is a unit-testable property; lives in `tests/lib/security/security-definer-search-path.test.ts` so it runs in default CI rather than only against live DB.
- [ ] **AC-5** Coverage: no specific gate on D-330's test — it's a structural assertion.

## Non-goals (operator-led, post-tag)

- **Third-party pen-test vendor engagement** — D-330 ships the vendor brief, not the engagement itself.
- **SOC2 Type 2 certification** — multi-month engagement.
- **Playwright @perf suite + 100k-event load test** — V3.x. We acknowledge them in the threat model but defer to dedicated perf hardening.
- **WAF / DDoS layer** — Vercel provides default; explicit rules / Cloudflare-front V3.x.
- **Bug-bounty program launch** — V3.x.

## Operator follow-ups (post-merge)

- [ ] Engage pen-test vendor with `docs/security/threat-model.md` + `docs/security/auth-flow.md` as the brief.
- [ ] Provide SOC2 auditor `docs/security/soc2-readiness.md` as the prelim package.
- [ ] After clean pen-test report, tag `v3.0`, then `v3.0-merged` after `v3 → main` merge (or, since v3 is being merged onto v2 in this PR cadence, tag directly on the v2 tip).
- [ ] Schedule the V3.x backlog kickoff (the items deferred by §3 of `docs/plans/v3-plan-v1.md`).
