# Directive 617 — Cmd+K Shortcut Completion

**Kind:** feature (V6 Phase 1, step 1.7 — replace the 12 placeholder Cmd+K shortcuts)
**Status:** AUTHORIZED — operator cleared Phase 1 to run end-to-end 2026-05-14 ("implement all these features without stopping … completing phase 1").
**Branch target:** `v6-phase-1`
**Generated:** 2026-05-14T14:20:00Z
**Source:** `docs/PRD-v6.0.md` §D-617 (lines 929-942); `docs/plans/v6-implementation-order.md` §4 step 1.7.
**Builds on:** D-008 (the bounded Cmd+K catalog — `src/lib/cmdk/*`, `command-palette.tsx`), D-413 (the dashboard list-page + custom-views filter compiler — `listNodesByView` already accepts `ad_hoc_filters`), D-602 (the `/dashboard/site-visits?bucket=today` filter).

---

## Problem

The Cmd+K catalog (D-008) ships 12 placeholder shortcuts that all route to `/dashboard/placeholder/[slug]` — a stub page that says "lands in V1". D-617 resolves every one per PRD-v6.0 §D-617's decision tree: build a real destination or strip the entry.

D-617 ships:

1. **Canned lead views** `src/lib/leads/canned-views.ts` — maps each lead-filter slug (`hot-leads`, `new-leads`, `contacted-leads`, `qualified-leads`, `terminal-leads`, `leads-magicbricks`, `leads-99acres`, `leads-walkin`) to a `FilterClause[]`. The leads list page reads `?canned=<slug>` and applies these as ad-hoc filters.
2. **`DashboardListPage` ad-hoc filters** — the shared list-page component gains an optional `adHocFilters` prop, threaded into `listNodesByView`'s already-supported `ad_hoc_filters`. The leads page wrapper computes them from `?canned=`.
3. **Catalog rewire** `src/lib/cmdk/catalog.ts` — all 13 placeholder-targeting commands become real `navigate` commands:
   - 8 lead filters → `/dashboard/leads?canned=<slug>`.
   - `site-visits-today` → `/dashboard/site-visits?bucket=today` (D-602's filter).
   - `open-deal` / `open-contact` → `/dashboard/deals` / `/dashboard/contacts` (the real D-410 list pages), relabelled "Browse deals" / "Browse contacts".
   - `help-feedback` → `/dashboard/settings/feedback` (new, below).
   - `account-keyboard-shortcuts` (mis-wired: labelled "Keyboard shortcuts", targeted the feedback placeholder; no shortcuts page exists) → **removed** from the catalog.
4. **Feedback page** `src/app/(dashboard)/dashboard/settings/feedback/page.tsx` — a real in-app feedback form. The server action persists each submission as an `audit_log` row (`action='feedback_submitted'`).
5. **Placeholder teardown** — the `placeholder` command kind, `PLACEHOLDER_SLUGS`, and the `/dashboard/placeholder/[slug]` route are removed; D-617 is the D-008 catalog amendment.

**No migration** — D-617 reads/writes existing tables only.

---

## Architecture decisions

- **Canned filters use compiler-reliable fields only.** Lead state filters compile to `{ field: 'state', kind: 'builtin_state' }` (`state` is a real `nodes` column); source filters compile to `{ field: 'data->>source', kind: 'string', op: 'eq' }` (an exact jsonb-path text match — reliable, unlike a jsonb `>` range). `hot-leads` is interpreted as the **active funnel** (`state IN (contacted, qualified)`) — an intent-score range filter would need an unreliable jsonb-numeric comparison; the active-funnel reading is reliable, distinct from the other shortcuts, and defensible. Documented in *Risks & decisions*.
- **`DashboardListPage` gains `adHocFilters`, not lead-specific logic.** The shared component (leads / deals / contacts) only learns to *accept* an `adHocFilters` prop and forward it to `listNodesByView`. The `canned → FilterClause[]` mapping is lead-specific and lives in `src/lib/leads/canned-views.ts`, consumed by the leads page wrapper — the shared component stays generic.
- **`open-deal` / `open-contact` → the real list pages.** The PRD's decision tree says "these already work via lookup-prefix mode — verify, don't touch." They do *not*: in the actual catalog both are `kind: 'placeholder'`, not `lookup-prefix`. The honest minimal fix is to point them at the real `/dashboard/deals` and `/dashboard/contacts` list pages (D-410) and relabel them "Browse deals/contacts" — a name-lookup sub-mode for deals/contacts is a larger feature, out of D-617's "complete the shortcuts" scope.
- **Feedback persists to `audit_log`.** A dedicated `feedback` table / inbox is out of scope; `audit_log` is the org-scoped append-only ledger, and a `feedback_submitted` row is a real, queryable persistence. A richer feedback-triage surface is a documented follow-up.
- **The placeholder machinery is removed, not left dead.** PRD-v6.0 §D-617's outcome is "no placeholders." Keeping the `placeholder` kind / route / slug list as dead code would invite confusion; D-617 removes them and updates the D-008 catalog tests accordingly.

---

## Placeholder resolution table (PRD §D-617 decision tree)

| Slug | PRD decision | D-617 destination |
|---|---|---|
| `hot-leads` | build | `/dashboard/leads?canned=hot-leads` (state ∈ contacted, qualified) |
| `new-leads` | build | `/dashboard/leads?canned=new-leads` (state = new) |
| `contacted-leads` | build | `/dashboard/leads?canned=contacted-leads` |
| `qualified-leads` | build | `/dashboard/leads?canned=qualified-leads` |
| `terminal-leads` | build | `/dashboard/leads?canned=terminal-leads` (state ∈ lost, junk, on_hold) |
| `leads-magicbricks` | build | `/dashboard/leads?canned=leads-magicbricks` (data.source = magicbricks) |
| `leads-99acres` | build | `/dashboard/leads?canned=leads-99acres` |
| `leads-walkin` | build | `/dashboard/leads?canned=leads-walkin` |
| `site-visits-today` | build | `/dashboard/site-visits?bucket=today` (D-602) |
| `open-deal` | verify | `/dashboard/deals` (D-410 list — relabelled "Browse deals") |
| `open-contact` | verify | `/dashboard/contacts` (D-410 list — relabelled "Browse contacts") |
| `send-feedback` | build | `/dashboard/settings/feedback` (new feedback form) |

---

## Success criteria (production target 80/90)

- [ ] **AC-1** Every one of the 12 placeholder slugs resolves to a real working destination per the table above; no Cmd+K command has `kind: 'placeholder'`.
- [ ] **AC-2** `/dashboard/leads?canned=<slug>` applies the slug's `FilterClause[]` as ad-hoc filters on top of any selected view — the leads list returns the filtered set.
- [ ] **AC-3** `cannedLeadFilters(slug)` returns the documented filters for each of the 8 lead slugs and `null` for an unknown slug.
- [ ] **AC-4** `/dashboard/settings/feedback` renders a form; submitting it (gated on an authenticated org user) writes one `audit_log` row `action='feedback_submitted'`, `diff: { category, message }`, `actor_type='user'`.
- [ ] **AC-5** The `/dashboard/placeholder/[slug]` route, `PLACEHOLDER_SLUGS`, and the `placeholder` command kind are removed; `command-palette.tsx` `runCommand` handles `navigate` only.
- [ ] **AC-6** `account-keyboard-shortcuts` is removed from the catalog (mis-wired, no real destination). The catalog count drops 34 → 33; every remaining command's `target` (for `navigate`) starts with `/` and is a real route.
- [ ] **AC-7** Tests: `canned-views.test.ts` (the filter map), an RTL test for the feedback form; `catalog.test.ts` + `command-palette.test.tsx` updated for the placeholder removal; `placeholder-page.test.tsx` deleted with its route. `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-8** Applicable V6 stopping-criteria gates pass. **Gate 4 (migrations) = N/A** — D-617 ships no migration.

---

## Non-goals (deferred)

- **Deal / contact name-lookup sub-mode** — `open-deal` / `open-contact` go to the real list pages; a Cmd+K typed-name lookup for deals/contacts (mirroring the lead lookup) is a larger feature, deferred.
- **A feedback triage inbox** — feedback persists to `audit_log`; a dedicated `/admin/feedback` review surface + `feedback` table is a follow-up.
- **An intent-score range filter for `hot-leads`** — needs a reliable numeric path on `data.intent_score`; D-617 uses the active-funnel state reading instead (see Risks).
- **A keyboard-shortcuts help page** — `account-keyboard-shortcuts` is removed rather than pointed at a new page; a real shortcuts reference is out of scope.
- **Saved (DB) canned views** — the PRD's `?view=<canned>` phrasing implies seeded `custom_views` rows; D-617 uses code-defined ad-hoc filters via `?canned=` instead, so no per-org seeding is required.

---

## Stack

- **New:** `src/lib/leads/canned-views.ts`, `src/app/(dashboard)/dashboard/settings/feedback/page.tsx`, `src/app/(dashboard)/dashboard/settings/feedback/actions.ts`, `src/components/feedback/feedback-form.tsx`, plus tests.
- **Modified:** `src/lib/cmdk/catalog.ts` (rewire + remove `PLACEHOLDER_SLUGS` + remove one command), `src/lib/cmdk/types.ts` (drop the `placeholder` kind), `src/lib/cmdk/index.ts` (drop placeholder exports), `src/components/cmdk/command-palette.tsx` (`runCommand` handles `navigate` only), `src/components/views/dashboard-list-page.tsx` (`adHocFilters` prop), `src/app/(dashboard)/dashboard/leads/page.tsx` (`?canned=` handling), `tests/lib/cmdk/catalog.test.ts`, `tests/components/cmdk/command-palette.test.tsx`.
- **Deleted:** `src/app/(dashboard)/dashboard/placeholder/[slug]/page.tsx`, `tests/components/cmdk/placeholder-page.test.tsx`.
- **Reuses:** the D-413 `listNodesByView` `ad_hoc_filters` path + the `compile-filters` operator catalog, the D-602 `?bucket=today` site-visit filter, the D-410 deals/contacts list pages, the discriminated-union server-action pattern.
- **DB:** read-only (feedback → `audit_log`). No schema change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-617** — the decision tree (build vs verify vs strip) for each of the 12 placeholders is specified there; the resolution table above traces to it.
- **Implementation-order §4 step 1.7** — "Replace 12 placeholders with real filtered list pages OR strip."
- **D-008 catalog amendment** — `src/lib/cmdk/catalog.ts` is "locked literal per directive 008; adding/removing requires a Plan-Mode-reviewed amendment." D-617 is that amendment.
- **Constitution II** — the feedback action is gated on an authenticated org user; the `audit_log` row carries `organization_id`.

---

## Operator follow-ups (post-merge)

- [ ] **No migration** — D-617 ships none (`docs/V6_STATUS.md` Gate 4 row = N/A).
- [ ] **Smoke** Cmd+K → "Show new leads" → lands on `/dashboard/leads?canned=new-leads` showing only `state=new` leads.
- [ ] **Smoke** Cmd+K → "Show leads from magicbricks" → only `data.source=magicbricks` leads.
- [ ] **Smoke** Cmd+K → "Send feedback" → the form at `/dashboard/settings/feedback`; submit → an `audit_log` `feedback_submitted` row appears.
- [ ] **Follow-up** decide whether to build an `/admin/feedback` triage surface (currently feedback lives only in `audit_log`).

---

## Risks & decisions

- **`hot-leads` is the active funnel, not an intent threshold.** `data.intent_score` is jsonb text; a `> 70` filter through the compiler would be a lexical string comparison (`'8' > '70'` is true, `'100' > '70'` is false) — unreliable. D-617 interprets "hot leads" as `state IN (contacted, qualified)` (leads actively progressing), which compiles to a reliable `state` filter. The Command Center's intent-based "hot pipeline" KPI (D-605) is unaffected — it aggregates in JS. If a true intent-threshold Cmd+K filter is wanted, it needs a reliable numeric path (a follow-up).
- **`open-deal` / `open-contact` lose the "by name" affordance.** The PRD assumed they were already lookup-prefix commands; they were placeholders. Rather than build a deal/contact name-lookup sub-mode (a real feature), D-617 points them at the real list pages and relabels them honestly. The list pages *are* a real working destination — AC-1 is met; the typed-name lookup is a documented non-goal.
- **Feedback in `audit_log` has no triage UI.** Submissions are persisted and org-scoped, but there is no inbox to review them. This is an intentional scope cut — a real form that reliably persists beats a stub; the triage surface is a follow-up.
- **Removing `account-keyboard-shortcuts` changes the catalog count.** D-008's `catalog.test.ts` asserts `COMMANDS.length === 34`; D-617 drops it to 33 and updates the test. The command was mis-wired (label ≠ target) with no real destination — removal is the honest decision-tree outcome ("strip"), and D-617 is the sanctioned D-008 amendment.
- **`?canned=` ad-hoc filters stack on top of a selected view.** `listNodesByView` merges `ad_hoc_filters` *after* the view's filters. So `/dashboard/leads?view=my-view&canned=new-leads` shows my-view ∧ state=new. This is additive-by-design (the compiler ANDs all clauses); documented so it is not mistaken for a bug.

---

## Learned Patterns Applied

- **`reuse-existing-query-surface`** — `listNodesByView` already accepts `ad_hoc_filters`; D-617 exposes that capability through `DashboardListPage` rather than building a parallel query path.
- **`compiler-reliable-fields-only`** — canned filters use `state` (a real column) and `data->>source` exact-match; no jsonb-numeric range comparisons, which the PostgREST/compiler path handles unreliably.
- **`server-action-result-discriminated-union`** — `submitFeedbackAction` returns `{ ok: true } | { ok: false, reason }`.
- **`directive-as-baseline-amendment`** — D-617 is the sanctioned amendment to the D-008 locked catalog; it removes the `placeholder` machinery and updates the catalog's tests in lock-step.
