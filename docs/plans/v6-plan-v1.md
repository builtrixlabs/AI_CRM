# V6 Build Plan v1 — execution order + dependency graph

**Source PRD:** [docs/PRD-v6.0.md](../PRD-v6.0.md)
**Binding implementation order:** [docs/plans/v6-implementation-order.md](./v6-implementation-order.md)
**Status doc:** [docs/V6_STATUS.md](../V6_STATUS.md)
**Branch:** `v6` (cut from `v5@a6e5f44` on 2026-05-14)
**Date:** 2026-05-14

> This plan **operationalizes** [`v6-implementation-order.md`](./v6-implementation-order.md) — it does not override it. The implementation-order document is the **binding authority** for phase order, directive sequencing, action codes, and the Phase-0 removal checklist (operator instruction, 2026-05-14). Where this plan and the implementation order disagree, the implementation order wins. This plan does **not** replace per-directive Plan Mode (Gate 2 of `scripts/v5/build.sh`); it sequences which directive enters Plan Mode next.

---

## 1. Execution principle

**Phase-gated, removal-first.** V6 runs in six phases (0–5). Each phase has a go/no-go acceptance gate (PRD §5 / implementation-order §4). A phase does not start until the prior phase's gate is green.

- **Phase 0 is removal work.** Get to a clean, buildable, V6-shaped baseline before any feature work. No new feature directive ships until Gate 0 is green (except D-613, which is a Phase-0 sidebar swap).
- **Phase 1 unblocks the core loop.** D-603 (wire adapters) is the single biggest gap — it ships first within Phase 1. Without it, V6 is mockware.
- **Phase 2 is the two flagship agents.** Brochure Agent (D-600) + Site Visit Booking Agent (D-601), plus their supporting directives.
- **Phases 3–4 are manager UX + polish.** Phase 5 is GA hardening.

**Within a phase, follow the implementation-order step numbers.** Phase 1 is 1.1 → 1.7, Phase 2 is 2.1 → 2.6, etc. Those step numbers encode the dependency order; do not resequence them.

---

## 2. Phase-by-phase execution order

The authoritative tables live in [`v6-implementation-order.md` §4](./v6-implementation-order.md). Summary:

### Phase 0 — Stabilization (Week 0–1)

Removal + cleanup. Procedure: [`docs/runbooks/v6-stabilization-removals.md`](../runbooks/v6-stabilization-removals.md).

| Step | Action | Directive |
|---|---|---|
| 0.1 | Drop catalog UI + unreferenced tables | D-223 / D-320 REMOVE |
| 0.2 | Drop inventory UI + tables + RPC + cron | D-420 REMOVE |
| 0.3 | Drop booking pipeline UI (keep tables) | D-224 REMOVE / D-421 DORMANT |
| 0.4 | Unmount CP routes (keep tables) | D-221 DORMANT |
| 0.5 | Drop PSCRM + Legal Auditor sister-product hooks | D-442 / D-443 REPACKAGE |
| 0.6 | Drop source-specific connector backlog from docs | D-117 DEFER |
| 0.7 | Fix broken links (`/admin/support/new`, `/dashboard/site-visits`) | — |
| 0.8 | Rename "Directives" → "AI Workflows" (UI only) | D-017 REPACKAGE |
| 0.9 | Swap sidebar "Voice IQ" → "App Access" | **D-613** |
| 0.10 | Update demo seeder to V6 scope | D-225 REPACKAGE |

**Gate 0:** App builds clean. Zero references to dropped features. All existing tests pass minus the removed ~150. Demo seed produces a V6-shaped org.

### Phase 1 — Core comms + lead intake (Week 1–3)

| Step | Directive | Slug |
|---|---|---|
| 1.1 | **D-603** Wire integration adapters into agent dispatch | `directives/603-wire-integration-adapters.md` |
| 1.2 | **D-604** MIH inbound API | `directives/604-mih-inbound-api.md` |
| 1.3 | **D-610** Pre-sales Auto-Allocation Engine | `directives/610-presales-auto-allocation.md` |
| 1.4 | **D-608** Project ↔ Sales-Person Mapping | `directives/608-project-sales-mapping.md` |
| 1.5 | **D-602** Site Visit Module | `directives/602-site-visit-module.md` |
| 1.6 | **D-605** Command Center home — real data | `directives/605-command-center-real-data.md` |
| 1.7 | **D-617** Cmd+K shortcut completion | `directives/617-cmdk-shortcut-completion.md` |

**Gate 1:** PRD §5 / implementation-order §4 Phase 1 acceptance — real outbound message leaves the system; MIH POST → lead created → auto-allocated → on rep dashboard within 5s; Site Visit tab loads; Command Center shows real KPIs.

### Phase 2 — AI-native behaviors (Week 3–6)

| Step | Directive | Slug |
|---|---|---|
| 2.1 | **D-607** Brochure Repository | `directives/607-brochure-repository.md` |
| 2.2 | **D-600** Brochure Agent | `directives/600-brochure-agent.md` |
| 2.3 | **D-609** Click-to-call on canvas | `directives/609-click-to-call-canvas.md` |
| 2.4 | **D-601** Site Visit Booking Agent | `directives/601-site-visit-booking-agent.md` |
| 2.5 | **D-614** Predefined Message Templates | `directives/614-predefined-message-templates.md` |
| 2.6 | **D-615** AI Agent Approval Workflow | `directives/615-ai-agent-approval-workflow.md` |

**Gate 2:** Brochure loop + Site Visit loop work end-to-end; manager-authored workflow → org-admin approval → live.

### Phase 3 — Manager + org admin UX (Week 6–9)

| Step | Directive | Slug |
|---|---|---|
| 3.1 | **D-611** AI Workflow Builder (N8N-style) | `directives/611-ai-workflow-builder.md` |
| 3.2 | **D-612** Team-Scoped Dashboards | `directives/612-team-scoped-dashboards.md` |
| 3.3 | **D-616** Customer Recovery Team | `directives/616-customer-recovery-team.md` |
| 3.4 | **D-606** Super Admin V6 capabilities | `directives/606-super-admin-v6.md` |

**Gate 3:** Workflow builder drag-drop-test-publish works; team dashboard publishes scoped; super-admin impersonation audit-trailed.

### Phase 4 — Polish (Week 9–11)

| Step | Directive | Slug |
|---|---|---|
| 4.1 | **D-618** Realtime updates across lists | `directives/618-realtime-updates.md` |
| 4.2 | **D-619** Notifications system | `directives/619-notifications-system.md` |
| 4.3 | **D-620** Unified contact timeline | `directives/620-unified-contact-timeline.md` |
| 4.4 | **D-621** Mobile-responsive admin + dashboard | `directives/621-mobile-responsive.md` |

**Gate 4:** Pilot-ready. First builder onboarded.

### Phase 5 — GA hardening (Week 11–12)

RLS audit re-run, `rls-audit.test.ts` extended to V6 tables, `v6-acceptance.spec.ts`, pen-test cycle, tag `v6.0`, first pilot via `scripts/seed-pilot-org.sh`.

**Gate 5:** Pen-test pass + RLS audit 100% + first pilot signed off → V6.0 GA.

---

## 3. Directive numbering convention — LOCKED

The implementation-order document (§3, §9) already assigns every V6 directive its number. **No operator decision is open here** (unlike V4, where numbering was an open question — see `v4-plan-v1.md` §7).

- Convention: `D-NNN` → `directives/NNN-<slug>.md` (3-digit prefix, the existing repo convention; range 001 → 501 in use, V6 occupies 600 → 621).
- Slugs are fixed by §2 above. `directives/600-brochure-agent.md` and `directives/621-mobile-responsive.md` are named explicitly in implementation-order §9; the rest follow the same kebab-case-of-title rule.
- Each directive file is authored **when that directive enters Plan Mode** (Gate 1 of `scripts/v5/build.sh`), not upfront. This commit lays the foundation docs only; the 22 `directives/6NN-*.md` files are created per-directive.

---

## 4. Operator decisions — RESOLVED (no open questions)

The implementation-order document §10 lists six operator decisions and a **Default** for each. Per operator instruction (2026-05-14), each Default is the **locked V6 decision** — the agent does not re-solicit these. Per-directive Plan Mode proceeds on these values.

| § | Decision | Locked value | Affects |
|---|---|---|---|
| 10.1 | Cab booking provider | **Manual entry** (operator enters driver/vehicle/phone). Uber/Ola API deferred to V6.x. | D-601 |
| 10.2 | Brochure storage | **Supabase Storage**. | D-607 |
| 10.3 | WhatsApp BSP for templated outbound | **Both Gupshup + Cloud API adapters real**; per-org choice at config time. | D-603 |
| 10.4 | AI workflow builder library | **React Flow (reactflow.dev)** for the DAG visual. | D-611 |
| 10.5 | MIH inbound auth | **Bearer token via D-440 sister-product token**. No mTLS for V6. | D-604 |
| 10.6 | Team-dashboard publishing model | **Copy layout JSON; team members read-only**; manager edits create a new revision. | D-612 |

Contrast with `v4-plan-v1.md` §11 ("Open questions before Phase A starts"): V6 has **no** equivalent blocking-questions section. The implementation-order document is complete and binding; Phase 0 starts immediately on operator "go".

---

## 5. New baselines

Hooks block writes to `baseline/**`. During the V6 horizon, baselines live under `docs/baselines/` (the V4/V5 convention — see baseline 121's status note) and promote to `baseline/NNN-*` when V6 reaches `main`.

| Baseline | Blocks | Status |
|---|---|---|
| [`docs/baselines/122-mih-inbound-contract.md`](../baselines/122-mih-inbound-contract.md) | D-604 | **PROVISIONAL — lands with this commit.** Freezes the `POST /api/sister/v1/leads` request/response/dedup/rate-limit/provenance contract. Required by PRD §7 risk #4 before D-604 starts. |

No other new baselines are required for V6 — every other directive builds on contracts already frozen in baselines 116/117/121 or needs no external-contract freeze.

---

## 6. Per-directive Plan Mode protocol

For each directive, in the phase order of §2: invoke the `feature-builder` agent with prose intent (e.g., "Build feature: D-603 wire integration adapters into agent dispatch"). The agent will:

1. **Gate 1** — author `directives/<NNN>-<slug>.md` via the `directive-from-prompt` skill, reading the matching PRD §4 entry from `docs/PRD-v6.0.md`.
2. **Gate 2** — generate spec + plan + tasks + coverage targets; **surface Plan Mode for operator approve / edit / reject**.
3. **Gates 3–5** — TDD execution → verification + security scan → branch + push + preview URL (auto, bypass-permissions).
4. **Gate 6** — watchdog armed post-merge.

V6 directives follow the **10-gate STOPPING CRITERIA** in `CLAUDE.md` (built → tested → typechecked → migrations applied → pushed → Vercel green → UI verified → PR merged → post-merge build green → status logged in `V6_STATUS.md`). Substitute `v6` everywhere `CLAUDE.md` says `v4`.

If a directive's Plan Mode reveals a missing dependency (e.g., D-600 entered before D-607 ships), reject and reschedule to respect the §2 order — do **not** resequence the phase.

---

## 7. What does NOT change from v5

- All V0–V5 KEEP directives stay live (implementation-order §2): multi-tenancy, graph model, RBAC engine, canvas, lead lifecycle, model gateway, WhatsApp inbound, call audit bus, MFA, RLS audit, Stripe billing, webhook delivery, audit retention, the live comms adapters (D-432/433/434/435), integrations health (D-439), sister-product tokens (D-440), V3.x defensive items.
- The live comms adapters are **REWIRE**, not rebuild — D-603 invokes the existing D-432/433/434/435 adapters; it does not replace them.
- Constitution v2.0 remains binding for multi-tenancy, RBAC base, schema patterns, audit, RLS (PRD §1, §6).
- `memory/per_org_integration_model.md` is unchanged — provider creds stay per-org, configured by `org_admin` in-app.
- Branch/merge model: `v6` is the horizon branch; per-phase `v6-phase-N` branches; per-directive `feature/<NNN>-<slug>` branches; `watchdog/v6-postmerge` lands with the first V6 merge (implementation-order §12).

---

## 8. Memory + docs landed alongside this plan

This commit (`docs(v6): V6 planning baseline`) lands, on the `v6` branch:

- `docs/PRD-v6.0.md` — Document 2 (the PRD), verbatim.
- `docs/plans/v6-implementation-order.md` — Document 1 (binding authority), verbatim.
- `docs/plans/v6-plan-v1.md` — this document.
- `docs/V6_STATUS.md` — implementation tracker, all 22 D-600 directives `planned`.
- `docs/baselines/122-mih-inbound-contract.md` — MIH inbound contract baseline (PROVISIONAL).
- `docs/runbooks/v6-stabilization-removals.md` — Phase 0 removal procedure.
- `docs/runbooks/v6-pilot-onboarding.md` — V6 pilot flow.
- `docs/PRD-v3.0.md` — archive banner added (retained as V0–V5 source of truth).

Operator auto-memory (outside the branch commit):

- `memory/v6_branching.md` — V6 scope locked; `v6` cut from `v5@a6e5f44` on 2026-05-14; implementation-order document is binding for sequencing.
- `memory/MEMORY.md` — index line added for V6 branching.

---

## 9. Next action

Phase 0 (stabilization) is cleared to start on operator "go". The first unit of work is the removal sequence in [`docs/runbooks/v6-stabilization-removals.md`](../runbooks/v6-stabilization-removals.md), steps 0.1 → 0.10, each as its own commit on a `v6-stabilization` branch cut from `v6`. Gate 0 closes Phase 0; Phase 1 (D-603 first) follows.
