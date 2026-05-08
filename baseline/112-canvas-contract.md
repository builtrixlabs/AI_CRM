# BASELINE 112 — Intelligent Canvas Contract

**Version**: 1.0
**Effective Date**: 2026-05-07
**Authority**: D-006 directive (orchestration/006-intelligent-canvas)
**Status**: Locked (immutable after creation per Constitution VI + POLICY 001 Rule 2)
**Authority Order**: constitution > policy > **baseline (this file)** > memory > directive > conversation

---

## Purpose

Defines the contract for the Intelligent Canvas — an adaptive document
surface, one per node type. D-006 ships the **Lead canvas**; D-007 (lead
lifecycle), D-008 (Cmd+K), D-009 (Lead Enrichment Agent), D-010 (WhatsApp
inbound), D-011 (DOE engine), and D-012 (Site Visit + Calendar) plug into
this contract without renegotiating it.

To modify any part of this baseline, an amendment directive must:

1. Be authored under `directives/<NNN>-baseline-amendment-112-<topic>.md`.
2. Include impact assessment on every directive that has shipped after D-006.
3. Pass Plan Mode review.
4. Update this file in the same change.
5. Append the rationale to `memory/decisions.md`.

---

## I. Section order (no tabs — Constitution IX)

The Lead canvas renders in this order, top to bottom, in a single
scrollable surface:

1. **Header** — node label + state badge + 3 primary fields.
2. **Field block** — non-primary fields hidden behind a "More" expander.
3. **Activity Stream** — chronological feed (Realtime-fed); newest at top.
4. **Suggested action** — DOE engine slot.
5. **Agent panel** — agent activity slot.

**Constraint:** no tabs. The "More" expander is an in-place expander, not
a tab — it does not change the route, does not hide content elsewhere on
the page, and uses `aria-expanded` as the load-bearing state. Tabs are
forbidden in operational surfaces (Constitution IX).

Generalization to future canvases (Deal, Property, Site Visit, ...) is
expected to keep the same five sections; type-specific field renderers
plug into Header + Field block.

---

## II. Slot contracts (Suggested action + Agent panel)

Both slots follow the same shape:

```ts
function Slot({ children }: { children?: ReactNode })
```

- `children` undefined → empty-state copy + forward link to the future
  surface that will populate it (`/admin/directives` for Suggested action,
  `/admin/agents` for Agent panel).
- `children` defined → empty-state hidden, children rendered in the slot's
  body. The wrapping `<Card>`, heading, and `data-empty` attribute are
  always preserved by the slot for stable testing/styling.

This contract is the open API for D-009 (Lead Enrichment Agent populates
Agent panel) and D-011 (DOE engine populates Suggested action).

---

## III. Realtime channel naming + RLS posture

**Channel name**: `canvas:lead:<lead_id>` — formatted by `leadCanvasChannel`
in `src/lib/canvas/channel.ts`.

**Subscription scope**: the client uses the request-authenticated Supabase
browser client. Realtime broadcasts are RLS-filtered server-side: the
caller's `auth.app_org_id()` claim determines visibility, so a workspace-B
client subscribing to a workspace-A channel receives 0 broadcasts.

**Defense-in-depth**: `useLeadActivityStream` ALSO drops messages whose
payload `organization_id` ≠ the canvas's `currentOrgId`. When the canvas
caller passes `currentWorkspaceId`, the workspace check is also enforced
client-side. RLS is load-bearing; the client filter is belt + suspenders
per Constitution II.

**Pause**: when the canvas mounts in `demo` mode (the `/dashboard/leads/demo`
fixture route), the hook short-circuits and never subscribes.

**Fan-out limit**: the canvas subscribes to ONE channel per mounted lead.
The same client may subscribe to multiple channels (canvas-of-canvases —
V1+); each has its own RLS filter and its own client-side org filter.

---

## IV. Initial fetch contract

`getLeadCanvas(lead_id, client?)` lives in `src/lib/canvas/api.ts`. It is
**server-only** (it imports `next/headers` via the supabase server client
factory). Behavior:

- Validates `lead_id` matches a v1-v8 UUID regex; otherwise returns null
  without touching the DB.
- Returns the lead row (matching `node_type='lead'`, not soft-deleted)
  from `nodes`, scoped by RLS to the caller's tenant.
- Returns up to **50 most-recent** activity-typed nodes connected to the
  lead via edges of type `mentioned_in`, `related_to`, or `belongs_to`,
  ordered DESC by `created_at`.
- **Returns `null`** when the lead doesn't exist OR is in a different
  tenant (RLS hides existence). The caller maps null → `notFound()`.
- Schema-mismatched lead `data` falls back to `{}` so the canvas renders
  the `<SchemaMismatch />` block instead of crashing.
- **Does NOT write `read_sensitive` audit row.** This is operational-tier
  reading by the workspace's own user, not a privileged platform read.
  `read_sensitive` is reserved for super_admin reads (D-004.4 precedent).

---

## V. Field-renderer registry

`LEAD_FIELDS` in `src/components/canvas/field-renderers.tsx` is the
authoritative ordered list of fields rendered on the Lead canvas.
Each entry is `{ key, label, kind, primary }`. Kinds: `string`, `email`,
`phone`, `number`, `enum`, `score`. Unknown kinds fall through to `string`.

Empty values (`null`/`undefined`/empty string) hide the row entirely
(progressive disclosure — Constitution IX).

Custom fields (D-112) plug in at runtime via the reserved `data.custom`
slot. D-006 reads but does not render `data.custom`.

---

## VI. Motion contract

- **Library**: `framer-motion@^12` (locked at D-006). First motion lib in
  the repo. Used by every canvas-touching directive.
- **Reduced-motion**: `<MotionConfig reducedMotion="user">` at the canvas
  root. Browsers reporting `prefers-reduced-motion: reduce` get
  instant transitions.
- **Section reveal**: `opacity: 0 → 1` + `y: 8 → 0`, `duration: 0.25s`,
  `delay: index * 0.05s`.
- **More expander**: `AnimatePresence` height-based collapse/expand,
  `duration: 0.2s`. Note: jsdom doesn't synchronously remove exit-animated
  children, so tests assert via `aria-expanded` rather than DOM presence.
- **Activity row insert**: `opacity: 0 → 1` + `x: -8 → 0`, `duration: 0.2s`.
- **Performance budget (informational)**: first paint with 50 activity
  nodes < 1.5s on a Vercel preview. D-006 does not enforce; D-014 hardens.

---

## VII. Routes

- `/dashboard/leads/demo` — fictional Priya Sharma fixture (PRD §6.1).
  No DB row. Realtime subscription disabled. Banner: "Demo lead —
  fictional data, no DB row." This route is removed in a future
  directive once D-007 ships create/edit and the demo can use a real
  seeded lead.
- `/dashboard/leads/[id]` — server-fetches via `getLeadCanvas(params.id)`.
  On null → `notFound()` (404). Otherwise mounts `<LeadCanvas>`.

---

## VIII. RSC boundary

- `src/lib/canvas/api.ts` — server-only (transitively imports `next/headers`).
- `src/lib/canvas/channel.ts` — client-safe; the channel-name helper +
  edge-type / limit constants live here so client components can import
  them without dragging the server module into the client bundle.
- `src/lib/canvas/types.ts` + `src/lib/canvas/fixture.ts` — pure data;
  importable from either side.
- `src/components/canvas/*.tsx` + `realtime.ts` — `'use client'`. The
  pages under `src/app/(dashboard)/dashboard/leads/` are Server Components
  that pass serialized props.

---

## IX. Forbidden patterns

- ❌ Tabs anywhere on a canvas (Constitution IX).
- ❌ Subscribing to `nodes` Realtime without org/workspace filtering at
  the client (defense-in-depth on top of RLS).
- ❌ Direct INSERT / UPDATE on `nodes` from the canvas — the canvas is
  read-only in V0. Mutations go through `src/lib/nodes/api.ts` helpers
  (D-002) called from server actions (D-007).
- ❌ Writing `read_sensitive` audit rows on canvas reads. Operational reads
  are not audited (Constitution VII reserves the action for platform-tier).
- ❌ Importing `@/lib/canvas/api` from a Client Component (server-only).
  Use `@/lib/canvas/channel` instead.
- ❌ Rendering `lead.data` blindly when `leadSchema.safeParse` fails —
  always surface `<SchemaMismatch />`.
- ❌ Adding new node-type canvases without a baseline-amendment directive
  that documents which sections / slots remain unchanged.

---

## X. References

- Constitution: `memory/constitution.md` (Principles I, II, III, IV, VII, IX).
- PRD: `docs/PRD.md` §6 (Intelligent Canvas).
- Directive: `directives/006-intelligent-canvas.md`.
- Plan Mode artifacts: `orchestration/006-intelligent-canvas/{spec,plan,tasks}.md`.
- Library: `src/lib/canvas/`.
- Components: `src/components/canvas/`.
- Routes: `src/app/(dashboard)/dashboard/leads/[id]/page.tsx`,
  `src/app/(dashboard)/dashboard/leads/demo/page.tsx`.
- Tests: `tests/lib/canvas/**`, `tests/components/canvas/**`,
  `tests/integration/canvas-rls.test.ts`,
  `tests/integration/canvas-realtime-isolation.test.ts`,
  `tests/e2e/canvas-demo.spec.ts`,
  `tests/e2e/canvas-not-found.spec.ts`.

---

**END OF BASELINE 112 — locked at ratification 2026-05-07.**
