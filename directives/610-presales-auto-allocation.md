# Directive 610 — Pre-sales Auto-Allocation Engine

**Kind:** feature (V6 Phase 1, step 1.3 — routes incoming MIH leads to presales reps)
**Status:** AUTHORIZED — operator cleared Phase 1 to run end-to-end 2026-05-14 ("implement all these features without stopping … completing phase 1").
**Branch target:** `v6-phase-1`
**Generated:** 2026-05-14T13:10:00Z
**Source:** `docs/PRD-v6.0.md` §D-610 (lines 674-731); `docs/plans/v6-implementation-order.md` §4 step 1.3.
**Builds on:** D-604 (the `lead.created` Inngest event D-610 subscribes to), D-001 (`teams` table), D-018 (`profiles`), D-009 (the `lead.created` event-function pattern), D-007 (lead lifecycle), D-608 (the `profiles.on_leave` flag + the org-RLS-app-permission pattern).

---

## Problem

D-604 ingests MIH leads and emits `lead.created`. Nothing routes those leads to a presales rep — they sit unassigned. D-610 builds the engine: a manager configures priority-ordered allocation rules; when `lead.created` fires, the engine evaluates rules in priority order, picks the first match, resolves a target rep (direct, round-robin, or first-available within a team), assigns the lead, and audit-logs the decision.

D-610 ships:

1. **Migration** `20260514160000_presales_allocation.sql` — three tables: `lead_allocation_rules`, `lead_allocation_state` (round-robin cursor), and `team_members` (no team-membership model exists yet — D-001 shipped `teams` but not membership). All org-scoped + RLS.
2. **Allocation writes via a raw node update** — `leadSchema` is `.strict()` and rejects the richer `data` shape D-604 / D-417 raw-insert for externally-ingested leads (free-string `source`, `source_channel`, `preference`, …), so `updateNodeData` — which re-validates the merged `data` against `leadSchema` — throws on a MIH lead. `allocateLead` therefore raw-updates `nodes.data` directly and writes its own `audit_log` row, the same external-lead exception D-604 / D-417 already use. `leadSchema` is left untouched.
3. **Allocation engine** `src/lib/leads/allocation-engine.ts` — `matchRule(conditions, lead)`, `resolveTarget(rule, …)` (the three target kinds), and `allocateLead()` — the orchestrator: load lead → evaluate rules → resolve a rep → raw-update the lead node's `data.assigned_sales_rep_id` → audit row → round-robin cursor update. No match → lead stays unassigned + an `lead_allocation_unmatched` audit row.
4. **Admin lib** `src/lib/leads/allocation-admin.ts` — CRUD for rules, teams, and team members.
5. **Inngest function** `src/lib/inngest/functions/presales-allocation.ts` — `presalesAllocationOnLeadCreated`, triggered by `lead.created`, registered in `src/app/api/inngest/route.ts`. `concurrency: { limit: 1, key: 'event.data.organization_id' }` serializes allocation per org so the round-robin cursor is race-free.
6. **RBAC** — new permission `allocation_rules:manage` → `manager` + `org_admin`.
7. **UI** — `/admin/allocation-rules` (teams + members + rules manager) reached from a card on the `/admin` cockpit.

---

## Architecture decisions

- **`team_members` is a new table.** D-001 shipped `teams` but no membership model (no `team_members` table, no `team_id` on `profiles`). `team_round_robin` / `team_first_available` targets need to enumerate a team's members, so D-610 adds `team_members (team_id, profile_id, …)`, PK `(team_id, profile_id)`. The `/admin/allocation-rules` page also manages teams + membership — without that, the round-robin AC-1 cannot be exercised.
- **Per-org Inngest concurrency = race-free round-robin.** `presalesAllocationOnLeadCreated` sets `concurrency: { limit: 1, key: 'event.data.organization_id' }` — Inngest serializes allocation runs per org, so the `lead_allocation_state` cursor read-pick-write is never interleaved. AC-1's "3 leads → 3 different reps" holds without a DB advisory lock.
- **`allocateLead` raw-updates the lead node.** `leadSchema` is `.strict()` and rejects the `data` shape D-604 / D-417 raw-insert for externally-ingested leads, so `updateNodeData` — which re-validates the merged `data` against `leadSchema` — throws on a MIH lead. `allocateLead` therefore raw-updates `nodes.data` directly and writes its own `audit_log` row, exactly as `src/lib/sources/webform/api.ts` and D-604's `ingestMihLead` do. `leadSchema` is left untouched; `data.assigned_sales_rep_id` is the field D-602 / D-605 already read for "assigned rep".
- **Rule conditions are a closed JSONB shape.** `{ source?, source_channel?, budget_band_in?[], city_in?[], bhk_in?[] }`. A rule matches a lead when *every* specified condition matches the lead's `data` (`data.source`, `data.source_channel`, `data.preference.budget_band`, `data.preference.city`, `data.preference.bhk`). Empty `{}` is a catch-all. First matching rule by ascending `priority` wins.
- **Three target kinds.** `user` → `target_user_id` directly. `team_round_robin` → the team member after the `lead_allocation_state` cursor, skipping `on_leave` reps, cursor advanced. `team_first_available` → the first (stable id order) team member not `on_leave`. Any kind that resolves nobody (empty team / all on leave) → the rule is treated as non-matching and evaluation falls through to the next rule, then to unassigned.
- **RLS gates org isolation; the app gates the permission.** `manager` holds `allocation_rules:manage` but is not org-admin-tier, so — as in D-602 / D-608 — the three tables' RLS enforces `organization_id = app_org_id()` only; the permission is gated in the server actions.
- **The engine runs as `actor_type='system'`.** Allocation is an automated, rule-based system process (not an AI agent decision). Audit rows carry `actor_type='system'`, `actor_role='allocation_engine'` — within the `audit_log` CHECK (`user|agent|system`).

---

## Success criteria (production target 80/90)

- [ ] **AC-1** A `manager` creates a rule (e.g. `source_channel=paid_social` + `budget_band_in=['1.5-2Cr','2Cr+']` → `team_round_robin` on the senior team); three matching `lead.created` events each allocate to a *different* senior-team rep (round-robin), proven by `tests/integration/mih-to-presales.test.ts`.
- [ ] **AC-2** Every allocation writes an `audit_log` row — `action='lead_allocated'`, `diff: { rule_id, target_user_id, evaluated_at }` — `actor_type='system'`.
- [ ] **AC-3** A `lead.created` event for which no active rule matches leaves the lead's `assigned_sales_rep_id` unset and writes an `action='lead_allocation_unmatched'` audit row (the lead surfaces in the unassigned queue).
- [ ] **AC-4** Cross-tenant: org A's rules never evaluate against org B's leads — every engine query filters by the event's `organization_id`; proven by the integration test.
- [ ] **AC-5** A rule with `active=false` is skipped by the engine; toggling it back on resumes matching.
- [ ] **AC-6** `matchRule` matches when every specified condition matches and skips when any does not; an empty-conditions rule is a catch-all.
- [ ] **AC-7** `allocation_rules:manage` is in the literal `PERMISSIONS` catalog, held by `manager` + `org_admin`, and gates every D-610 server action + the `/admin/allocation-rules` page.
- [ ] **AC-8** `presalesAllocationOnLeadCreated` is registered in `src/app/api/inngest/route.ts` and subscribes to `lead.created` alongside D-009's enrichment function.
- [ ] **AC-9** Tests: `allocation-engine.test.ts` (the match matrix + round-robin + fallback), `presales-allocation.test.ts` (the Inngest handler), an RTL test for the manager component, `mih-to-presales.test.ts` integration. `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-10** All 10 V6 stopping-criteria gates pass. Migration `20260514160000_presales_allocation.sql` applies.

---

## Non-goals (deferred)

- **Skill-based / lead-score-aware routing** — PRD §D-610 out-of-scope; D-610 matches on source / channel / budget / city / bhk only.
- **Auto-reassignment when a rep goes on leave after allocation** — PRD §D-610 out-of-scope; `on_leave` is evaluated at allocation time, not retroactively.
- **A dedicated `/dashboard/leads/unassigned` route** — the PRD mentions it, but the D-413 custom-views system already lets a manager save an "unassigned" view; D-610 leaves leads with no `assigned_sales_rep_id` and does not build a bespoke route (a documented follow-up — extend the view filter catalog with a uuid `is_empty` operator).
- **Rich team management** — D-610's team UI is the minimum for allocation: create a team, add/remove members. Workspace assignment, team hierarchy, team leads — out of scope.
- **A visual condition builder** — the create-rule form takes plain inputs (source, channel, comma-separated lists); a drag-drop condition builder is not in scope.

---

## Stack

- **New:** `supabase/migrations/20260514160000_presales_allocation.sql`, `src/lib/leads/allocation-engine.ts`, `src/lib/leads/allocation-admin.ts`, `src/lib/inngest/functions/presales-allocation.ts`, `src/app/(admin)/admin/allocation-rules/page.tsx`, `src/app/(admin)/admin/allocation-rules/actions.ts`, `src/components/allocation/allocation-manager.tsx`, `scripts/verify_610.mjs`, plus tests.
- **Modified:** `src/lib/auth/rbac.ts` (`allocation_rules:manage`), `src/app/api/inngest/route.ts` (register the function), `src/app/(admin)/admin/page.tsx` (a cockpit card).
- **Reuses:** the D-009 `lead.created` Inngest-function pattern, the D-604/D-417 external-lead raw-update precedent, `getSupabaseAdmin`, the webhooks admin-page + server-action pattern, the org-RLS-app-permission migration pattern from D-602/D-608, the Inngest test pattern (`leadEnrichmentOnCreate.fn` + mocked `step`).
- **DB:** three new tables. No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-610** — the rule shape, the three target kinds, the round-robin state table, the `allocation_rules:manage` RBAC, and the audit contract are specified there.
- **Implementation-order §4 step 1.3** — "Routes incoming MIH leads to presales rep per manager rules."
- **Constitution II** — every engine + admin query filters by `organization_id`; the integration test proves org A's rules never touch org B's leads.
- **Constitution III** — provenance: an `audit_log` row on every allocation decision (matched *and* unmatched).
- **D-604 / baseline 122 §8** — D-604 emits `lead.created`; D-610 is the documented "→ D-610 allocation" subscriber.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260514160000_presales_allocation.sql`, then `node --env-file=<parent>/.env scripts/verify_610.mjs`.
- [ ] **Smoke**: at `/admin/allocation-rules` create a team, add two reps, create a `team_round_robin` rule; POST two MIH leads via D-604; confirm each lands on a different rep and an `audit_log` `lead_allocated` row exists.
- [ ] **Smoke the unmatched path**: POST a lead that matches no rule → it stays unassigned, with a `lead_allocation_unmatched` audit row.

---

## Risks & decisions

- **Round-robin correctness depends on the Inngest concurrency key.** `concurrency: { limit: 1, key: 'event.data.organization_id' }` serializes allocation per org. If that config is dropped, three simultaneous `lead.created` events could all read the same cursor and allocate the same rep. The config is the load-bearing guard — covered by a test asserting it is present, and noted here so it is never "cleaned up".
- **`team_members` has no provenance triple.** Like D-602's coordinator-claims table, it is a membership link, not a domain entity — `(team_id, profile_id, created_at, created_by)` is enough. Removing a member is a hard `DELETE`.
- **Empty/all-on-leave team → rule falls through.** If a `team_round_robin` rule's team has no available members, the engine treats the rule as non-matching and continues to the next rule — rather than assigning nobody and stopping. This means a lead can still reach a lower-priority catch-all. Documented so the "fall-through, not dead-end" behaviour is intentional.
- **`UNIQUE (organization_id, priority)` makes priorities scarce.** Two rules cannot share a priority; the create-rule action surfaces a `duplicate_priority` error. This is the PRD's data model verbatim — re-prioritising means editing the conflicting rule first. Acceptable at V6 pilot rule counts.
- **No `/dashboard/leads/unassigned` route.** D-610 leaves unmatched leads with `assigned_sales_rep_id` unset; surfacing them is a saved custom view today (D-413). A first-class unassigned route + a uuid `is_empty` view operator is the documented follow-up — not built here to keep D-610 within its step.
- **D-604's `source` is a free string; conditions match it exactly.** A rule's `conditions.source` is compared `===` to `data.source`. MIH connector names (`meta_lead_ads`, `99acres`, …) are the values; the manager must type them exactly. `source_channel` is the safer closed-enum condition. Documented for the operator.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every `allocation-engine.ts` / `allocation-admin.ts` query runs on `getSupabaseAdmin()` and filters by `organization_id`; the integration test is the regulator's proof.
- **`event-function-fn-handler`** (from D-009 `leadEnrichmentOnCreate`) — `presalesAllocationOnLeadCreated` follows the `inngest.createFunction({ triggers: [{ event }] }, async ({ event, step }) => …)` shape; tests invoke `.fn` with a mocked `step`.
- **`server-action-result-discriminated-union`** — every D-610 action returns `{ ok: true } | { ok: false, reason }`.
- **`rls-org-isolation-app-permission-gate`** (from D-602/D-608) — the three tables' RLS enforces org isolation; the `allocation_rules:manage` permission is gated in the server actions.
- **`additive-only-migrations`** — three `IF NOT EXISTS` tables; explicit `ROLLBACK:` block; no destructive change.
