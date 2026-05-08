# Builtrix AI-Native CRM — V0 Architecture

**Status:** V0 (D-001 → D-014 shipped).
**Last updated:** 2026-05-08.

This document is a flat snapshot of how the V0 system fits
together — what's where, what calls what, and what the seams
are. For "why" of any individual decision, see
`memory/decisions.md`.

---

## 1. Layers

```
┌────────────────────────── Operator surface ────────────────────────────┐
│  /platform/*      super_admin      provisioning, costs, audit         │
│  /admin/*         org_admin        cockpit, onboarding, directives    │
│  /dashboard/*     workforce        Lead canvas, Cmd+K, lead lifecycle │
│  /settings/*      both             integrations, users                │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
                       ┌───────▼────────┐
                       │ Next.js 16     │
                       │ App Router     │
                       │ + middleware   │
                       └───────┬────────┘
                               │
   ┌───────────────────────────┼─────────────────────────────────┐
   │                           │                                 │
┌──▼──────────┐         ┌──────▼──────┐                  ┌───────▼──────┐
│ Server      │         │ Server      │                  │ Server-side  │
│ Components  │         │ Actions     │                  │ Routes       │
└──┬──────────┘         └──────┬──────┘                  └───────┬──────┘
   │                           │                                 │
   │                           ▼                                 ▼
   │              src/lib/{leads,sitevisits,doe,...}/api.ts
   │                           │
   │                           ▼
   │                    src/lib/nodes/api.ts
   │                    (createNode/updateNodeData — provenance + audit)
   │                           │
   │                           ▼
   │                    Supabase (RLS, RPC, Storage, Realtime)
   │                           │
   ▼                           ▼
Browser                  Inngest functions
  │                            │
  └─── Realtime ───────────────┘
```

---

## 2. Source-tree map

```
src/
  app/
    (admin)/admin/...           D-005 cockpit + onboarding
    (dashboard)/dashboard/...   D-006 canvas, D-007 lifecycle, D-008 Cmd+K
    (platform)/platform/...     D-004 super-admin surfaces
    (settings)/settings/...     D-005 carry
    api/
      auth/whoami/                 D-001
      events/inbox/route.ts        D-013 cross-product event bus
      inngest/route.ts             D-002 + later wiring
      webhooks/whatsapp/route.ts   D-010 inbound WhatsApp
  components/
    canvas/                     D-006 + D-009 tier badges
    cmdk/                       D-008
    dashboard/                  D-007 NewLeadDialog
    ui/                         shadcn primitives
  lib/
    admin/                      D-005 cockpit data
    agents/                     D-009 Lead Enrichment, D-012 Site Visit Reminder
      registry.ts               agent registry + tier rank
      runtime.ts                runAgent + tier ceiling
      lead-enrichment.ts        T1 — gateway-driven scoring
      site-visit-reminder.ts    T2 — templated, no gateway
    ai/                         D-009 Model Gateway + budget + ledger
    auth/                       D-001 + D-003 RBAC
    canvas/                     D-006 canvas data + realtime channel
    cmdk/                       D-008 catalog + permissions
    doe/                        D-011 DOE engine
      runtime.ts                dispatchDirective + idempotency + rate
      conditions.ts             pure predicate evaluator
      actions/                  surface_on_canvas, flag_lead, send_template_message,
                                notify_user, attach_node, enqueue_agent
    events/                     D-013 cross-product inbox
      inbox.ts                  dispatchInboxEvent + ledger
      call-audit/               onCallAudited, onCallObjectionDetected
    inngest/                    Inngest client + functions
      functions/embedding-refresh.ts        D-002 + D-009
      functions/lead-enrichment.ts          D-009
      functions/doe-on-lead-created.ts      D-011
      functions/site-visit-window-sweep.ts  D-012 cron
    leads/                      D-007 lead lifecycle
    nodes/                      D-002 graph helpers + Zod schemas + states + text
    platform/                   D-004
    sitevisits/                 D-012 site visit api + transitions
    supabase/                   client + admin + server SSR helpers
    webhooks/whatsapp/          D-010 inbound parser + signature
supabase/
  migrations/                   ordered, additive-only
  config.toml
tests/
  lib/, components/, integration/, e2e/
```

---

## 3. Data model snapshot (D-001..D-013 tables)

| Table | Owner directive | Append-only? | RLS policy |
|---|---|---|---|
| `organizations` | D-001 | no | super_admin sees all; org_admin sees own |
| `workspaces`    | D-001 | no | org-scoped |
| `teams`         | D-001 | no | org-scoped |
| `profiles`      | D-001 | no | self + same-org |
| `user_app_roles`| D-001 | no | org-scoped |
| `audit_log`     | D-001 | **yes** (trigger) | org-scoped SELECT, service-role INSERT |
| `nodes`         | D-002 | no (soft-delete) | org-scoped |
| `edges`         | D-002 | no | org-scoped |
| `node_signals`  | D-002 | no | org-scoped |
| `embedding_queue` | D-002 | no | service-role |
| `role_permission_overrides` | D-003 | no | org-admin / super-admin |
| `subscriptions` | D-004 | no | super-admin |
| `support_tickets` | D-004 | no | scoped |
| `agent_service_accounts` | D-009 | no | service-role only |
| `token_usage_ledger` | D-009 | **yes** (trigger) | org-scoped SELECT |
| `whatsapp_inbound_log` | D-010 | **yes** | org-scoped SELECT |
| `org_whatsapp_endpoints` | D-010 | no | super-admin / own org |
| `directives` | D-011 | no (soft-delete) | NULL-org platform default + own org |
| `directive_invocations` | D-011 | **yes** | org-scoped SELECT |
| `event_inbox_log` | D-013 | **yes** | org-scoped SELECT |

All append-only tables enforce immutability via PG triggers
(D-001.10 pattern — RLS no-policy is insufficient because
service_role has `bypassrls=true`).

---

## 4. Key seams (single sources of truth)

| Concern | Single seam |
|---|---|
| Node mutations + audit | `src/lib/nodes/api.ts` |
| LLM calls + budget + ledger | `src/lib/ai/gateway.ts` |
| Agent dispatch + tier ceiling | `src/lib/agents/runtime.ts` |
| Directive dispatch + audit | `src/lib/doe/runtime.ts` |
| Cross-product events | `src/app/api/events/inbox/route.ts` → `src/lib/events/inbox.ts` |
| WhatsApp inbound | `src/app/api/webhooks/whatsapp/route.ts` → `src/lib/webhooks/whatsapp/ingest.ts` |
| Tenant isolation (read) | RLS policies; `auth.app_org_id()` SQL helper |
| Tenant isolation (write) | Server actions verify `getCurrentUser().organization_id` before invoking helpers |

---

## 5. Inngest function topology

| Function | Trigger | Purpose |
|---|---|---|
| `embedding-refresh` | event `node.embedding.refresh-requested` + cron `*/5 *` | Re-embed nodes via D-009 gateway |
| `lead-enrichment-on-create` | event `lead.created` | Run Lead Enrichment Agent (T1) |
| `doe-on-lead-created` | event `lead.created` | Dispatch DOE matching `lead.created` (D-15 walk-in) |
| `site-visit-window-sweep` | cron `*/15 *` | Emit `site_visit.window` to DOE for D-03/D-04 |

---

## 6. Test/coverage status

- Unit (vitest): 597 tests passing (post-D-014 + middleware env regression).
- Integration (vitest.integration.config.ts): runs against the
  live test DB; not gated in CI for the worktree run but
  exercised pre-merge.
- E2E (Playwright): smoke + regression tags, run on preview URL
  after deploy.
- Coverage thresholds (vitest.config.ts): lines ≥ 80, branches ≥ 90.

---

## 7. Vercel — required environment variables

**Critical:** missing env vars on the deploy target cause the middleware
to fail at request time (regression: `MIDDLEWARE_INVOCATION_FAILED` on
the 2026-05-08 first deploy). Set ALL of these in
**Vercel → Project Settings → Environment Variables → Production**
before promoting the deploy:

| Variable | Source | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API | **load-bearing for middleware** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase dashboard → API → anon key | **load-bearing for middleware** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → API → service role | server-only writes (audit_log, agents) |
| `DATABASE_URL` | Supabase dashboard → Database → connection string | scripts/seed scripts |
| `ANTHROPIC_API_KEY` | console.anthropic.com | D-009 Lead Enrichment Agent |
| `OPENAI_API_KEY` | platform.openai.com | D-009 fallback + embeddings |
| `WHATSAPP_WEBHOOK_SECRET` | any 32+ char random string | D-010 HMAC verify |
| `BUILTRIX_EVENT_INBOX_SECRET` | any 32+ char random string | D-013 HMAC verify |

If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
is missing, every page returns a 500 whose body names the missing
variable (no `MIDDLEWARE_INVOCATION_FAILED`). The "must not throw"
contract is pinned by [tests/middleware/env-validation.test.ts](../tests/middleware/env-validation.test.ts).

Also enable the Auth Hook in Supabase → Authentication → Hooks →
"Custom Access Token" → function `public.custom_access_token_hook`
(installed by [migration 20260507120100](../supabase/migrations/20260507120100_users_and_auth.sql)). Without it, JWTs
won't carry `organization_id` / `base_role` claims and RLS denies
everything.

---

## 8. Open V1 follow-ups (deferred from V0)

- Real outbound WhatsApp send (D-010 ships intake only; D-016
  parked).
- Google Calendar OAuth + slot-block (D-012 ships templated
  reminders only).
- T3 approval queue UI (D-011 stamps `pending_approval`; queue
  surface is V1).
- Org-admin authoring UI for custom directives (D-011 seeds the
  defaults; UI is V1).
- Promote `webhook-dedup-via-jsonb-key` to a partial unique index
  on `nodes` if pilot uncovers race-induced duplicates.
- Rename `verifyWhatsAppSignature` → `verifyHMACSignature`
  (D-013 reuses it for `/api/events/inbox`).
