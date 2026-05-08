# Directive 014 — V0 hardening pass

**Kind:** hardening (no new features)
**Status:** AUTHORIZED — Plan Mode (Gate 2) approved (operator: assume-approve)
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-014 + Constitution II tenant isolation, IV audit, VII security
**Authority:** memory/constitution.md (Principles II, IV, VII)
**Builds on:** every directive D-001 → D-013

---

## Problem

D-001 → D-013 ship features. D-014 is the "before-pilot quality
gate" — confirm the system holds up before D-015 onboards a real
org.

Scope:
1. **Test suite is 100% green** with the canvas/api test mock
   updated to cover the post-D-009 audit_log query path.
2. **Build is green** (`npm run build` exits 0).
3. **Type check is green** (excluding pre-existing e2e files —
   tracked separately).
4. **Coverage targets** ≥ 80% lines / ≥ 90% branches on the
   covered modules in `vitest.config.ts`.
5. **Documentation pass** — append the D-010 → D-013 decisions to
   `memory/decisions.md` (already done as part of each directive)
   AND a consolidated architecture summary at
   `docs/architecture.md`.
6. **RLS audit summary** — sweep every domain table that landed
   D-001..D-013 and confirm the policies match Constitution II
   (org-isolated SELECT, service-role-only writes for audit/log
   tables).
7. **Pen-test note** — channel-partner isolation already tested
   in D-001's `tests/integration/rls-channel-partner.test.ts`.
   Confirm new tables (`whatsapp_inbound_log`,
   `event_inbox_log`, `directive_invocations`,
   `org_whatsapp_endpoints`) inherit the same pattern.

D-014 deliberately ships **no new code paths**. Drive-bys allowed:
test mock fixes, doc additions, comment clarifications.

---

## Success criteria

- [ ] **AC-1** `npx vitest run` exits 0 with 0 failures.
- [ ] **AC-2** `npm run build` exits 0.
- [ ] **AC-3** `npx tsc --noEmit` exits 0 (excluding e2e files).
- [ ] **AC-4** `docs/architecture.md` exists and summarizes V0.
- [ ] **AC-5** Each new D-010..D-013 table has the documented RLS
      pattern (org-scoped SELECT + service-role writes).
- [ ] **AC-6** `memory/decisions.md` carries D-010 → D-014
      entries.

---

## Non-goals

- New features.
- Changes to baseline 110 / 112 / 115.
- New shadcn components.
