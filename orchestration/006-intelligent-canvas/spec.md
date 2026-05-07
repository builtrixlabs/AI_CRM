# Spec — 006-intelligent-canvas

## Acceptance criteria

### Canvas shell (`<LeadCanvas>`)

- [ ] **AC-1** Renders 4 stacked sections in this order: **Header** →
      **Field block (primary + collapsible "More")** → **Activity Stream**
      → **Suggested action card** → **Agent panel**. No tabs (Constitution IX).
- [ ] **AC-2** Section reveal uses Framer Motion: `opacity 0→1` + `y 8→0`,
      `duration ≤ 300ms`, staggered by section in render order.
- [ ] **AC-3** When `prefers-reduced-motion: reduce`, transitions short-
      circuit to instant (the Framer `MotionConfig` honors `reducedMotion="user"`).
- [ ] **AC-4** First paint with 50 activity nodes < 1.5s on the Vercel
      preview. Smoke-asserted in a Playwright run; D-014 hardens the budget.
- [ ] **AC-5** Header shows `nodes.label` + `state` badge + 3 primary fields
      from `data` (`phone`, `source`, `intent_score`). Other lead-schema
      fields (`email`, `notes`, `custom`) hidden behind a "More" toggle.
- [ ] **AC-6** "More" toggle is a single shadcn `Button` that expands an
      animated panel. State held in component-local `useState`; no URL
      param, no tab semantics.

### Adaptive field renderer

- [ ] **AC-7** Each lead-schema primitive type has a renderer:
      `string` (plain), `email` (mailto link), `phone` (tel: link),
      `number` (right-aligned), `enum` (badge), `numeric-score`
      (badge with hot/warm/cold color). The renderer registry is a
      typed map; unknown types fall through to `string`.
- [ ] **AC-8** A row whose value is `null`/`undefined`/empty string
      hides itself entirely (not "—" placeholder). Progressive disclosure.
- [ ] **AC-9** A node whose `data` fails `leadSchema.safeParse` renders
      a `<SchemaMismatch />` block (warning icon + "Schema mismatch — see
      audit log") instead of crashing.

### Activity Stream

- [ ] **AC-10** Subscribes via Supabase Realtime to `nodes` rows where
      `node_type='activity'` AND there is an edge to the lead
      (`edge_type IN ('mentioned_in','related_to','belongs_to')`).
- [ ] **AC-11** Channel name: `canvas:lead:<lead_id>` (RLS-filtered by
      Supabase Realtime — broadcasts only reach subscribers whose RLS
      passes for the broadcast row). Documented in baseline 112.
- [ ] **AC-12** Initial fetch on mount returns up to 50 most-recent
      activities ordered DESC by `created_at`. New events appended at
      the top via Realtime; client-side filter drops messages whose
      `organization_id` ≠ current user's `org_id` as defense-in-depth.
- [ ] **AC-13** AI-author rows (where `created_by` is a service-account
      uuid + `created_via='ai_extraction'` OR `audit_log.actor_type='agent'`)
      render with a tier badge (T0–T4) + "🤖" glyph + audit-log link.
      For D-006, the link points to `/admin/audit?record_id=<id>` —
      that route exists from D-004.
- [ ] **AC-14** A user in workspace `W'` (different from the lead's
      workspace) cannot subscribe to the channel: RLS rejects the
      SELECT on the activity nodes; Supabase Realtime drops the
      broadcast. Verified by integration test (two users, two
      workspaces, one channel).

### Suggested action + Agent panel (placeholder slots)

- [ ] **AC-15** Suggested action card renders an empty-state panel:
      "✨ Suggested next action" heading + "No suggestions yet — DOE
      engine arrives in D-011" body + a forward-link to
      `/admin/directives` (placeholder from D-005).
- [ ] **AC-16** Agent panel renders an empty-state panel:
      "🤖 Agent activity" heading + "No agent activity — Lead
      Enrichment Agent arrives in D-009" body + forward-link to
      `/admin/agents` (placeholder from D-005).
- [ ] **AC-17** Both slots accept a `children` prop (the contract
      future directives target). When `children` is provided, the
      empty state is replaced. Locked into baseline 112.

### Routes

- [ ] **AC-18** `/dashboard/leads/demo` renders the Canvas with a
      hard-coded fixture (Priya Sharma · 3 BHK · Bangalore — see PRD
      §6.1). No DB row created, no Realtime subscription armed (the
      activity stream renders the fixture's own activities).
- [ ] **AC-19** `/dashboard/leads/<id>` calls `getLeadCanvas(id)`. If
      the row doesn't exist OR is in a different tenant (RLS returns
      no rows in both cases), the page calls `notFound()` (404).
      Existence isn't leaked via 403.
- [ ] **AC-20** When the lead row exists and is visible, the page
      hydrates a Client `<LeadCanvas>` with the server-fetched data
      and arms the Realtime subscription on mount.

### Quality gates

- [ ] **AC-21** All untagged tests pass; D-001 / D-002 / D-003 / D-004 /
      D-005 suites still green.
- [ ] **AC-22** Coverage ≥ 80 lines / ≥ 90 branches on `src/lib/canvas/`
      and `src/components/canvas/`.
- [ ] **AC-23** `npm run build` ✓.
- [ ] **AC-24** `baseline/112-canvas-contract.md` ratified at the end
      of D-006 — locks section order, slot contracts, channel naming,
      motion budget.

---

## Data model

**No new tables in D-006.** The canvas reads from the existing
`nodes` + `edges` tables (D-002) and listens on the Realtime channel
that D-002's RLS already protects.

**Migration count: 0.**

The dependency added: `framer-motion@^12.x` (peer-compatible with
React 19). First motion library in the repo. Documented in baseline 112
as part of the canvas contract.

---

## API contracts

### `src/lib/canvas/types.ts`

```ts
import type { LeadData } from "@/lib/nodes/schemas/lead";

export type CanvasLead = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string;            // one of ALLOWED_STATES.lead
  data: LeadData;            // validated by leadSchema
  created_at: string;
  updated_at: string;
};

export type CanvasActivity = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  data: Record<string, unknown>;  // activity schema (D-002)
  created_at: string;
  created_by: string;
  created_via: string;
  ai_confidence: number | null;
  agent_tier: "T0" | "T1" | "T2" | "T3" | "T4" | null;
};

export type CanvasData = {
  lead: CanvasLead;
  activities: CanvasActivity[];   // initial 50, DESC by created_at
};
```

### `src/lib/canvas/api.ts`

```ts
/**
 * Fetch a lead + its 50 most-recent activities for canvas rendering.
 *
 * Uses the request-scoped Supabase server client by default — RLS
 * automatically scopes by the caller's (org_id, workspace_id) JWT
 * claims. Returns `null` for non-existent OR cross-tenant leads.
 */
export async function getLeadCanvas(
  lead_id: string,
  client?: SupabaseClient
): Promise<CanvasData | null>;

/**
 * Format a Supabase Realtime channel name for the lead's canvas.
 * Locked into baseline 112: `canvas:lead:<lead_id>`.
 */
export function leadCanvasChannel(lead_id: string): string;
```

### `src/lib/canvas/fixture.ts`

```ts
/** Fixed Priya-Sharma demo fixture (PRD §6.1). No DB row touched. */
export const DEMO_LEAD: CanvasLead;
export const DEMO_ACTIVITIES: CanvasActivity[];
```

### `src/components/canvas/realtime.ts`

```ts
/**
 * Hook that subscribes to leadCanvasChannel(lead_id) and merges new
 * activity rows into local state. Honors `prefers-reduced-motion`
 * indirectly (motion happens at the renderer); cleans up on unmount.
 *
 * Defense-in-depth: drops messages whose payload row's
 * organization_id !== currentOrgId.
 */
export function useLeadActivityStream(
  lead_id: string,
  initial: CanvasActivity[],
  currentOrgId: string,
): CanvasActivity[];
```

### Field renderer registry

```ts
// src/components/canvas/field-renderers.tsx
export type FieldKind =
  | "string" | "email" | "phone"
  | "number" | "enum" | "score";

export type FieldDescriptor = {
  key: string;
  label: string;
  kind: FieldKind;
  primary: boolean;          // shown above the fold
};

export const LEAD_FIELDS: readonly FieldDescriptor[] = [
  { key: "phone",        label: "Phone",        kind: "phone",  primary: true  },
  { key: "source",       label: "Source",       kind: "enum",   primary: true  },
  { key: "intent_score", label: "Intent score", kind: "score",  primary: true  },
  { key: "email",        label: "Email",        kind: "email",  primary: false },
  { key: "notes",        label: "Notes",        kind: "string", primary: false },
];
```

The registry is a TS literal — single source per Constitution VIII.
Future custom fields (D-112) extend at runtime via the `data.custom`
slot; D-006 only renders ratified fields.

---

## UI surface

### Page tree

```
src/app/(dashboard)/dashboard/
├── page.tsx                       (existing — placeholder, untouched)
└── leads/
    ├── demo/page.tsx              (NEW — fixture-driven Canvas)
    └── [id]/page.tsx              (NEW — server fetch + Client Canvas)
```

### Component tree

```
src/components/canvas/
├── lead-canvas.tsx                Client component, motion root
├── canvas-section.tsx             Reusable stacked-section wrapper
├── canvas-header.tsx              Label + state badge + primary fields
├── field-block.tsx                Primary fields + "More" toggle
├── field-renderers.tsx            Type-aware primitive renderers
├── activity-stream.tsx            Realtime-fed list
├── activity-row.tsx               One activity entry, optional tier badge
├── suggested-action-slot.tsx      Empty-state + slot
├── agent-panel-slot.tsx           Empty-state + slot
├── schema-mismatch.tsx            Fallback when Zod parse fails
├── tier-badge.tsx                 T0–T4 colored badge
└── realtime.ts                    useLeadActivityStream hook
```

`<LeadCanvas>` is the single Client Component the pages mount.
Everything below is internal to the canvas package; nothing else in
the app imports them in D-006.

### Page wrappers

`/dashboard/leads/[id]/page.tsx` — Server Component:

```tsx
const data = await getLeadCanvas(params.id);
if (!data) notFound();
return <LeadCanvas lead={data.lead} initialActivities={data.activities} />;
```

`/dashboard/leads/demo/page.tsx` — Server Component:

```tsx
const { DEMO_LEAD, DEMO_ACTIVITIES } = await import("@/lib/canvas/fixture");
return <LeadCanvas lead={DEMO_LEAD} initialActivities={DEMO_ACTIVITIES} demo />;
```

`demo` prop disables the Realtime subscription (the fixture is static).

### Motion contract

- `MotionConfig` at the canvas root sets `reducedMotion="user"`.
- Section reveal uses `motion.div` with
  `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
   transition={{ duration: 0.25, delay: index * 0.05 }}`.
- The "More" toggle uses Framer's `AnimatePresence` for height-based
  expand/collapse.
- Activity row insert: `initial={{ opacity: 0, x: -8 }}` →
  `animate={{ opacity: 1, x: 0 }}` (~200ms) when a Realtime message arrives.

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | First Framer Motion install. Adds ~50KB gz; may interact with React 19 + RSC boundaries. | Locked to a React 19-compatible major; canvas components are all `'use client'`. |
| RQ-2 | Supabase Realtime broadcast filtering. Theoretically Realtime respects RLS, but if it doesn't (broadcast bug, future Supabase change), a CP could subscribe and see other CPs' activity. | Defense-in-depth client-side filter on `organization_id` AND `workspace_id` before merging into state; integration test runs cross-tenant subscription and asserts 0 messages reach the wrong viewer. |
| RQ-3 | "More" toggle UX risk: looks like a tab to the user. | Visual: animated expander with chevron, full-width below the primary fields. Documented in baseline 112: "expander, not tab; doesn't change route or hide content elsewhere." |
| RQ-4 | Reduced-motion preference may differ between SSR (server has no info) and client. | First render emits no motion (server can't know); client applies motion after hydration if `prefers-reduced-motion` is `no-preference`. Acceptable; documented. |
| RQ-5 | Activity Stream initial fetch could be slow if a lead has thousands of activities. | LIMIT 50 in the query; pagination-on-scroll is V1. |
| RQ-6 | Schema mismatch (`leadSchema.safeParse` fails) on a real lead row crashes the page if not handled. | `<SchemaMismatch />` fallback per AC-9; tested with a deliberately bad row in unit tests. |
| RQ-7 | Demo route exposes synthetic data publicly via a logged-in URL. Could be confused for a real lead. | Page banner: "Demo lead — fictional data, no DB row." Removed in D-007 once create/edit ships and demos can use a real seeded lead. |
| RQ-8 | Cross-tenant 404 vs 403. RLS makes existence indistinguishable from absence. | Always 404 (`notFound()`). Existence-leak avoided. |
| RQ-9 | Audit log on canvas read. Some compliance regimes require it. | Constitution VII reserves `read_sensitive` for *platform-tier* reads; operational reads by the workspace's own rep are NOT audited per D-004.4 precedent. Documented. |
| RQ-10 | Tier badge for AI rows requires a join to `audit_log` (the `agent_tier` lives there, not on `nodes`). | The Canvas data fetcher LEFT JOINs `audit_log` filtered to `actor_type='agent'` for the `created_by` actor on each activity. Indexed already. If too slow, V1 caches `agent_tier` on the activity node itself. |
