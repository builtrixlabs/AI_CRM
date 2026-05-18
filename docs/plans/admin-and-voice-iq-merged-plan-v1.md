# V2 Showcase Plan — Admin Completion + Voice IQ API + Real-Estate Polish

**Author:** Jarvis (drafted for Raghava, Builtrix Labs Pvt Ltd)
**Date:** 2026-05-09
**Status:** DRAFT v2 — pending operator review
**Branch:** `v2` (cut today from `v1`)
**Inputs merged:**
1. `05-builtrix-next-stage-implementation-plan-v1.md` (Downloads — original 8-week V1.0 plan)
2. PSCRM_Claude-7.0.4 (Downloads — reference admin model)
3. Current AI_CRM repo state on `v1` (commit `79b1709` — D-017..D-021 shipped)
4. **Operator clarification 2026-05-09:** v2 is for admin work + Voice IQ API integration, **not a full app rebuild** — the goal is **a coherent demo to show prospects the bigger picture**. Product is a **real-estate-focused CRM** — keep deals/properties/units/site-visits/channel-partners front-and-centre.

**Companion docs:** `docs/install-plan.md`, `docs/PRD.md`, `docs/architecture.md`

---

## 0. TL;DR

| | |
|---|---|
| **v1 branch** | Live pilot. No new features. Bug fixes only. D-016 pilot-gate audit still operational. |
| **v2 branch** | Showcase / demo. 14 directives across three phases. **No production-grade hardening required** — visual completeness + scripted demo flow. |
| **Phases on v2** | A) Voice IQ API integration (4 dirs) → B) Admin completion (10 dirs) → C) Real-estate showcase polish (5 dirs). |
| **Skip on v2** | D-133 (Voice IQ side `builtrix.service.js` — Voice IQ producer team owns; we consume). Pen-test sign-off (that's v1.0 release work). Deep edge-case handling (demo scope). |
| **Critical inversion vs original plan** | Voice IQ work moves from V1.0 critical path → V2 showcase. v1 stops being the active dev branch. |
| **Customer story v2 unlocks** | "Builtrix is a real-estate CRM with platform-grade multi-tenancy, plan tiers, AI agents that scale to your role, and Voice IQ that turns every sales call into BANT-scored canvas data — all admin-self-serviceable." |
| **First action** | Confirm scope. Then D-016 pilot audit (still operational, gates v1 health). Then start v2 Phase A. |

---

## 1. Inventory — What's Already Shipped on `v1`

### Super-admin (`/platform/*`) — D-004

| Surface | Status |
|---|---|
| `/platform` cockpit | ✅ live |
| `/platform/organizations` (list + search) | ✅ live |
| `/platform/organizations/new` (atomic provisioning + magic-link) | ✅ live |
| `/platform/organizations/[id]` (read-only drill-down) | ✅ live |
| `/platform/audit` (filterable log) | ✅ live |
| `/platform/settings/secrets` (AI provider config — D-016) | ✅ live |
| `/platform/settings/profile` | ✅ live |
| `/platform/analytics` `/costs` `/subscriptions` `/tickets` `/settings` | 🟡 placeholders |

### Org-admin (`/admin/*` + `/settings/*`) — D-005, D-017..D-021

| Surface | Status | Source |
|---|---|---|
| `/admin` cockpit | ✅ live | D-005 |
| `/admin/onboarding` (8-step wizard incl. RERA/GSTIN) | ✅ live | D-005 |
| `/admin/dashboards` (per-org defs + 5 widget types) | ✅ live | D-021 |
| `/admin/tables` (custom field defs) | ✅ live | D-020 |
| `/admin/agents` (provisioning + tier override + suspend) | ✅ live | D-019 |
| `/admin/directives` (org-admin DOE authoring) | ✅ live | D-017 |
| `/settings/users` (invite / role / deactivate) | ✅ live | D-018 |
| `/settings/integrations` (email / WhatsApp) | ✅ live | D-005 |

### RBAC core

- 9 base roles, ~80 permissions ([src/lib/auth/rbac.ts](src/lib/auth/rbac.ts)).
- Three-layer resolver: base UNION bridge UNION allow EXCEPT deny.
- `role_permission_overrides` table + RLS + DB trigger guards platform-only perms.

**Net:** the admin scaffold is real and shipped. v2's job is **filling in placeholders + adding the Voice IQ integration story + sharpening the real-estate narrative.**

---

## 2. v2 Phases & Sequence

Total v2 horizon: **~10 weeks** (looser than v1's 8 because demo-quality, not pilot-quality).

| Week | Phase | Directives | Focus |
|---|---|---|---|
| 1 | A — Voice IQ API integration | D-130 (inbox v2), D-131 (4 new event_kinds) | Inbound event surface ready |
| 2 | A | D-132 (`/admin/integrations/voice-iq` UI), D-134 (lookup endpoint) | Customer can see "wire your Voice IQ" |
| 3 | B — Admin completion | D-200 (`/settings/roles` overrides UI), D-209 (MFA freshness) | RBAC story complete |
| 3–4 | B | D-201 (`/admin/billing` standalone), D-203 (`/platform/subscriptions` CRUD + suspend) | Billing + subscription story |
| 4–5 | B | D-202 (`/admin/system-health`), D-204 (`/platform/costs` + per-request audit) | Ops observability |
| 5–6 | B | D-205 (`/platform/analytics` — real-estate KPIs), D-206 (`/platform/tickets` full impl) | Platform metrics + support |
| 6–7 | B | D-207 (`/platform/settings`), D-208 (`/admin/webhooks`), D-210 (login rate limit) | Polish + minimum security |
| 7–8 | C — Real-estate showcase | D-220 (RERA/GSTIN compliance polish), D-221 (CP submission portal stub) | Real-estate distinctiveness |
| 8–9 | C | D-222 (site-visit calendar widget), D-223 (property/unit catalog browser) | Pipeline visualisation |
| 9 | C | D-224 (booking-pipeline dashboard widget), D-225 (demo-data seeder) | One-command demo bootstrap |
| 10 | Polish | Demo dry-runs, screenshots, customer-pitch deck refresh | `v2.0` tag |

**Sequencing principle:** ship Voice IQ first (Phase A) so every later admin surface can reference it; admin then real-estate polish; demo seeder last so it can populate every new surface.

---

## 3. Phase A — Voice IQ API Integration (Weeks 1–2)

**Scope cut from original plan:** drop D-133 (Voice IQ-side `builtrix.service.js`). v2 only consumes — the producer-side service is the Voice IQ team's deliverable. We provide the inbox + lookup contract; they POST to it.

### D-130 — CRM event inbox v2 schema + extended `call.audited` handler

(Identical scope to original plan §3 D-130. See `05-builtrix-next-stage-implementation-plan-v1.md` for ready-to-paste prompt.)

**Demo lens:** v2 acceptance is "BANT lift to lead is visible on the lead canvas within 30s of a webhook POST". Drop the 80/90 coverage hardening — 70/80 is enough for a demo branch.

### D-131 — Four new event_kinds (BANT, intent, compliance, NBA)

(Identical scope to original plan §3 D-131.)

**Demo lens:** seed the 4 D-VIQ-XX directives so org_admin can pause them from `/admin/directives` during a demo. Skip cross-tenant fuzz tests — happy-path only.

### D-132 — `/admin/integrations/voice-iq` UI

(Identical scope to original plan §3 D-132.)

**Demo lens:** the **money shot** of Phase A. Make sure:
- Inbox URL display is copy-button + QR-codable.
- "Test webhook ping" button shows the round-trip latency live.
- Delivery log table animates new rows in realtime (Supabase Realtime channel — already in stack).

### D-134 — Lead resolution lookup endpoint (CRM side only)

(Cut to CRM-side endpoint only. Voice IQ-side backfill / call-time lookup is the Voice IQ team's work, not v2.)

**Scope:**
- `GET /api/admin/leads/lookup?external_id=&phone=&org_id=` — returns `{lead_node_id, workspace_id}` or 404.
- Service-account JWT, E.164 phone normalization, audit row per call.
- p95 < 200ms.
- Coverage 70/80, demo lens.

---

## 4. Phase B — Admin Completion (Weeks 3–7)

10 directives. Each is small (S–M); none should exceed 2-3 days. Demo lens applies — visual completeness + scripted flow, not production hardening.

### D-200 — `/settings/roles` permission-overrides UI
- Schema + RLS + trigger already exist. Pure UI + server-action work.
- Table per role × permission, allow/deny toggles, reason field, audit-logged.
- **Real-estate hook:** seed three suggested overrides relevant to real estate — e.g. "channel_partner can submit_lead but cannot view_commissions until verified" — to make the page feel useful from first load.

### D-201 — `/admin/billing` standalone page
- Move plan / usage / limits cards from `/admin` cockpit into a dedicated `/admin/billing`.
- Add request-upgrade flow (writes a `support_ticket` row with `kind='plan_upgrade_request'`).
- **Real-estate hook:** plan tiers shown with real-estate-relevant limits — *max active properties*, *max bookings/month*, *channel-partner seats*.

### D-202 — `/admin/system-health`
- Failed Inngest job count (last 7 days) + integration health checks (email, WhatsApp, Voice IQ webhook).
- Alert digest: "X failed jobs in last 24h, oldest at HH:MM."
- **Demo lens:** mock-data fallback if Inngest is empty — a good system-health page never shows nothing.

### D-203 — `/platform/subscriptions` plan CRUD + suspend / cancel
- Subscription plan editor: tier name, max users, max bookings/month, max properties, feature flags JSON.
- Per-org actions: suspend (status=suspended, sign-out all users) / reactivate / cancel (status=cancelled, 30-day grace).
- Custom override editor: per-org `custom_overrides` JSON (e.g. "increase max_users to 50 for this enterprise deal").

### D-204 — `/platform/costs` + per-request API audit log
- New table `api_audit_log` (method, path, status_code, permission_checked, ip, ua, latency, user_id, org_id, ts).
- `/platform/costs` shows: per-org token spend (from existing `token_usage_ledger`), per-org API call count.
- **Demo lens:** seed 90 days of synthetic data so the chart isn't empty.

### D-205 — `/platform/analytics` (real-estate KPIs)
- 4 widgets:
  1. Active orgs by plan tier (stacked bar)
  2. **Lead-to-booking conversion %** (real-estate signature metric — funnel)
  3. **Site-visit cadence** (visits scheduled / completed / no-show, last 30 days)
  4. Voice IQ adoption (% of orgs with VIQ integration enabled)
- **Real-estate hook:** every metric speaks to real-estate sales motion, not generic SaaS.

### D-206 — `/platform/tickets` inbox + reply UI
- List: kind, org, status, created, last_activity. Filters by status / kind.
- Detail page: thread view, reply textarea, status changer (open / waiting_customer / resolved).
- Outbound email via existing email integration (no new infra).
- **Demo lens:** seed 5 representative tickets at demo-data time (D-225).

### D-207 — `/platform/settings`
- Global feature-flag toggles (e.g. "enable Voice IQ integration platform-wide", "force MFA").
- System constants: token-cost defaults, plan-tier-default-on-new-org.
- Audit-logged writes.

### D-208 — `/admin/webhooks` outbound webhook management
- Org-admin can register outbound webhooks (URL, secret, event subscriptions).
- Delivery log table (last 50, status, latency).
- **Demo scope:** registration + log table. Actual delivery worker is a stub that 200s on POST and logs the row — enough to demo the surface, no real outbound HTTP.

### D-209 — MFA freshness on sensitive routes
- Sensitive routes: all `/platform/*`, `/admin/billing`, `/admin/integrations/*`, `/settings/users`, `/settings/roles`.
- Freshness window: 8h (env-configurable).
- Redirect to `/auth/mfa?return=<path>` if stale.
- **Demo lens:** add a `MFA_DEMO_MODE=true` env flag that bypasses the check during scripted demos. Default off in v2.

### D-210 — Login rate limit + cross-surface guard tighten
- 5/min/IP on `/auth/sign-in`. Vercel KV preferred; in-memory bucket fallback.
- Middleware audit: super_admin → `/admin|/dashboard` redirect to `/platform`; org_* → `/platform` redirect to `/admin`. Negative tests for forge attempts.
- **NB:** this was D-022 in the v1-merged plan; moved to v2 since v1 isn't taking new features.

---

## 5. Phase C — Real-Estate Showcase Polish (Weeks 7–9)

This is the **distinctive** layer — what makes Builtrix recognisably a real-estate CRM, not a generic SaaS.

### D-220 — RERA / GSTIN compliance polish
- Org-admin onboarding step 1 already captures RERA + GSTIN. Surface them prominently:
  - Org cockpit header badge: "RERA-verified" / "GSTIN-on-file" / "missing".
  - `/platform/organizations/[id]` shows compliance status in the header.
  - Document upload slot for RERA certificate (uses existing documents flow).
- **Demo lens:** the badge is the showcase — visible the moment a customer logs in.

### D-221 — Channel Partner submission portal stub
- (Original PRD D-117 deferred from v1.) Minimal demo version:
  - `/cp` route, channel_partner role login.
  - Single form: submit a lead with name, phone, source property, expected budget.
  - Submission lands as a `lead` node with `data.cp_submitted_by` provenance.
  - "My submissions" tab — read-only list with status (pending / accepted / converted / rejected).
- **Demo scope:** form + list. No commission tracking. No multi-stage approval.

### D-222 — Site-visit calendar widget on org cockpit
- Calendar widget on `/admin` cockpit: next 7 days of site visits across the org.
- Day cells show count + click-through to `/dashboard/site-visits?date=...`.
- Coloured by status: scheduled (blue), confirmed (green), no-show (red).
- **Real-estate hook:** site visits are the cardinal real-estate sales action — making them visible at a glance is the showcase.

### D-223 — Property / Unit catalog browser
- New surface `/admin/catalog`: browse properties + units in the org.
- Filters: project, status (available / held / booked), price range, configuration.
- Read-only — no create/edit. (Catalog editing is a v3 directive.)
- **Demo lens:** seed a fictional 3-tower 600-unit project at D-225 — instantly demoable.

### D-224 — Booking-pipeline dashboard widget
- New widget type `booking_pipeline` for the existing dashboard engine (D-021).
- Stages: lead → site_visit_scheduled → site_visit_done → negotiation → booked.
- Per-stage count + drop-off %.
- **Real-estate hook:** the canonical real-estate funnel, made first-class.

### D-225 — Demo-data seeder
- `npm run demo:seed` — idempotent script that populates a sample org with:
  - 1 fictional builder org ("Skyline Realty Pvt Ltd"), 1 RERA cert, 1 GSTIN.
  - 3 users (org_admin, manager, sales_rep).
  - 1 project, 3 towers, 600 units across configurations.
  - 50 leads at varied funnel stages, 20 site visits, 5 bookings.
  - 5 Voice IQ call analyses with BANT/intent payloads.
  - 5 platform support tickets in varied states.
  - 90 days of synthetic api_audit_log + token_usage_ledger rows.
- **Demo lens:** one command spins up a credible demo org. Without this, every new surface looks empty in screenshots.

---

## 6. What This Plan Skips (and why)

| Item | Why skipped on v2 |
|---|---|
| D-110 Deal/Property/Unit canvases (original V1 plan) | Already partially in v1; deal canvas live, polish in v3 |
| D-113 Custom views engine | Power-user feature, not a demo headliner. v3. |
| D-115 Follow-up Agent (T2) + approval queue | Pilot-grade feature; not demo-distinctive. v3. |
| D-123 Stale-lead Watcher Agent | Background agent; invisible in a 10-min demo. v3. |
| D-125 V1 hardening + pen-test | v2 is demo-quality, not production. v3. |
| D-133 Voice IQ-side `builtrix.service.js` | Voice IQ team owns; we consume via API. |
| D-116 Custom Outbound Agent (T3), D-118 Legal Auditor producer, D-119 MIH | Per the v1 plan — still deferred. |

---

## 7. Coverage / Quality Targets (v2 demo-grade)

Lower than v1's 80/90 — explicitly demo branch.

| Gate | v1 (pilot) | v2 (demo) |
|---|---|---|
| Coverage lines | ≥ 80% | ≥ 70% |
| Coverage branches | ≥ 90% | ≥ 80% |
| Acceptance test pass | 100% | 100% (happy-path only) |
| Playwright @smoke | 100% | 100% |
| Playwright @regression | 100% | best-effort |
| Security CRITICAL | 0 | 0 |
| Security HIGH | 0 | logged, fix if 1-day-or-less |
| RLS audit | 0 leaks | spot-check (sample 5 tables) |
| Pen-test | required | not required |

The gate config lives in `policy/v2-quality-targets.json` (new — needs Plan-Mode review at first v2 directive).

---

## 8. Risk Register (v2-specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Voice IQ team's webhook contract drifts mid-Phase A | Medium | High | Lock contract in writing before D-130 starts. Use `schema_version: "v2"` to absorb additions. |
| R2 | Demo data seeder (D-225) becomes a tar-pit (every directive expects more seed data) | High | Medium | Cap at 1 day. Schema-driven — extend by adding rows to a YAML, not by adding code. |
| R3 | v2 ships with broken `v1` (forgot to back-port a v1 fix) | Medium | Medium | Weekly cherry-pick check from `v1` → `v2`. Documented in runbooks. |
| R4 | Customer demo reveals a bug we shipped knowingly as "demo-grade" | Medium | High | Maintain a **demo script** (`docs/demos/v2-walkthrough.md`) that lists the exact path the screencast follows. Don't deviate live. |
| R5 | "Demo-grade" creep — directive scope balloons toward production-grade | High | High | Each directive's prompt explicitly says "demo lens — do not over-engineer". Plan Mode review is the choke-point. |
| R6 | MFA freshness (D-209) breaks scripted demos | Low | High | `MFA_DEMO_MODE=true` env flag; default off; documented in runbook. |
| R7 | Real-estate hooks (RERA/GSTIN/CP) feel bolted-on | Medium | High | Phase C directives all include "real-estate hook" as a first-class success criterion, not a footnote. |

---

## 9. Operational Loop (per directive)

Same V5 framework loop:

1. Operator: paste ready-to-paste prompt → Claude Code.
2. Claude: drafts plan → Plan Mode (Gate 2).
3. Operator: approve / edit / reject. **Demo-lens enforcement happens here.**
4. Claude: executes Gates 3–5 (TDD + scan + deploy preview), bypass-permissions on.
5. Green on `v2` → next directive.

**Branching rule (memory: `v1_branching.md` + this plan §0):**
- v1 directives → `v1` (no new ones expected during v2 horizon).
- v2 directives (D-130..D-225) → `v2`.
- v2 → `main` merge happens at `v2.0` tag (~Week 10).

**Hard rules:**
- One directive at a time. No parallel branches.
- Each directive lands GREEN on `v2` before next starts.
- Demo-lens is a hard scope rail — if a directive grows toward production-grade, split or defer.

---

## 10. Success Metrics — `v2.0` Tag

| Metric | Target |
|---|---|
| Customer-facing demo walkthrough completes end-to-end | YES |
| `npm run demo:seed` produces a credible real-estate org in < 30s | YES |
| Voice IQ webhook → lead canvas BANT visible in < 30s | YES |
| Every `/platform/*` and `/admin/*` page either fully functional or visually complete (no "Coming soon") | YES |
| RERA / GSTIN compliance badges visible in 3 places | YES |
| Site-visit calendar widget renders 7 days of mock data on cockpit | YES |
| Booking-pipeline funnel widget renders on per-org dashboard | YES |
| `/cp` channel-partner submission round-trips a lead | YES |
| Login rate limit verified | YES |
| `v2.0` tagged on `main` (via `v2` → `main` merge) | YES |
| **Demo screencast recorded** | YES (deliverable, not just code) |
| Pipeline orgs (signed LOI / paid pilot agreed off the v2 demo) | ≥ 5 (stretch ≥ 10) |

---

## 11. Customer Demo Storyline (the bigger picture)

The 10-12 minute scripted walkthrough v2 unlocks:

1. **Sign in as super_admin** → `/platform` cockpit. *"This is Builtrix's platform side — every customer org provisioned and monitored from here."*
2. **`/platform/organizations/new`** → provision "Skyline Realty Pvt Ltd". *"Atomic — org, default workspace, admin user, plan tier, all in one transaction. RERA + GSTIN captured at provision time."* (D-220)
3. **Sign in as Skyline's org_admin** → `/admin` cockpit. *"Account state, plan usage, customization — all here. Operational work happens elsewhere; this is the account-management plane."*
4. **`/admin/onboarding` step-through** → 8-step wizard. *"7 minutes from provision to operational."*
5. **`/admin/dashboards`** → flip on "Booking pipeline" widget (D-224). *"Real-estate-specific funnel — visible on every dashboard."*
6. **`/admin/agents`** → provision the Lead Enrichment agent. *"AI agents tier-capped at provision time — Constitution I. Tier T0 / T1 / T2 / T3 corresponds to autonomy level."* (D-019, already shipped)
7. **`/admin/integrations/voice-iq`** → wire up the inbox HMAC secret + test webhook ping (D-132). *"Voice IQ pushes call analyses here — BANT, intent, NBA, all auto-attached to the right lead."*
8. **POST a sample webhook** → switch to `/dashboard/leads/<id>` → BANT score visible on canvas, NBA in side panel (D-130, D-131).
9. **`/cp`** → log in as channel partner, submit a lead (D-221). *"Channel partners — first-class in real estate."*
10. **`/admin/catalog`** → browse the 600-unit project (D-223). *"Property/unit catalog — what every real-estate CRM lives or dies on."*
11. **`/admin/billing`** → request plan upgrade (D-201). *"Self-service plan changes."*
12. **Switch back to super_admin** → `/platform/tickets` → see the upgrade ticket land in real-time (D-206). *"Closed loop."*

That's the v2 demo. Every directive in §3–§5 exists to make exactly one beat of this story land.

---

## 12. Open Questions

1. **Voice IQ webhook contract:** is the producer-side service ready and pointing at our staging URL by Week 1? If not, Phase A starts with a contract-mocking workshop instead.
2. **Demo customer profile:** small builder (10 reps) or large (100+)? Affects D-225 seed-data scale.
3. **CP portal scope (D-221):** form + list only, or also "in-progress submissions" status update? Form-only is cleaner for demo.
4. **`MFA_DEMO_MODE` (D-209):** confirmed OK to ship a bypass flag in code, or do we leave MFA off entirely for demo and document it as "production-only"?
5. **`v2.0` cadence:** 10 weeks is conservative. If we land 2 directives per week (vs current 1), we hit it in 7 weeks. Aspirational target?

---

*End of plan v2.0 draft. First action: confirm scope. Then I generate the D-130 ready-to-paste prompt to start Phase A.*
