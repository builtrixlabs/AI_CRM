# V3 MVP Plan — From Demo-Grade to Ship-Able

**Author:** Jarvis (drafted for Raghava, Builtrix Labs Pvt Ltd)
**Date:** 2026-05-10
**Status:** DRAFT v1 — pending operator review
**Branch:** `v3` (to be cut from `main` once [apps#41](https://github.com/builtrixlabs/AI_CRM/pull/41) — `v2 → main` — lands; until then, cut from `v2` tip `d7b28d9`)
**Inputs merged:**
1. [docs/V2_STATUS.md](../V2_STATUS.md) — canonical inventory of v2 ship state + V3 backlog
2. [docs/plans/admin-and-voice-iq-merged-plan-v1.md](admin-and-voice-iq-merged-plan-v1.md) §6 — items deferred from v2
3. Operator directive 2026-05-10: **"build the minimum needed to have an MVP ready with existing system"**

**Companion docs:** [docs/install-plan.md](../install-plan.md), [docs/PRD.md](../PRD.md), [docs/architecture.md](../architecture.md)

---

## 0. TL;DR

| | |
|---|---|
| **Frame** | v3 is **production-readiness**, not feature expansion. We don't build new modules; we close the gap between v2's demo-grade build and a system a paying real-estate customer can run their daily sales on without hitting a wall. |
| **MVP definition** | A small/mid real-estate builder (5–50 reps) signs up, gets onboarded, runs sales for 90 days, hits zero blocking gaps in auth, billing, day-to-day catalog operations, or compliance. |
| **v3 branch** | Cut from `v2` (then rebased onto `main` after [apps#41](https://github.com/builtrixlabs/AI_CRM/pull/41) merges). 10 directives across 4 phases. |
| **Phases on v3** | A) Auth & security hardening (3 dirs) → B) Billing + delivery + observability (3 dirs) → C) Real-estate daily-use completeness (3 dirs) → D) V3.0 sign-off sweep (1 dir). |
| **What v3 is NOT** | A redesign. We don't touch the existing v2 surface area unless we're fixing a stub. No new platform / admin / dashboard surfaces. No agent-engine work beyond Follow-up T2. |
| **Coverage swing** | v2 was demo-grade 70/80. **v3 swings back to production-grade 80/90** per V5 spec. Acceptance tests 100%. CRITICAL = 0 after auto-fix. |
| **Critical inversion vs v2** | v2's "non-goals" become v3's must-haves. Every v3 directive maps directly to a "currently a stub" or "deferred to V3" line in [V2_STATUS §3](../V2_STATUS.md). |
| **Customer story v3 unlocks** | "Builtrix is a real-estate CRM you can put your business on — real MFA, Stripe-billed plans, audited security boundary, sales reps editing their unit catalog daily, and a follow-up agent that pays for itself." |
| **First action** | Confirm scope. Then start v3 Phase A with D-300 (real TOTP MFA) — the highest-impact, smallest-scope directive that unblocks everything sensitive. |

---

## 1. Where We Are — v2 Inventory in One Page

Full canonical breakdown lives in [docs/V2_STATUS.md](../V2_STATUS.md). One-page summary:

**✅ Shipped on v2 (21 directives, tagged `v2.0`):**
- Voice IQ API integration end-to-end (D-130..D-134)
- Admin completion 11 surfaces — `/platform/{subscriptions,costs,analytics,tickets,settings}`, `/admin/{billing,system-health,webhooks,integrations/voice-iq}`, `/settings/roles`, MFA scaffolding, login rate-limit (D-200..D-210)
- Real-estate showcase — RERA/GSTIN badges, CP portal stub, site-visit calendar, catalog browser, booking-pipeline widget, demo seeder (D-220..D-225)
- 7 additive Supabase migrations
- vitest 936/936 green, tsc clean

**🟡 Partial / stub on v2 (the v3 backlog):**
- D-208 webhook delivery — registration UI works, outbound HTTP delivery is a stub
- D-209 MFA — `mfa_verified_at` column + advisory banner + click-stub `/auth/mfa`; no real OTP/TOTP
- D-210 rate-limit — in-memory token bucket; falls over on multi-instance Vercel
- D-203 subscriptions — hardcoded `PLAN_TIERS` constants, no Stripe, no force-sign-out on suspend
- D-223 catalog — read-only browser; no editing
- D-204 costs — no retention prune, no per-route cost categorization
- D-205 analytics — current-snapshot only; no time-series

**❌ Not built (deferred to v3):**
- D-110 Deal canvas (Lead canvas works; deals are graph nodes only)
- D-115 Follow-up Agent (T2) + approval queue UI
- D-118 Legal Auditor / D-119 MIH event buses
- D-125 V1 hardening — full RLS audit, p95 perf, pen-test, SOC2 readiness
- D-113 Custom views engine, D-120 Persona Creator, D-121 Cmd+K NL, D-122 Cross-workspace reassign

**Net:** v2 demo lights up every surface. v3 makes them load-bearing.

---

## 2. v3 Phases & Sequence

Total v3 horizon: **~7 weeks** at v2 velocity (~1.5 dirs/week, accounting for production-grade coverage swing back to 80/90).

| Week | Phase | Directives | Focus |
|---|---|---|---|
| 1 | A — Auth & security | D-300 (real TOTP MFA + recovery codes) | Sensitive routes actually gated |
| 2 | A | D-301 (multi-instance rate-limit on Vercel KV) | Login holds under prod load |
| 2–3 | A | D-302 (RLS audit suite + force-sign-out on suspend) | Boundary verifiably tight |
| 3–4 | B — Billing + delivery + obs | D-310 (Stripe billing — Subscriptions API + webhook receiver) | Charge customers |
| 4 | B | D-311 (webhook delivery worker — Inngest job + retries + signature) | Real outbound HTTP |
| 4–5 | B | D-312 (api_audit_log retention prune + time-series analytics) | Ops survives 90+ days |
| 5–6 | C — Real-estate daily-use | D-320 (catalog editing — D-223 read-only → editable) | Reps work the catalog daily |
| 6 | C | D-321 (Deal canvas — mirrors lead canvas) | Sales motion has its primary surface |
| 6–7 | C | D-322 (Follow-up Agent T2 + approval queue) | One agent that pays for itself |
| 7 | D — V3.0 sign-off | D-330 (V1 hardening sweep — pen-test prep, p95, SOC2 checklist) | Ship readiness |

**Sequencing principle:** harden auth/billing first (everything else depends on a tight boundary), then delivery + observability (so we can support customers), then real-estate completeness (the daily-driver layer), then sign-off (verifies the rest).

**Branching rule:**
- v3 directives → `v3` branch (one directive per PR, mirroring v2 cadence).
- Cut `v3` from `v2` tip immediately. Rebase onto `main` after [apps#41](https://github.com/builtrixlabs/AI_CRM/pull/41) merges.
- `v3 → main` merge happens at `v3.0` tag (~Week 7). Tag `v3.0-merged` after merge.

---

## 3. Phase A — Auth & Security Hardening (Weeks 1–3)

The thinnest layer that customers test on day one. Every gap here is a known stub from v2.

### D-300 — Real TOTP MFA + recovery codes

**Replaces:** v2 click-stub at `/auth/mfa` (D-209).
**Scope:**
- TOTP enrollment flow at `/auth/mfa/setup` — generate secret, render QR (`otpauth://`), verify code, store hashed secret on `profiles`.
- Verify flow at `/auth/mfa` — accept 6-digit code, bump `mfa_verified_at`, redirect to `?return=`.
- Recovery codes — generate 10 single-use codes at enrollment, hashed in DB, downloadable once.
- `MFA_DEMO_MODE` env + `demo_mode` platform flag bypass remains (so v2's demo runbook keeps working).
- Hard redirect on stale MFA for `/platform/*`, `/admin/billing`, `/admin/integrations/*`, `/settings/users`, `/settings/roles` (replaces v2's advisory-banner-only behavior).

**Tests:**
- TOTP secret hashing roundtrip; clock-skew window (±30s); recovery-code single-use; redirect on stale MFA happy + edge cases.
- Coverage 80/90.

**Migration:** additive — new `profiles.mfa_secret_hash`, `profiles.mfa_recovery_codes_hash` (jsonb).

### D-301 — Multi-instance rate-limit (Vercel KV)

**Replaces:** v2 in-memory token bucket at `/api/auth/rate-check` (D-210).
**Scope:**
- Vercel KV-backed sliding-window limiter at `src/lib/auth/rate-limit.ts` — preserves API surface so existing call sites don't change.
- `RATE_LIMIT_BACKEND` env (`"kv" | "memory"`); auto-detects KV by presence of `KV_REST_API_URL`.
- Per-IP **and** per-account limits (5/min/IP, 20/hour/account email).
- Apply same primitive to `/api/admin/leads/lookup` (currently un-rate-limited).
- Documented fallback to memory when KV is absent (dev only).

**Tests:**
- KV-backed sliding window correctness (mock KV); per-account limit fires before per-IP on common credential-stuffing pattern; hot-path latency < 5ms p95.
- Coverage 80/90.

**Infra:** new env vars `KV_REST_API_URL`, `KV_REST_API_TOKEN` on Vercel `Production` + `Preview (v3)`.

### D-302 — RLS audit suite + force-sign-out on suspend

**Replaces:** D-203's "DB-only" suspend (no session block) and the missing slice of D-125.
**Scope:**
- Programmatic RLS audit at `tests/integration/rls-audit.spec.ts` — enumerates every public table, cross-org probe with two test orgs, asserts deny.
- 5 highest-risk tables get pinpoint negative tests (`nodes`, `edges`, `node_signals`, `api_audit_log`, `org_integration_secrets`).
- Force-sign-out on `subscriptions.status = 'suspended'`: middleware checks org status, terminates session via `supabase.auth.admin.signOut(user_id)` + `revoked_at` audit row.
- Reactivation re-issues sessions on next login (no automatic revival of revoked tokens).

**Tests:**
- RLS suite must show 0 leaks across all enumerated tables; suspend → next request 401; reactivate → next login 200.
- Coverage on touched files 80/90.

**Migration:** additive — `org_session_revocations` (org_id, revoked_at, reason).

---

## 4. Phase B — Billing + Delivery + Observability (Weeks 3–5)

Three things that turn the system from "demo" into "operatable for 90 days".

### D-310 — Stripe billing integration

**Replaces:** v2's hardcoded `PLAN_TIERS` constants and stub plan-change dialogs (D-203).
**Scope:**
- Stripe Subscriptions API wired: org-admin "Upgrade plan" on `/admin/billing` triggers Stripe Checkout; super-admin "Change plan" on `/platform/subscriptions/[id]` calls `subscriptions.update`.
- Webhook receiver at `/api/stripe/webhook` — handles `customer.subscription.{created,updated,deleted}`, `invoice.{paid,payment_failed}`. Idempotent on Stripe `event.id`.
- Plan-tier source-of-truth migrates from `src/lib/platform/plan-tiers.ts` constants → `subscription_plans` DB table seeded with current 4 tiers.
- Org-admin billing portal link via Stripe Billing Portal session.
- 30-day grace on failed payment before suspension.

**Tests:**
- Stripe webhook signature verification; replay protection (event-id idempotency); Checkout session creation per plan; subscription update flows correctly to DB; payment-failed → grace-period flag.
- Coverage 80/90.

**Migration:** additive — `subscription_plans` table; `subscriptions.stripe_customer_id`, `subscriptions.stripe_subscription_id`, `subscriptions.grace_period_until` columns.

**Infra:** Stripe `SECRET_KEY`, `WEBHOOK_SECRET`, `PUBLISHABLE_KEY` env on Production + Preview (v3).

### D-311 — Webhook delivery worker

**Replaces:** v2 stub that writes `status=200` rows without actual HTTP (D-208).
**Scope:**
- Inngest function `webhooks.deliver` — consumes `webhook_deliveries.status = 'pending'` rows, signs with `webhook_endpoints.secret`, POSTs with 5s timeout.
- Retry policy: exponential backoff at 1m, 5m, 30m, 2h, 12h (5 attempts). Final failure marks endpoint `disabled=true` after 10 consecutive failures.
- Signature header `x-builtrix-signature: sha256=<hex>` over raw body.
- Delivery log captures: attempt #, status code, latency, response body (truncated 4KB), error message.
- Org-admin can "Resend" a failed delivery from `/admin/webhooks`.

**Tests:**
- Signature roundtrip; retry schedule respects backoff; 5xx triggers retry, 4xx does not (configurable); endpoint auto-disable; resend creates a fresh delivery row.
- Coverage 80/90.

**Migration:** additive — `webhook_endpoints.disabled_at`, `webhook_deliveries.attempt_number`, `webhook_deliveries.next_retry_at` columns.

### D-312 — API audit retention + time-series analytics

**Replaces:** missing prune from D-204 + missing time-series from D-205.
**Scope:**
- Inngest cron `audit.prune` runs daily at 03:00 UTC: drops `api_audit_log` rows older than 90 days, `event_inbox_log` older than 30 days, `webhook_deliveries` older than 60 days. Configurable per-org via `platform_flags.retention_days_*` overrides.
- `/platform/analytics` gains a 30/60/90-day time-series view for the existing 4 KPIs (lead-to-booking conversion, site-visit cadence, Voice IQ adoption, plan-tier mix).
- CSV export button on each KPI card.
- Per-route cost categorization on `/platform/costs` — group by inbox vs lookup vs other.

**Tests:**
- Prune respects per-org overrides; respects min-row safety floor (never drops if < 100 rows total); time-series query p95 < 500ms with 90 days × 100 orgs of synthetic data.
- Coverage 80/90.

**Migration:** additive — `platform_flags` rows for retention defaults; no schema changes.

---

## 5. Phase C — Real-Estate Daily-Use Completeness (Weeks 5–7)

The layer where reps actually live. Every gap here is a "they'll notice on day three" issue.

### D-320 — Catalog editing

**Replaces:** v2 read-only browser (D-223).
**Scope:**
- `/admin/catalog/[id]/units/[unitId]/edit` — edit unit attributes (status, price, configuration, floor, carpet area).
- `/admin/catalog/[id]/edit` — edit property attributes (name, address, RERA #, completion %, brochure URL).
- Permission `catalog.edit` (already in RBAC; just expose in UI).
- Audit-logged on every save with diff of changed columns.
- Optimistic-locking via `updated_at` to prevent stale-write clobber.
- Unit status transitions enforced: `available → held → booked → sold` (one-way). Override requires `catalog.admin_override` perm.

**Tests:**
- Save persists; stale-write detected and rejected; permission check rejects sales_rep without `catalog.edit`; status-transition rules enforced.
- Coverage 80/90.

**Non-goals (deferred to V3.x):**
- Bulk import (CSV / RERA registry fetch).
- Channel-partner-visible catalog view.
- Lead-to-unit matching surface.

### D-321 — Deal canvas

**Replaces:** missing surface from D-110.
**Scope:**
- `/dashboard/deals/[id]` mirroring lead canvas (D-006) — same React-Flow + side-panel pattern.
- Deal node graph: deal ←→ leads, deal ←→ units, deal ←→ activities.
- Side panel: stage timeline (qualified → site_visit_scheduled → site_visit_done → negotiation → booked), deal value, expected close date, owner.
- "Promote lead to deal" action on lead canvas (creates deal node + edge, copies stage).
- D-021 dashboard widget reads booking-pipeline funnel from deal stages (already shipped via D-224, no change).

**Tests:**
- Promote-lead-to-deal idempotency; stage-transition audit trail; canvas renders 100 deals < 1.5s.
- Coverage 80/90.

**Non-goals (deferred to V3.x):**
- Property and Unit canvases (D-110 — Deal alone is MVP).
- Multi-lead → single-deal merge.
- Cross-workspace deal reassignment (D-122).

### D-322 — Follow-up Agent T2 + approval queue

**Replaces:** missing D-115. Single MVP agent that demonstrates the agent-tier model.
**Scope:**
- Agent definition seeded: tier T2 (suggests; queues for approval), prompt templated for "draft a follow-up message for this lead" using existing D-009 model gateway.
- Trigger: lead has `last_contact_at` > 7 days AND status in (`new`, `contacted`).
- Output drafts land in `agent_approval_queue` with `lead_id`, `draft_body`, `channel='whatsapp' | 'email'`, `created_by_agent`.
- Org-admin approval queue UI at `/admin/agents/queue` — approve (sends via existing channel) / edit-and-approve / reject.
- Audit trail: every approval / rejection logs reason.
- Token-budget honored — agent run skipped if org over `monthly_token_budget`.

**Tests:**
- Trigger-window correctness; queue dedupe (one pending draft per lead); approval sends through correct channel; budget cap halts new drafts.
- Coverage 80/90.

**Non-goals (deferred to V3.x):**
- T3 agents (autonomous send, no approval).
- Multi-agent orchestration.
- Stale-lead Watcher Agent (D-123).

---

## 6. Phase D — V3.0 Sign-Off Sweep (Week 7)

### D-330 — V1 hardening + ship-readiness

**Replaces:** the deferred D-125 from the V1 plan.
**Scope:**
- **Pen-test prep:** OWASP top-10 checklist scored against the codebase; threat model written to `docs/security/threat-model.md`; auth-flow diagram.
- **p95 perf checks:** Playwright `@perf` suite — `/admin` cockpit, `/dashboard/leads/[id]`, `/admin/catalog/[id]`, `/admin/dashboards/[id]` each loaded under 100/500/1000 row scenarios. p95 < 1.5s.
- **Cross-product event load test:** seed 100k events across 90 days, verify Voice IQ inbox + WhatsApp + lead enrichment dispatchers stay < 2s p95.
- **Full RLS audit pt 2:** extend D-302's audit to non-public schemas, materialized views, RPC functions.
- **SOC2 readiness checklist:** document control evidence locations (audit log paths, encryption-at-rest, access-review cadence, incident runbook).
- Pen-test itself is operator-led work (external vendor); this directive ships the **prep package** the vendor needs.

**Tests:**
- Perf suite green; load-test green; RLS audit pt 2 shows 0 leaks; checklists committed under `docs/security/`.
- Coverage on new code 80/90 (the directive is mostly tests + docs, so most lines are themselves test code).

**Non-goals:**
- Actual third-party pen-test execution (operator-led, post-v3.0-tag).
- SOC2 certification (operator-led, multi-month engagement post-MVP).

---

## 7. What This Plan Skips (and why)

| Item | Why skipped on v3 MVP |
|---|---|
| D-110 Property + Unit canvases | Deal canvas alone is enough for MVP sales motion; property/unit graph view is V3.x |
| D-113 Custom views engine | Power-user feature; not MVP-blocking |
| D-117 CP commission tracking + multi-stage approval | CP portal stub (v2) is enough for the lead-submission story; commission flows are V3.x |
| D-118 Legal Auditor / D-119 MIH event buses | New product surfaces; V3.x or later |
| D-120 Persona Creator V1 | UX-personalization layer; not MVP-blocking |
| D-121 Cmd+K free-form NL | Power-user UX; not MVP-blocking |
| D-122 Cross-workspace reassign | Edge-case workflow; V3.x |
| D-123 Stale-lead Watcher Agent (T0) | Follow-up Agent (D-322) is the MVP agent; second agent is V3.x |
| D-124 Plan-tier LLM budget defaults | Per-org cap exists from D-009; plan-tier defaults matter at 5+ orgs (post-MVP) |
| D-133 Voice IQ producer-side `builtrix.service.js` | Voice IQ team owns; we consume via API |
| Real photo/imagery upload for catalog | Storage flow exists; UI polish is V3.x |
| `demo:reset` cleanup script | Operator can hard-delete via `/platform/organizations/[id]`; not MVP-blocking |
| Per-org override of platform flags | D-207 supports global flags; per-org overrides at scale (post-MVP) |
| Stripe usage-based / metered billing | Subscription plans only for MVP; metered billing V3.x |
| Email integration health (D-202) | System-health page renders `false` for email until D-322's email channel is wired — accept as known gap, not blocking |

---

## 8. Coverage / Quality Targets (v3 MVP — production-grade)

**Swing back to V5-spec defaults.**

| Gate | v2 (demo) | v3 (MVP) |
|---|---|---|
| Coverage lines | ≥ 70% | **≥ 80%** |
| Coverage branches | ≥ 80% | **≥ 90%** |
| Acceptance test pass | 100% | **100%** |
| Playwright @smoke | 100% | **100%** |
| Playwright @regression | best-effort | **100%** |
| Playwright @perf (new) | n/a | **p95 < 1.5s on 4 hot routes** |
| Security CRITICAL | 0 | **0 (auto-fix loop max 3)** |
| Security HIGH | logged | **0 by `v3.0` tag (parallel-fix during phases)** |
| RLS audit | spot-check 5 tables | **enumerative — every public table** |
| Pen-test | not required | **prep package shipped (vendor execution operator-led, post-tag)** |

The gate config lives in `policy/v3-quality-targets.json` (new — needs Plan-Mode review at first v3 directive).

---

## 9. Risk Register (v3-specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Stripe webhook receiver becomes a flaky integration tarpit | Medium | High | Strict idempotency on `event.id`; test against Stripe CLI's local-replay; defer non-critical event types until post-MVP. |
| R2 | Vercel KV cold-start latency makes rate-limit a bottleneck | Low | Medium | Pre-warm via `/api/health` ping in middleware; fall back to memory above 50ms p95 (logged, alerted). |
| R3 | Real TOTP MFA breaks the operator's own demo login | Medium | High | `MFA_DEMO_MODE=true` env preserved from D-209; default off in v3 prod; documented in [docs/runbooks/demo-mode.md](../runbooks/demo-mode.md) (new). |
| R4 | RLS audit (D-302) finds a real leak that blocks Phase B start | Low | High | Audit runs first thing in Phase A; any leak gets parallel-fixed before D-310 starts. |
| R5 | Catalog editing (D-320) optimistic-locking is too aggressive — UX feels broken | Medium | Medium | 5s threshold on `updated_at` skew; manual-merge dialog instead of hard-reject above threshold. |
| R6 | Deal canvas (D-321) reuses lead-canvas code that's brittle under deal-graph density | Medium | Medium | Load-test at D-321 acceptance with 100/500/1000 deal-edge scenarios; spike-fix or scope-cut node count cap to 200 if needed. |
| R7 | Follow-up Agent (D-322) generates spammy drafts that erode operator trust | High | High | T2 tier means **every** draft is queued for approval — never sends without human green-light. Token budget caps protect cost. Approval-queue UI shows draft + reason for trigger (transparency). |
| R8 | Pen-test prep (D-330) reveals an issue that blocks v3.0 tag | Medium | High | Prep is internal — if a finding emerges, it's a directive in itself (D-331+) before tag. v3.0 tag is conditional on 0 CRITICAL/HIGH from prep. |
| R9 | v2→main merge ([apps#41](https://github.com/builtrixlabs/AI_CRM/pull/41)) hasn't landed when v3 Phase A starts | High | Low | v3 cuts from `v2` tip until merge lands; rebase onto `main` post-merge. Documented in §0 + §2. |
| R10 | Operator capacity — pen-test vendor engagement + onboarding first paying customer at the same time | Medium | High | Plan a 2-week buffer between `v3.0` tag and first paying onboard; pen-test runs in parallel during that buffer. |

---

## 10. Operational Loop (per directive)

Same V5 framework loop:

1. Operator: paste ready-to-paste prompt → Claude Code.
2. Claude: drafts plan → Plan Mode (Gate 2).
3. Operator: approve / edit / reject. **MVP-lens enforcement happens here** — does this directive serve "shipping a paying customer", or is it scope creep?
4. Claude: executes Gates 3–5 (TDD + scan + deploy preview), bypass-permissions on. **Coverage gate is 80/90 — auto-gen-and-retry once if short.**
5. Green on `v3` → next directive.

**Branching rule (memory: this plan §0):**
- v3 directives (D-300..D-330) → `v3` branch.
- `v3 → main` merge happens at `v3.0` tag (~Week 7). Tag `v3.0-merged` after merge.

**Hard rules:**
- One directive at a time. No parallel branches.
- Each directive lands GREEN on `v3` before next starts.
- **MVP-lens is a hard scope rail** — if a directive grows toward "nice-to-have" territory, split or defer.
- Phase A directives **must** ship before Phase B starts (auth boundary precedes anything that depends on it).

---

## 11. Success Metrics — `v3.0` Tag

| Metric | Target |
|---|---|
| Real TOTP MFA enforced on all sensitive routes | YES |
| Vercel KV-backed rate-limit verified under multi-instance load | YES |
| RLS audit shows 0 cross-org leaks | YES |
| Stripe Checkout → subscription created → org plan tier updated end-to-end | YES |
| Outbound webhook delivery POSTs to a real endpoint with retries verified | YES |
| `api_audit_log` retention prune cron green for 7 consecutive days | YES |
| Sales rep can edit a unit's status / price / configuration from `/admin/catalog` | YES |
| Deal canvas renders, "promote lead to deal" round-trips | YES |
| Follow-up Agent T2 drafts land in approval queue, approved drafts send | YES |
| Pen-test prep package committed under `docs/security/` | YES |
| All v2 surfaces still work (no regressions) | YES |
| Coverage 80/90 across the v3 changeset | YES |
| `v3.0` tag on `v3` branch tip after green acceptance run | YES |
| `v3.0-merged` tag on `main` after `v3 → main` merge | YES |
| **First paying customer signed (post-tag, operator-led)** | ≥ 1 (stretch ≥ 3) |

---

## 12. Open Questions

1. **Stripe entity:** which Stripe account (sandbox vs live) does v3 wire against during Phase B? Can we use Stripe sandbox for dev/preview and live for production from day one?
2. **MFA recovery:** if a user loses both their TOTP device and their recovery codes, what's the unblock path? Org-admin reset via `/settings/users` (audit-logged) or platform-admin only?
3. **Plan tier migration:** do we keep the 4 v2 tiers as-is, or does the move to Stripe-managed plans give us a chance to renumber/rename (e.g. real-estate-specific tier names)?
4. **Webhook delivery — Inngest vs alternative:** the codebase uses Inngest for D-202 system-health Inngest jobs. Is Inngest the right home for D-311's worker, or do we want a more lightweight queue (e.g. Supabase pg_cron + a simple consumer)?
5. **Follow-up Agent — channel:** WhatsApp-first or email-first for the MVP agent? Channel selection logic vs. "always WhatsApp if number present, else email"?
6. **v3.0 cadence:** 7 weeks at v2 velocity. If we land 2 directives per week (vs ~1.5), we hit `v3.0` in 5 weeks. Aspirational target?
7. **Pen-test vendor:** named vendor + budget approved before D-330 starts, or D-330 ships the prep package and vendor selection happens in parallel?

---

*End of plan v3.0 draft. First action: confirm scope. Then I generate the D-300 ready-to-paste prompt to start Phase A.*
