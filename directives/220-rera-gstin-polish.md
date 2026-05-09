# Directive 220 — RERA / GSTIN compliance polish

**Kind:** feature (V2 / Phase C — real-estate showcase)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §5 D-220
**Authority:** Constitution III (provenance), no schema changes
**Builds on:** D-001 (organizations.rera_number, organizations.gstin), D-005 (org-admin onboarding), D-004 (super-admin org detail)

---

## Problem

`organizations.rera_number` and `organizations.gstin` are captured at provision time by the onboarding wizard but only the GSTIN is surfaced — buried in the super-admin org-detail page. For a real-estate CRM, RERA registration is the single most important compliance signal a customer wants to see; it should be visible the moment a customer logs in.

D-220 surfaces both fields as first-class compliance badges in three places.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Reusable `<ComplianceBadges>` component (`src/components/compliance/compliance-badges.tsx`) renders RERA and GSTIN side-by-side. Each badge: green-tinted when set (with last-4 of the value), neutral when unset (with "missing" label).
- [ ] **AC-2** `/admin` cockpit header surfaces the badges immediately under the subtitle, before the resume-onboarding banner.
- [ ] **AC-3** `/platform/organizations` list page adds a "Compliance" column showing both badges per row.
- [ ] **AC-4** `/platform/organizations/[id]` Info card surfaces RERA explicitly (was missing — only GSTIN shown previously).
- [ ] **AC-5** `getCockpitData()` extended to return `compliance: { rera_number, gstin }`. No schema changes.
- [ ] **AC-6** `getOrgDetail()` already returns rera_number / gstin (verified in code) — surface in UI.
- [ ] **AC-7** Tests for `<ComplianceBadges>` component (RTL): renders set / unset states correctly; ARIA-friendly (badges have aria-label).

## Tests

- [ ] **AC-8** RTL test for `<ComplianceBadges>`: 4 cases (both set, both missing, RERA-only, GSTIN-only).
- [ ] **AC-9** `getCockpitData` test extension: confirms `compliance` field returned.
- [ ] **AC-10** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Editable RERA / GSTIN fields outside onboarding — V3.
- RERA cert document upload — V3 (needs storage flow).
- RERA validation against the real RERA registry — V3 (out-of-band).
- Per-state RERA format checks (each Indian state has its own format) — V3.

## Stack

shadcn Badge component (existing), Tailwind classes for green/neutral tint, no new dependencies.
