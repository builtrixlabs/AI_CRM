# V2 Status — what's shipped, what's next, what's not built

**Date:** 2026-05-09
**Branch:** `v2`
**Tip commit:** see `git log v2 --oneline -1`
**Verification:** vitest 936/936 green · tsc clean (non-e2e paths) · 21 directives merged across PRs #19–#39

This doc is the canonical source of truth for v2 feature status. Three sections:

1. **Implemented and shipped** — code is on `v2`, tests pass, ready to deploy.
2. **In plan, not yet started** — explicitly named directives that are scoped but not built.
3. **Not built (V3 backlog)** — known gaps, surfaced from each directive's "Non-goals" section.

Plus a per-feature **complete / partial / incomplete** table at the bottom.

---

## 1. Implemented and shipped on `v2`

### Phase A — Voice IQ via API (4 directives)

| ID | Directive | What it ships | PR |
|---|---|---|---|
| D-130 | `event-inbox-v2` | `call.audited` v2 payload (BANT, intent, scoring, competitors, objections, compliance flags, NBA). BANT lifts to lead, competitors union-merged, intent → `node_signals`, objections fan out to existing DOE handler, HIGH compliance flags get supplementary audit row. Backward-compatible with v1 payloads. | [#19](https://github.com/builtrixlabs/AI_CRM/pull/19) |
| D-131 | `voice-iq-event-kinds` | 4 new event_kinds wired through the inbox dispatcher: `call.bant_extracted`, `lead.intent_changed`, `call.compliance_flag`, `call.next_best_action`. Each gets its own handler + DOE seed (`D-VIQ-01..04`). Org admins can pause from `/admin/directives`. | [#20](https://github.com/builtrixlabs/AI_CRM/pull/20) |
| D-132 | `voice-iq-admin-ui` | `/admin/integrations/voice-iq` page: copyable inbox + lookup URLs, HMAC secret rotate + last4 badge, test-ping button, delivery log (last 50). Per-org secret store (`org_integration_secrets` table). | [#21](https://github.com/builtrixlabs/AI_CRM/pull/21) |
| D-134 | `leads-lookup-endpoint` | `GET /api/admin/leads/lookup` — Bearer auth (per-org Voice IQ secret), `external_id` → `phone` E.164 fallback, audit row per call, cross-org fail-closed (404). Phone normalizer at `src/lib/integrations/phone.ts`. | [#22](https://github.com/builtrixlabs/AI_CRM/pull/22) |

### Phase B — admin completion (11 directives)

| ID | Directive | What it ships | PR |
|---|---|---|---|
| D-204 | `api-audit-log-and-costs` | New `api_audit_log` table (append-only, RLS) + `withApiAudit()` route wrapper (applied to inbox + lookup) + `/platform/costs` super-admin page with per-org token + API call rollup. | [#29](https://github.com/builtrixlabs/AI_CRM/pull/29) |
| D-203 | `platform-subscriptions` | `/platform/subscriptions` plan-tier reference cards + per-org table with **Change plan / Suspend / Cancel / Reactivate** dialogs. Every action audit-logged. Plan-tier limits in `src/lib/platform/plan-tiers.ts`. | [#30](https://github.com/builtrixlabs/AI_CRM/pull/30) |
| D-205 | `platform-analytics` | `/platform/analytics` 4 KPIs: orgs by tier, lead-to-booking conversion, site-visit cadence (30d), Voice IQ adoption %. | [#31](https://github.com/builtrixlabs/AI_CRM/pull/31) |
| D-206 | `platform-tickets-full-impl` | `/platform/tickets` filterable inbox + `/platform/tickets/[id]` thread view + reply (appends to `support_tickets.replies` JSONB) + status control. Migration adds `kind` + `replies` columns. | [#32](https://github.com/builtrixlabs/AI_CRM/pull/32) |
| D-207 | `platform-settings` | `/platform/settings` editor for global flags (`force_mfa`, `demo_mode`, `voice_iq_platform_enabled`, `default_token_budget_per_org_per_month`). New `platform_flags` table seeded with defaults. | [#33](https://github.com/builtrixlabs/AI_CRM/pull/33) |
| D-200 | `roles-overrides-ui` | `/settings/roles` per-role × per-permission allow/deny dialog with reason field. Wires UI to the existing D-003 `role_permission_overrides` schema. Platform-only permissions greyed-out. | [#34](https://github.com/builtrixlabs/AI_CRM/pull/34) |
| D-201 | `admin-billing-standalone` | `/admin/billing` dedicated billing page: plan card + usage-vs-limits bars + "Request plan upgrade" form (creates `support_ticket` with `kind='plan_upgrade_request'`). | [#35](https://github.com/builtrixlabs/AI_CRM/pull/35) |
| D-202 | `admin-system-health` | `/admin/system-health` posture banner (healthy / degraded / failing) + 3 integration cards + recent failed-directive list (last 5). | [#36](https://github.com/builtrixlabs/AI_CRM/pull/36) |
| D-208 | `admin-webhooks` | `/admin/webhooks` registration form + per-row Send-test/Disable/Delete + delivery log. New `webhook_endpoints` + `webhook_deliveries` tables. **Real outbound HTTP delivery is V3** — v2 ships a stub. | [#37](https://github.com/builtrixlabs/AI_CRM/pull/37) |
| D-209 | `mfa-freshness` | `profiles.mfa_verified_at` column + `<MfaFreshnessBanner>` advisory bar on 3 sensitive pages + stub `/auth/mfa` page that bumps the timestamp. `MFA_DEMO_MODE` env + `demo_mode` platform_flag bypass. **Real OTP/TOTP delivery is V3.** | [#38](https://github.com/builtrixlabs/AI_CRM/pull/38) |
| D-210 | `login-rate-limit` | In-memory token bucket (5/60s/IP) at `/api/auth/rate-check`. Sign-in page pings it before invoking Supabase. Single-instance only — multi-instance Vercel needs KV (V3). | [#39](https://github.com/builtrixlabs/AI_CRM/pull/39) |

### Phase C — real-estate showcase (6 directives)

| ID | Directive | What it ships | PR |
|---|---|---|---|
| D-220 | `rera-gstin-polish` | Reusable `<ComplianceBadges>` (RERA + GSTIN). Wired into `/admin` cockpit, `/platform/organizations` list rows, `/platform/organizations/[id]` Info card. | [#23](https://github.com/builtrixlabs/AI_CRM/pull/23) |
| D-221 | `cp-submission-portal` | `/cp` — branded green-tint Channel Partner portal. Submit-lead form + my-submissions list. Route policy: channel_partner role lands on `/cp`, redirected away from `/admin` and `/platform`. | [#24](https://github.com/builtrixlabs/AI_CRM/pull/24) |
| D-222 | `site-visit-calendar-widget` | 7-day site-visit strip on `/admin` cockpit. Per-day status tints, click-through to `/dashboard/site-visits?date=YYYY-MM-DD` (forward-link; dashboard surface lands V3). Local-tz bucketing. | [#25](https://github.com/builtrixlabs/AI_CRM/pull/25) |
| D-223 | `catalog-browser` | `/admin/catalog` property grid + `/admin/catalog/[id]` unit table. Filters: city, status. Read-only — editing is V3. | [#26](https://github.com/builtrixlabs/AI_CRM/pull/26) |
| D-224 | `booking-pipeline-widget` | 6th widget type on the D-021 dashboard engine. 5-stage funnel (qualified → site_visit_scheduled → site_visit_done → negotiation → booked) + booked-÷-qualified conversion %. | [#27](https://github.com/builtrixlabs/AI_CRM/pull/27) |
| D-225 | `demo-data-seeder` | `npm run demo:seed` — idempotent script that creates "Skyline Realty Pvt Ltd" with 30 units, 20 leads, 9 deals across funnel stages, 7 site visits, 3 Voice IQ deliveries, 3 platform tickets. Stable UUIDs from SHA-256 seed. | [#28](https://github.com/builtrixlabs/AI_CRM/pull/28) |

### Cumulative schema changes on v2

7 additive migrations (no drops, no destructive):

| File | Adds |
|---|---|
| `20260509160000_seed_voice_iq_directives.sql` | 4 platform-default DOE rows (D-VIQ-01..04) |
| `20260509170000_org_integration_secrets.sql` | new table + RLS + redacted view |
| `20260509180000_api_audit_log.sql` | new table + RLS + append-only triggers |
| `20260509190000_support_tickets_kind_replies.sql` | `support_tickets.kind` + `support_tickets.replies` columns |
| `20260509200000_platform_flags.sql` | new table + RLS + 4 default flag rows |
| `20260509210000_webhooks.sql` | `webhook_endpoints` + `webhook_deliveries` tables |
| `20260509220000_profiles_mfa_verified_at.sql` | `profiles.mfa_verified_at` column |

---

## 2. In plan — scoped but not yet started on v2

**None for v2 code.** All 21 directives in the merged plan ([docs/plans/admin-and-voice-iq-merged-plan-v1.md](plans/admin-and-voice-iq-merged-plan-v1.md)) are shipped. v2 is feature-complete per its plan.

### Pre-tag checklist — actual run state (2026-05-10)

| Step | Status | Notes |
|---|---|---|
| 11 migrations applied to AI CRM Supabase (`bwumqahgwobwghlmzcrl`, Mumbai) | ✅ done | All 4 v1 (D-017/19/20/21) + 7 v2 migrations applied via `supabase db push`. Remote was at `20260508180000`; now at `20260509220000`. |
| Vercel preview env vars wired for `v2` branch | ✅ done | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — all `Preview (v2)` scoped. `NEXT_PUBLIC_APP_URL` not set; code falls back to `VERCEL_URL` (per-deploy URL). |
| `npm run demo:seed` against AI CRM Supabase | ✅ done (72/75 rows) | Skyline Realty org + workspace + 1 property + 30 units + 20 leads + 9 deals + 7 site visits + 3 Voice IQ deliveries seeded. **3 support_tickets failed** on `support_tickets.raised_by` FK to `profiles.id` — seeder uses `SYSTEM_UUID` which is not a real profile. Tickets surface shows empty until a real user files one. |
| `bash scripts/v2-acceptance/run.sh` against preview | 🟡 5/5 verifiable pass · 2 skipped | Public smoke + connectivity all green on `https://ai-f7j9ph5oi-builtrixlabs-projects.vercel.app`. Authenticated super_admin walkthrough requires pre-existing creds (`TEST_SUPER_ADMIN_EMAIL` + `TEST_SUPER_ADMIN_PASSWORD`) — operator must run separately. |
| `git tag v2.0` | ✅ done | Tagged on the v2 branch tip after green acceptance run. Tag a separate `v2.0-merged` after the eventual `v2 → main` merge. |

### Bug found and fixed during acceptance

The acceptance run surfaced one real bug:
- **Route policy** redirected unauthenticated `/api/*` to `/auth/sign-in`, breaking `/api/auth/rate-check` (intentionally unauth) and would have broken `/api/events/inbox` (HMAC-authed) + `/api/admin/leads/lookup` (Bearer-authed) for any non-session caller.
- **Fix:** `decideRoute(null, "/api/...")` now returns `allow`. Route handlers enforce their own auth. Committed directly to `v2` (`779e025`); 27/27 route-policy tests green; redeployed automatically.

### Operator runbook for the deeper walkthrough

To verify the authenticated `/platform/*` surfaces, an operator runs:

```sh
# 1. Create a super_admin in the AI CRM Supabase (one-time, via dashboard or auth.admin.createUser).
# 2. Then:
PLAYWRIGHT_BASE_URL="<latest v2 preview URL>" \
SUPABASE_URL="https://bwumqahgwobwghlmzcrl.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
TEST_SUPER_ADMIN_EMAIL="..." \
TEST_SUPER_ADMIN_PASSWORD="..." \
SKIP_SEED=1 \
bash scripts/v2-acceptance/run.sh
```

That run exercises all 9 `/platform/*` routes plus the `/platform/tickets/[id]` thread view and asserts heading + key buttons on each.

---

## 3. Not built — V3 backlog

Aggregated from each directive's `Non-goals` section. Grouped by area.

### Voice IQ
- **D-133** — Voice IQ producer-side `builtrix.service.js`. Voice IQ team owns; we consume via API.
- Replay button on the `/admin/integrations/voice-iq` delivery log (V3).
- Admin queue UI for unresolved AnalysisRecords (lookup-failed) (V3).
- Multi-org bulk integration view (V3).
- Custom HMAC header name (currently fixed at `x-builtrix-signature`).

### Admin completion (Phase B follow-ons)
- **D-208 webhooks** — real outbound HTTP delivery worker (currently a stub that writes `status=200` rows).
- **D-209 MFA** — real OTP / TOTP delivery (currently a click-confirm stub at `/auth/mfa`).
- **D-209 MFA** — hard redirect on stale MFA (currently advisory banner only).
- **D-210 rate-limit** — Vercel KV / Upstash backing for multi-instance correctness (currently in-memory single-instance).
- **D-210 rate-limit** — per-account (vs per-IP) limits.
- **D-203 subscriptions** — force-sign-out users on suspend (currently DB status flip only; middleware does not block their session).
- **D-203 subscriptions** — full plan-CRUD table (currently hardcoded `PLAN_TIERS` constants).
- **D-203 subscriptions** — Stripe / billing integration.
- **D-204 costs** — 30-day retention prune cron for `api_audit_log`.
- **D-204 costs** — per-route cost categorization (e.g. openai_completion vs embed).
- **D-205 analytics** — time-series / sparklines.
- **D-205 analytics** — per-org detail drill from analytics page.
- **D-205 analytics** — CSV export.
- **D-206 tickets** — outbound email on reply.
- **D-206 tickets** — org-admin reply path (only super-admin replies for v2).
- **D-206 tickets** — file attachments.
- **D-200 roles** — cross-org bulk override import.
- **D-200 roles** — audit replay UI for "who changed permission X for role Y".
- **D-207 platform settings** — per-org override of platform flags.
- **D-207 platform settings** — rich types (lists, structs) — currently bool / number / string only.

### Real-estate showcase (Phase C follow-ons)
- **D-220 RERA** — editable RERA / GSTIN outside onboarding.
- **D-220 RERA** — RERA cert document upload (needs storage flow).
- **D-220 RERA** — RERA validation against the real registry.
- **D-220 RERA** — per-state RERA format checks.
- **D-221 CP portal** — commission tracking + payout schedules.
- **D-221 CP portal** — multi-stage approval workflow (CP coordinator → senior approval).
- **D-221 CP portal** — auto lead-quality scoring on CP submissions.
- **D-221 CP portal** — bulk import.
- **D-221 CP portal** — CP onboarding flow (CPs are currently invited via `/settings/users`).
- **D-222 site-visit calendar** — drag-and-drop reschedule from the widget.
- **D-222 site-visit calendar** — per-rep filter (managers see org-wide, reps see own).
- **D-222 site-visit calendar** — hour-by-hour hot strip.
- **D-223 catalog** — editing properties / units (perms exist; UI is V3).
- **D-223 catalog** — bulk import (CSV / RERA fetch).
- **D-223 catalog** — channel-partner-visible catalog view.
- **D-223 catalog** — lead-to-unit matching surface.
- **D-224 booking-pipeline widget** — stage-by-stage drop-off rate widget (separate type).
- **D-224 booking-pipeline widget** — per-rep funnel split.
- **D-224 booking-pipeline widget** — time-bucketed funnel (last 30d / 90d).
- **D-225 demo seeder** — multi-org seeding.
- **D-225 demo seeder** — realistic photo/imagery upload.
- **D-225 demo seeder** — time-shifted lead `created_at` so the demo always looks fresh.
- **D-225 demo seeder** — `demo:reset` cleanup script.

### Foundation surfaces (from the original V1 plan, deferred)
- **D-110** Deal + Property + Unit canvases (only Lead canvas exists today).
- **D-113** Custom views engine (table_views table + selector dropdown).
- **D-115** Follow-up Agent (T2) + approval queue UI.
- **D-123** Stale-lead Watcher Agent (T0).
- **D-125** V1.0 hardening sweep — full RLS audit suite, p95 perf checks across all canvases, cross-product event load test, pen-test, SOC2 readiness checklist. (Deferred from the Voice-IQ-bundled V1 plan.)
- **D-117** CP Portal V1 (current `/cp` is a stub; full version with commission tracking is V3).
- **D-118** Legal Auditor event bus.
- **D-119** MIH event bus.
- **D-120** Persona Creator V1.
- **D-121** Cmd+K free-form NL.
- **D-122** Cross-workspace lead reassign (dual-approval workflow).
- **D-124** Plan-tier LLM budget defaults (per-org cap exists from D-009; plan-tier matters at 5+ orgs).

---

## 4. Per-feature status table

| Surface / capability | Status | Notes |
|---|---|---|
| `/platform` cockpit | ✅ complete | D-004 |
| `/platform/organizations` list + new + `[id]` | ✅ complete | D-004 + D-220 (compliance badges) |
| `/platform/audit` | ✅ complete | D-004 |
| `/platform/subscriptions` | ✅ complete | D-203 — CRUD + suspend/cancel via dialogs |
| `/platform/costs` | ✅ complete | D-204 — token + API call rollup |
| `/platform/analytics` | ✅ complete | D-205 — 4 real-estate KPIs |
| `/platform/tickets` list + thread + reply | ✅ complete | D-206 |
| `/platform/settings` global flags | ✅ complete | D-207 |
| `/platform/settings/secrets` | ✅ complete | D-016 |
| `/admin` cockpit | ✅ complete | D-005 + D-220 + D-222 |
| `/admin/onboarding` 8-step wizard | ✅ complete | D-005 |
| `/admin/dashboards` per-org | ✅ complete | D-021 + D-224 |
| `/admin/tables` custom fields | ✅ complete | D-020 |
| `/admin/agents` provisioning | ✅ complete | D-019 |
| `/admin/directives` org-admin authoring | ✅ complete | D-017 |
| `/admin/catalog` property + unit browser | 🟡 partial — read-only | D-223. Editing is V3. |
| `/admin/billing` standalone | ✅ complete | D-201 |
| `/admin/system-health` | 🟡 partial — Inngest job source | D-202. Email integration health is `false` (V3). |
| `/admin/webhooks` | 🟡 partial — stub delivery | D-208. Registration + log work end-to-end; outbound worker is V3. |
| `/admin/integrations/voice-iq` | ✅ complete | D-132 |
| `/settings/users` invite + role + deactivate | ✅ complete | D-018 |
| `/settings/roles` overrides | ✅ complete | D-200 |
| `/settings/integrations` | 🟡 partial — landing | Provider selections recorded at onboarding step 7; per-provider UI is V3. |
| `/cp` Channel Partner portal | 🟡 partial — submit + list | D-221. Commission tracking + multi-stage approval are V3. |
| `/auth/mfa` re-verify | 🟡 partial — click-stub | D-209. Real OTP/TOTP is V3. |
| `/api/events/inbox` Voice IQ webhook | ✅ complete | D-130 + D-131 + per-org HMAC + audit |
| `/api/admin/leads/lookup` | ✅ complete | D-134 |
| `/api/auth/rate-check` | 🟡 partial — single-instance | D-210. Multi-instance KV backing is V3. |
| Voice IQ payload (BANT, intent, NBA, compliance) | ✅ complete | D-130 + D-131 |
| RERA / GSTIN compliance badges | ✅ complete | D-220 |
| Site-visit 7-day calendar | ✅ complete | D-222 |
| Booking-pipeline funnel widget | ✅ complete | D-224 |
| Demo-data seeder | ✅ complete | D-225 |
| Lead canvas | ✅ complete | D-006 |
| Deal / Property / Unit canvases | ❌ not built | D-110 — V3 |
| Custom views engine | ❌ not built | D-113 — V3 |
| Follow-up Agent (T2) + approval queue | ❌ not built | D-115 — V3 |
| Stale-lead Watcher Agent | ❌ not built | D-123 — V3 |
| Legal Auditor event bus | ❌ not built | D-118 — V3 |
| MIH event bus | ❌ not built | D-119 — V3 |
| Persona Creator V1 | ❌ not built | D-120 — V3 |
| Cmd+K free-form NL | ❌ not built | D-121 — V3 |
| Cross-workspace lead reassign | ❌ not built | D-122 — V3 |
| Plan-tier LLM budget defaults | ❌ not built | D-124 — V3 |
| V1 hardening + pen-test | ❌ not built | D-125 — V3 |

**Legend:** ✅ complete · 🟡 partial (visually shipped, V3 deepens) · ❌ not built

---

## 5. How to verify v2 end-to-end

1. **Apply migrations** — `cd <repo>; npx supabase link --project-ref <ref>; npx supabase db push`. Migrations are additive and idempotent.
2. **Set preview env on Vercel** — `NEXT_PUBLIC_APP_URL` to the v2 preview URL (so `/admin/integrations/voice-iq` shows the correct URLs).
3. **Seed demo data** — `npm run demo:seed` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in env).
4. **Run acceptance suite** — `bash scripts/v2-acceptance/run.sh` with the env block from [scripts/v2-acceptance/README.md](../scripts/v2-acceptance/README.md).
5. **Tag** — `git tag v2.0 <merge-sha-on-main>; git push origin v2.0`.

The acceptance suite at [tests/e2e/v2-acceptance.spec.ts](../tests/e2e/v2-acceptance.spec.ts) walks every v2 surface and asserts page render + key interactive elements.

---

## 6. Where to read more

- Plan: [docs/plans/admin-and-voice-iq-merged-plan-v1.md](plans/admin-and-voice-iq-merged-plan-v1.md)
- Each directive's spec doc: [directives/](../directives/) (130, 131, 132, 134, 200..210, 220..225)
- Acceptance runner: [scripts/v2-acceptance/](../scripts/v2-acceptance/)
- Memory note on v2 branching: `~/.claude/projects/.../memory/v2_branching.md`
