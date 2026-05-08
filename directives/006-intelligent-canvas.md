# Directive 006 — Intelligent Canvas (Lead canvas only)

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-07
**Source:** docs/install-plan.md §4 D-006 + docs/PRD.md §6 + Constitution IX
**Authority:** memory/constitution.md (Principles I, II, III, IV, VII stack, IX Canvas)

---

## Problem

Constitution IX says **the Canvas IS the CRM**, not a tab on it. The first
five directives stand up multi-tenancy, the graph data model, the RBAC
engine, the super_admin and org_admin surfaces — but `/dashboard` is still
a placeholder. Sales reps have nowhere to *do work*.

D-006 ships the **Lead canvas** — the first instance of the Intelligent
Canvas paradigm — read-only on the data, full motion + Realtime stream
on the experience:

1. **Canvas shell** — React 19 + Framer Motion stacked sections (no tabs,
   per IX). Section reveal animates; future stage transitions (D-007)
   slot into the same motion contract.
2. **Adaptive field renderer** — type-aware rendering for the Lead schema
   (D-002). Progressive disclosure: 3 primary fields above the fold; the
   rest under a "More" toggle. shadcn/ui primitives only.
3. **Activity Stream** — Supabase Realtime subscription scoped to the
   lead's `(organization_id, workspace_id)`. Chronological feed of
   activity-typed nodes related to the lead via edges. AI-author rows
   show the tier badge (T0–T4) per Constitution I.
4. **Suggested action card** — empty-state placeholder. Real content
   arrives with the DOE engine in D-011.
5. **Agent panel** — empty-state placeholder. Real agent rows arrive
   with the Lead Enrichment Agent in D-009.
6. **Demo route** — `/dashboard/leads/demo` renders a local fixture
   (Priya Sharma · 3 BHK · Bangalore — same as PRD §6.1 illustration)
   so the Canvas can be smoke-tested before D-007 ships create/edit.
7. **Real route** — `/dashboard/leads/[id]` reads via the D-002 nodes
   API; tenant isolation comes free from `public.app_org_id()`.

Also ratifies **`baseline/112-canvas-contract.md`** so D-007 (lead
lifecycle), D-008 (Cmd+K), D-009 (Lead Enrichment Agent) and D-011 (DOE
engine) can plug into the suggested-action and agent slots without
renegotiation.

---

## Success criteria

- [ ] An authenticated sales_rep / manager / org_admin in workspace `W`
      navigates to `/dashboard/leads/<id>` for a lead in `W`. The Canvas
      renders: header (label + state badge + 3 primary fields) →
      "More" toggle (rest of the data fields) → Activity Stream →
      Suggested action (empty state) → Agent panel (empty state).
- [ ] Section reveal uses Framer Motion (fade + slide-in, ≤300ms).
      Reduced-motion preference honored (`prefers-reduced-motion`).
- [ ] Activity Stream subscribes via Supabase Realtime to a channel
      scoped by `(org_id, workspace_id)`. New activity-typed nodes
      attached to the lead appear without page reload, ordered newest-on-top.
- [ ] An authenticated user in workspace `W'` (different workspace, same
      org or different org) cannot subscribe to the lead's channel —
      RLS on `nodes` rejects their SELECT, so the Realtime broadcast
      doesn't reach them. Verified by integration test.
- [ ] `/dashboard/leads/demo` renders the fixture without touching the
      DB. Useful for design QA + Playwright smoke before D-007 ships
      a real "create lead" flow.
- [ ] `/dashboard/leads/<id>` returns a 404 for a non-existent lead and
      a 403 for a lead in another tenant (the `getLeadCanvas` data
      fetcher returns `null` under RLS in both cases — UI maps that to
      `notFound()`).
- [ ] `baseline/112-canvas-contract.md` ratifies the section order,
      slot contracts, motion budget, and Realtime channel naming.
      Locked at end of D-006 — future directives plug in without
      amending it.
- [ ] Coverage ≥ 80% lines / ≥ 90% branches on `src/lib/canvas/` and
      `src/components/canvas/`. All untagged tests pass.
- [ ] D-001..D-005 suites remain green; `npm run build` succeeds.

---

## Constraints

- **Constitution IX — no tabs.** Stacked sections only. The "More" toggle
  is not a tab; it's a progressive-disclosure expander on the field block.
- **Constitution VII stack discipline.** Framer Motion (new install — first
  in the repo), shadcn/ui primitives (already installed), Supabase Realtime
  via `@supabase/ssr` browser client (already installed).
- **Constitution II tenant isolation.** Realtime channel filters MUST be
  scoped by `organization_id` AND `workspace_id`. RLS on `nodes` already
  enforces SELECT scope (D-001/D-002); Realtime broadcasts respect RLS.
  We add a defense-in-depth client-side filter that drops messages whose
  payload row doesn't match the canvas's `(org_id, workspace_id)`.
- **Constitution III/IV — D-006 is read-only on the canvas.** No node
  mutations land here; D-007 ships create / edit / state transitions.
  Reading the lead + related activities does NOT write a `read_sensitive`
  audit row — this is operational-tier reading by the workspace's own
  user, not a privileged platform read.
- **Progressive disclosure budget.** ≤ 3 primary fields above the fold;
  everything else under "More". Defaults documented in baseline 112.
- **Performance budget.** First paint with 50 activity nodes < 1.5s on a
  Vercel preview; D-006 instruments + asserts in tests; D-014 hardens.
- **Reduced-motion compliance.** `prefers-reduced-motion: reduce` short-
  circuits all Framer Motion animations to instant transitions.
- **TDD per task** (V5 D-06): RED test → minimal impl → REFACTOR.
- **shadcn primitives reused.** No new shadcn install in D-006.

---

## Out of scope (explicit non-goals)

- **Lead create / edit / stage transitions** (D-007). The canvas is
  read-only in D-006; the "Confirm slot / Customize / Snooze" buttons
  in PRD §6.1 are not wired.
- **Cmd+K command bar** (D-008). The header has no `⌘K` slot in D-006.
- **Real Suggested action content** (D-009 + D-011). Empty-state copy only.
- **Real Agent panel content** (D-009). Empty-state copy only.
- **Custom fields on canvas** (D-112). The `data.custom` blob is read but
  not rendered in D-006.
- **Canvas-of-canvases / Manager view** (V1). PRD §6.4 is V1 scope.
- **Deal / Property / Site Visit canvases** (V1+). D-006 is Lead-only.
  Baseline 112 is written so the contract generalizes, but no other
  canvas component ships.
- **WhatsApp inbound writing real activity nodes** (D-010). D-006 reads
  whatever activity nodes already exist (in V0 these come from manual
  test seeding); D-010 lands the producer.
- **Cross-canvas linking** (canvas-of-canvases pan/zoom). V1.
- **Mobile breakpoints** beyond "doesn't break". Touch-first canvas is V1.
- **Per-org branding (logos, colors)** rendered on the canvas — D-005
  records branding; surfacing it on canvas is a follow-up directive.
- **Audit row on canvas read.** Operational reads by the workspace's own
  rep do not log to `audit_log`. Decision noted in spec §Risks.

---

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md` (no entries at confidence ≥3
yet — D-001..D-005 patterns are mostly conf 1; we still adopt them
because every prior directive validated them):

- **tenant-isolation-via-jwt-claim** — all canvas reads route through
  the request-scoped Supabase server client; RLS via `auth.app_org_id()`
  drops cross-tenant rows. The Realtime client also runs as the
  authenticated user, so its broadcasts are RLS-filtered.
- **node-data-as-jsonb-with-zod-validation** — adaptive field renderer
  validates the lead's `data` against `leadSchema` before rendering; a
  malformed row falls back to a "schema mismatch" placeholder rather
  than crashing.
- **injectable-supabase-client-for-tests** — `getLeadCanvas(lead_id, client?)`
  accepts an optional client so unit tests pass a mock.
- **stacked-sections-not-tabs** — applied; Constitution IX is binding
  for operational surfaces and we re-affirm it on the Canvas itself.
- **edge-middleware-as-routing-policy** — already enforces sales_rep /
  manager access to `/dashboard/*`. D-006 doesn't change middleware.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/006-intelligent-canvas/`.
- Estimate: **L** — 1 dependency added (framer-motion), ~14 files for
  shell + renderers + activity stream + routes, ~16 unit tests, ~3
  integration, ~2 Playwright @smoke. 4-6 sessions.
- Reviewer should confirm:
  1. **framer-motion install** — first motion lib in the repo. Adds
     ~50KB gz. Used by every later canvas-touching directive. OK?
  2. **Demo fixture vs no demo route** — D-006 ships `/dashboard/leads/demo`
     so the Canvas can be exercised *before* D-007 ships create/edit.
     Alternative: don't ship the demo route; just have an integration
     test seed a lead. Trade-off: demo route is one extra page but
     enables visual + Playwright smoke. Plan: ship the demo route.
  3. **Activity Stream message buffer.** Realtime delivers one event at
     a time. Buffer in client state and re-render? Plan: keep an
     in-memory append-only array + reverse-chronological render.
     Replaying from server is a follow-up (V1).
  4. **Channel naming convention.** Plan: `canvas:lead:<lead_id>` with
     server-side `RLS-as-filter` (Realtime respects RLS by default in
     Supabase). Documented in baseline 112.
  5. **Reduced-motion handling at the renderer level.** Plan: a
     `useReducedMotion()` hook + `MotionConfig` wrapper at the canvas
     root. Single seam. OK?
  6. **404 vs 403 on cross-tenant lead access.** RLS returns no rows for
     both "doesn't exist" and "exists in another tenant". Plan: return
     `notFound()` (404) — leaking 403 vs 404 reveals existence. OK?
  7. **Baseline 112 ratification timing.** Drafted during Group D
     (memory + verify), written via the same path D-002 used for
     baseline 110. The hook permits the ratify-via-script path; ad-hoc
     edits during execution are blocked. OK?
