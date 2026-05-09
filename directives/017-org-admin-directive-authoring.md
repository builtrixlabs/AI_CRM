# Directive 017 — Org-admin directive authoring & invocation surface

**Kind:** feature (V1 follow-up to D-011)
**Status:** DRAFT — awaiting Plan Mode review (Gate 2)
**Created:** 2026-05-09
**Source:** Operator request (post-V0 walk-through, 2026-05-09): "/admin/directives is empty — build the management surface."
**Authority:** memory/constitution.md (Principles I tier ceiling, II tenant isolation, IV audit, V DOE, X NL-Compile-Then-Apply)
**Builds on:** D-001 (auth + audit), D-003 (RBAC), D-005 (admin cockpit), D-011 (DOE engine + 15 platform-default seeds)
**Stack:** branch off `main` as `feature/017-org-admin-directive-authoring`.
**Pinned by:** [docs/architecture.md:213](../docs/architecture.md) §8 V1 follow-ups — *"Org-admin authoring UI for custom directives (D-011 seeds the defaults; UI is V1)."*

---

## Problem

D-011 shipped the DOE engine and seeded 15 platform-default directives (`organization_id IS NULL`, `code` D-01..D-15). The runtime fires them server-side today — Lead Enrichment runs on `lead.created`, the cron sweep dispatches `site_visit.window`, the WhatsApp / Call Audit handlers dispatch their respective events. **Every fire writes one `directive_invocations` row + one `audit_log` row.** All of this is observable via SQL but not via the product.

The org_admin's `/admin/directives` route currently renders a placeholder paragraph ([src/app/(admin)/admin/directives/page.tsx](../src/app/(admin)/admin/directives/page.tsx)). They cannot:

1. **See** which directives are active for their org.
2. **Toggle** a platform default off (e.g. opt out of D-09 "call objection: price → playbook" because their reps prefer no nudge).
3. **Author** a custom directive (constrained to V0's literal trigger/action catalog — free-form NL compilation is a later directive).
4. **Inspect** recent invocations to confirm the engine actually fired (debugging "did D-02 send my Qualified-silent reminder yesterday?").

D-017 ships those four capabilities as a stacked-sections page using only the existing `directives` and `directive_invocations` tables — no schema migration. Per-org override rows follow the established pattern (`organization_id = caller's org`, same `code` as the platform default; runtime already prefers org-specific via the `platform-default-via-null-org-id` pattern).

---

## Success criteria

### Page & navigation

- [ ] **AC-1** Replace the placeholder at `src/app/(admin)/admin/directives/page.tsx` with a Server Component that:
  - Verifies caller is `org_admin` (or higher) — redirect to `/403` otherwise.
  - Loads the org's effective directives (platform defaults + own-org overrides, deduped by `code` with org rows winning).
  - Renders three stacked sections: **Active directives**, **Author new directive**, **Recent fires** (Constitution IX, `stacked-sections-not-tabs` pattern).
- [ ] **AC-2** The admin cockpit's Directives card already links here; verify the link still works post-replacement (existing nav).
- [ ] **AC-3** Cmd+K registers a new entry `cmd-admin-directives` (kind: `navigate`, target: `/admin/directives`, requires `org.admin.read`) so the surface is discoverable from the palette.

### Section 1 — Active directives list

- [ ] **AC-4** Table with columns: `code` (e.g. `D-09`), `display_name`, `trigger_kind` (badge), `action_kind` (badge), `tier` (badge), `enabled` (toggle), `origin` (`Platform default` | `Custom (org)` | `Override`), `last_fired_at` (from invocations), `fires_24h` (rate-limit-aware count).
- [ ] **AC-5** The toggle invokes a server action `toggleDirective({ code, enabled })`:
  - If platform default → upserts an org-override row carrying the same `code`/`trigger_*`/`action_*`/`tier` but with `organization_id = caller's org` and the requested `enabled` value.
  - If org-custom → updates the existing row in place.
  - Writes one `audit_log` row with `action='directive_toggled'`, `diff: { code, from: <bool>, to: <bool> }`.
  - Returns `server-action-result-discriminated-union` shape.
- [ ] **AC-6** Cross-tenant guard: the action filters its UPDATE/UPSERT by the caller's `organization_id` per `caller-org-filter-on-service-role-mutation`. A second org's override row cannot be touched.
- [ ] **AC-7** Disabled rows render dimmed; the toggle's aria-checked reflects effective state.

### Section 2 — Author new directive (constrained form)

- [ ] **AC-8** Form fields:
  - `display_name` (required, ≤ 80 chars).
  - `trigger_kind` (required, `<Select>` over the 12-member union from `src/lib/doe/types.ts`).
  - `trigger_config` — minimal per-trigger field set (V0 shape): for `lead.idle_threshold`, an `idle_hours` number; for `lead.intent_crossed`, a `threshold` number; for others, an empty `{}` placeholder (advanced editing parked).
  - `action_kind` (required, `<Select>` over the 6-member union — same source).
  - `action_config` — minimal per-action field set: for `surface_on_canvas`, a `note` body; for `send_template_message`, a `template_id` text; for others, `{}` placeholder.
  - `tier` — derived from `action_kind` per the V0 mapping (`surface_on_canvas`/`notify_user` → T0; `flag_lead`/`attach_node` → T1; `send_template_message` → T2; `enqueue_agent` → T1 by default with a per-action override for T3 attempts which auto-stamp `pending_approval`). Display, don't ask.
- [ ] **AC-9** Submit invokes a server action `createCustomDirective({...})`:
  - Validates via Zod (`createDirectiveInputSchema`) — rejects with `error: 'validation'` and `fieldErrors` map.
  - Generates a `code` of the form `C-<NN>` per-org (sequential within the org's custom rows; max-existing+1, starting at C-01).
  - Inserts via service-role admin client; sets `organization_id`, `created_by`, `created_via='manual'`.
  - Writes one `audit_log` row `action='directive_created'`.
  - Returns `{ ok: true, data: { id, code } }`.
- [ ] **AC-10** Free-form NL parsing is **out of scope**. The form is bounded by the V0 trigger/action literal sets per Constitution X (NL-Compile-Then-Apply: the literal IS the compiled artifact). A "Compose in plain English" affordance is parked for a later directive (D-018+).

### Section 3 — Recent fires

- [ ] **AC-11** A table of the last 50 `directive_invocations` rows for the caller's org, ordered by `ts DESC`. Columns: `ts`, `code` (joined via `directive_id`), `outcome` (badge), `subject_node_id` (link to lead canvas if it's a lead), `details` (truncated jsonb preview, expand-on-click).
- [ ] **AC-12** This is an operator-visible read of operational data. Per `read-sensitive-audit-on-platform-reads`: list view does NOT audit (operational read, not sensitive); the join through to a specific lead's canvas already audits at the lead-read site, no double-write.
- [ ] **AC-13** RLS scopes the read by `organization_id`; service-role usage is unnecessary and avoided (read goes through the user-scoped client).

### Permissions, audit, RLS

- [ ] **AC-14** New permission `org.directive.author` granted to `org_admin` and `super_admin` only. Added to `PERMISSIONS` catalog and `BASE_ROLE_PERMS` per `permission-catalog-as-literal-union`. The "Author new directive" form is hidden when the resolver doesn't yield it (`permission-gated-command-visibility`).
- [ ] **AC-15** `directives` table needs an `INSERT`/`UPDATE` RLS policy gated by `(public.app_org_id() = organization_id) AND public.app_is_org_admin_or_super()`. Confirm this is **the only schema-adjacent change** required — a one-migration policy add, no DDL on the table itself.
- [ ] **AC-16** Belt-and-suspenders: server actions also check `requirePermission('org.directive.author')` before any DB write (`belt-and-suspenders-platform-only` pattern).

### Tests

- [ ] **AC-17** Unit tests in `tests/lib/doe/authoring.test.ts`: `toggleDirective` upserts an override; second toggle updates in place; cross-tenant attempt returns `{ ok: false, error: 'validation' }` shape.
- [ ] **AC-18** Unit tests in `tests/lib/doe/codegen.test.ts`: `nextCustomCode(orgId)` returns `C-01` for an empty org, `C-02` after one custom, monotonic.
- [ ] **AC-19** RTL component test for the directives page renders the three sections and dims disabled rows.
- [ ] **AC-20** Integration test in `tests/integration/directive-org-override.test.ts`: seed two orgs, toggle D-09 off in org-A, confirm `dispatchDirective({ trigger: 'call.objection_detected', organization_id: orgA })` returns `outcome='skipped_disabled'`, while the same trigger in org-B still dispatches.
- [ ] **AC-21** Cross-tenant integration test: org-B attempts to toggle org-A's custom directive → `validation: not found`-shaped result, identical to a genuine missing row (no existence leak).
- [ ] **AC-22** Coverage targets per V5 spec: ≥ 80% lines / ≥ 90% branches on `src/lib/doe/authoring.ts` and `src/app/(admin)/admin/directives/actions.ts`.

### Exit criteria

- [ ] **AC-23** `npm run build` exits 0.
- [ ] **AC-24** `npx vitest run` exits 0 with 0 failures.
- [ ] **AC-25** `npx tsc --noEmit` exits 0 (excluding pre-existing e2e exclusions).
- [ ] **AC-26** Playwright `@smoke` suite includes one new test: org_admin signs in, navigates to `/admin/directives`, sees ≥ 15 rows, toggles one off, refreshes, the toggle state persists.
- [ ] **AC-27** A pattern-extractor pass after Gate 5 reinforces `platform-default-via-null-org-id` and `doe-ledger-as-rate-limit-source`, and may add a new pattern for "constrained-form-as-NL-substrate" (Constitution X V1 stepping stone).

---

## Non-goals (out of scope)

- **Free-form NL directive composition.** That's a later directive. D-017 ships the bounded form whose literal IS the compiled artifact (Constitution X step 1).
- **T3 / T4 approval queue UI.** D-011 already stamps `pending_approval` at the runtime layer; the queue surface is a separate V1 directive.
- **Cross-org platform-default editing.** Only `super_admin` can mutate `organization_id IS NULL` rows; D-017 does NOT add UI for that. Org_admins always work via override rows.
- **Bulk-import / CSV-export of directives.** V2+.
- **Directive versioning / audit replay.** The audit log already records every change; building a UI for diff-replay is out of scope.
- **Real outbound WhatsApp send via `send_template_message`.** Still stubbed per D-011 — the action writes an `activity` node; real send is a separate D-018+ directive.
- **Schema changes to `directives` or `directive_invocations`.** D-017 only adds a single RLS policy migration (org_admin INSERT/UPDATE). No new columns, no new tables.

---

## Constraints

- **Stack:** Next.js 16 App Router (Server Components for the page, server actions for mutations, shadcn/ui for table + dialog + select), Supabase (RLS + service-role for the override upsert), Vercel preview deploy.
- **TDD enforced** (Gate 3): RED → GREEN → REFACTOR per task. Acceptance test must fail BEFORE any UI code lands.
- **Branch deploys only.** Feature branch `feature/017-org-admin-directive-authoring`; never push to `main`.
- **No new shadcn components without recording in the install log** — likely needs `<Switch>` + `<Select>` + `<Dialog>` (already installed per D-007) + `<Table>` (already installed per D-004).
- **Constitution II (tenant isolation):** every action verifies caller's `organization_id`. The override-upsert path uses the service-role client and MUST filter by the caller's org per the `caller-org-filter-on-service-role-mutation` pattern.
- **Constitution IV (audit):** every mutation writes one `audit_log` row with a typed `action` and a structured `diff`.
- **Constitution X (NL-Compile-Then-Apply):** the form's bounded selectors ARE the compiled artifact. Free-form input is parsed by a future directive that lowers prose into the same `(trigger_kind, action_kind, *_config)` shape this directive accepts.

---

## Learned patterns applied (confidence ≥ 1)

From [memory/learned/ai-crm/patterns.md](../memory/learned/ai-crm/patterns.md):

- **`platform-default-via-null-org-id`** (D-011) — directly load-bearing. Toggle-off path UPSERTs an override row keyed by `(organization_id, code)`; runtime resolution already prefers org-specific.
- **`doe-ledger-as-rate-limit-source`** (D-011) — Section 3's "Recent fires" reads from `directive_invocations` ordered by `ts DESC`; the same ledger powers the existing 24h rate-limit check.
- **`caller-org-filter-on-service-role-mutation`** (D-007, confidence 2) — CRITICAL. Every server action mutating via the admin client filters by `caller_org_id`; cross-tenant attempts return the same "validation: not found" result as a genuine miss (no existence leak). Tested at unit AND integration layer.
- **`belt-and-suspenders-platform-only`** (D-003) — `org.directive.author` checked at the action layer AND enforced by the new RLS policy. Drift detection is a follow-up.
- **`server-action-result-discriminated-union`** (D-007) — every action returns `{ ok: true; data? } | { ok: false; error: 'permission' | 'validation' | 'unknown'; fieldErrors?; message? }`.
- **`stacked-sections-not-tabs`** (D-004) — three sections stacked vertically inside `<Card>` chrome, no client-side tab state.
- **`single-dispatcher-server-action`** (D-005) — one `directiveAction(formData)` routed by hidden `intent` field (`'toggle' | 'create' | 'edit' | 'archive'`) keeps the action layer concise.
- **`permission-catalog-as-literal-union`** (D-003) — the new `org.directive.author` permission goes into `PERMISSIONS` and `BASE_ROLE_PERMS`; "no orphans" test catches forgotten wiring.
- **`tier-3-stops-runtime-pending-approval`** (D-009/D-011, confidence 2) — if the form lets a user pick a T3 action (e.g. `enqueue_agent` for a T3 agent), submission still succeeds but the row is created with `tier='T3'`; the runtime will stamp `pending_approval` on first fire. UI surfaces a one-line note: *"This directive will require manual approval each time it fires."*
- **`tenant-isolation-via-jwt-claim`** (D-001) — Section 3 list reads through the user-scoped client; RLS handles isolation declaratively.
- **`provenance-as-not-null-columns`** (D-001) — every insert/update sets `created_by/_via`, `updated_by/_via`. The form has no UI for these — they're injected from `getCurrentUser()`.
- **`read-sensitive-audit-on-platform-reads`** (D-004) — list reads in Sections 1 and 3 do NOT audit (operational metadata, not super_admin-only sensitive). Mutations always audit.

---

## Implementation outline (NOT a plan — refined at Plan Mode)

**Group A — Permissions + RLS prep (foundation)**
- New permission constant + grant to `org_admin` / `super_admin`.
- One migration `20260509XXXXXX_directives_org_admin_write.sql` adding INSERT/UPDATE policies on `directives` for the new permission.
- RED test: cross-tenant action attempt fails before any UI exists.

**Group B — Authoring lib (`src/lib/doe/authoring.ts`)**
- `nextCustomCode(orgId)` (returns `C-NN`).
- `toggleDirective({ caller_org_id, code, enabled })` — upserts override or updates existing.
- `createCustomDirective({ caller_org_id, ...input })` — inserts with `code = nextCustomCode`.
- Zod input schemas with Constitution X-shaped trigger_config / action_config validators.
- Tests: every helper unit + cross-tenant case.

**Group C — Server actions (`src/app/(admin)/admin/directives/actions.ts`)**
- Single dispatcher `directiveAction(formData)` routed by `intent`.
- `getCurrentUser()` → `requirePermission('org.directive.author')` → call into Group B.
- Map Zod issues to `{ error: 'validation', fieldErrors }`; map illegal-tier to `{ error: 'validation' }`.
- Tests: each intent's success + each error branch.

**Group D — Page UI**
- Replace placeholder. Three stacked sections via existing `<Card>` primitives.
- Section 1: `<DirectivesTable>` with `<Switch>` per row.
- Section 2: `<NewDirectiveDialog>` (lifted via the existing `dialog-state-via-react-context-provider` pattern from D-008).
- Section 3: `<RecentFiresTable>`.
- RTL tests: render all three; disabled-row dimming; permission-gated form visibility.

**Group E — Cmd+K, smoke, verify**
- `cmd-admin-directives` registered in `src/lib/cmdk/catalog.ts`.
- Playwright smoke: org_admin sign-in → navigate → toggle persists.
- `npm run build` / `npx vitest run` / coverage.

---

## References

- [directives/011-doe-workflow-engine.md](011-doe-workflow-engine.md) — DOE engine V0 (the engine + 15 seeds). D-017 is the management surface for what D-011 ships server-side.
- [docs/architecture.md:213](../docs/architecture.md) §8 — pinned this directive as a V1 follow-up.
- [memory/decisions.md:946](../memory/decisions.md) — D-011 decisions (platform-default-via-NULL, ledger-as-rate-limit, T3-pending-approval).
- [src/lib/doe/types.ts](../src/lib/doe/types.ts) — the literal trigger / action / outcome unions D-017 surfaces in the form.
- [supabase/migrations/20260508140000_directives.sql](../supabase/migrations/20260508140000_directives.sql) — base schema; D-017 adds only an RLS policy.
- [supabase/migrations/20260508140200_seed_default_directives.sql](../supabase/migrations/20260508140200_seed_default_directives.sql) — the 15 platform-default rows the UI surfaces.
- Constitution Principles I (tier ceiling), II (tenant isolation), IV (audit), V (DOE), X (NL-Compile-Then-Apply).
