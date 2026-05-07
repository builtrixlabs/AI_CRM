# Spec — 004-super-admin-surfaces

## Acceptance criteria

### Provisioning (the V1 Definition-of-Done gate)

- [ ] **AC-1** GET `/platform/organizations/new` renders a form with fields: org name, slug (auto-suggest from name), RERA number (optional), GSTIN (optional), primary contact name + email + phone, plan tier (Starter / Pro / Enterprise / Custom).
- [ ] **AC-2** POST submission via server action `provisionOrganization(input)` validates the input via Zod, gates on `requirePermission(user, 'organizations:create')`, then atomically:
  1. INSERT `organizations` row.
  2. INSERT default `workspaces` row "<Org Name> — Default Workspace".
  3. INVITE org_admin user via Supabase Auth `admin.inviteUserByEmail`.
  4. INSERT `profiles` row for the new user with `base_role='org_admin'`.
  5. INSERT `subscriptions` row at the chosen plan tier.
  6. INSERT one `audit_log` row with `action='create_organization'`, `organization_id=<new>`, `actor_id=<super_admin>`, `actor_type='user'`, `diff` containing the provisioned tuple.
- [ ] **AC-3** On success, the user is redirected to `/platform/organizations/[id]` and the org_admin receives a magic-link email.
- [ ] **AC-4** On failure (slug collision, invite failure), the form re-renders with the error and **NOTHING** has been committed (server action runs in a single transaction wrapper or rolls back via compensating deletes).
- [ ] **AC-5** A non-super_admin (sales_rep, org_admin) hitting `/platform/organizations/new` is redirected to their landing surface by middleware (already enforced — D-001 contract). The server action *also* gates with `requirePermission` as defense-in-depth.

### Listing + drill-down

- [ ] **AC-6** GET `/platform/organizations` shows a table with columns: name, slug, plan_tier, created_at, status (active/suspended). Search by name or slug. Pagination at 50 rows/page.
- [ ] **AC-7** GET `/platform/organizations/[id]` shows four stacked sections (NOT tabs):
  1. **Info** — name, slug, RERA, GSTIN, created_at.
  2. **Admins** — list of `profiles WHERE organization_id=$id AND base_role IN ('org_owner','org_admin')`. Each row: email, display_name, base_role, created_at.
  3. **Subscription** — current plan_tier, status, renewal date (if any).
  4. **Recent audit** — last 50 `audit_log` rows for this org, action + actor + ts.
- [ ] **AC-8** super_admin viewing `/platform/organizations/[id]` for any org cannot see leads, deals, contacts, or any operational data. Verified by a negative integration test: seeded org has 1 lead node; the platform drill-down page renders with 0 lead-references.

### Home + audit

- [ ] **AC-9** GET `/platform` renders the amber "ZERO operational data access" banner + total-orgs and active-orgs counts (computed via service-role count queries; no per-org SELECT).
- [ ] **AC-10** GET `/platform/audit` lists 500 most-recent audit rows with org filter, action filter, and date range. Each row shows ts, actor_role, action, table_name, record_id, organization_id (with org name resolved).

### Placeholder pages

- [ ] **AC-11** `/platform/subscriptions`, `/platform/analytics`, `/platform/costs`, `/platform/tickets`, `/platform/settings` each render a heading + "Coming directive D-XXX" body. All gate on a permission via middleware-resolved set + `requirePermission` in the page's metadata loader.

### Quality gates

- [ ] **AC-12** `npm run build` compiles (Next.js Turbopack); 11 routes incl. middleware unchanged + 10 new platform pages.
- [ ] **AC-13** All untagged tests pass; D-001 + D-002 + D-003 suites still green.
- [ ] **AC-14** Coverage ≥ 80% / ≥ 90% on `src/lib/platform/` and `src/app/(platform)/`.
- [ ] **AC-15** Two new E2E specs pass: `/platform/organizations/new` end-to-end (super_admin signs in, fills form, submits, lands on detail page); `/platform/organizations/[id]` shows zero lead references.

---

## Data model

### Migration `20260507150000_subscriptions.sql`

```sql
CREATE TABLE subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  plan_tier       text NOT NULL CHECK (plan_tier IN
                  ('starter','professional','enterprise','custom')),
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
  starts_at       timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NULL,
  notes           text NULL,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL,
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Org-scoped read; service-role writes only (provisioning + plan changes).
CREATE POLICY subscriptions_select_org ON subscriptions
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

NOTIFY pgrst, 'reload schema';
```

### Migration `20260507150100_support_tickets.sql`

```sql
CREATE TABLE support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  raised_by       uuid NOT NULL REFERENCES profiles(id),
  subject         text NOT NULL,
  body            text NOT NULL,
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','responded','closed')),
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL,
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_select_org ON support_tickets
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY tickets_insert_org ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
```

> Note: super_admin sees zero rows from BOTH new tables in normal authenticated
> reads. Platform-side tickets surface (D-XXX) will use the service-role
> admin client and write `audit_log.action='read_sensitive'` per
> Constitution VII.

---

## API contracts

### `src/lib/platform/provision.ts`

```ts
export const provisionOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
  rera_number: z.string().optional(),
  gstin: z.string().optional(),
  primary_contact_email: z.string().email(),
  primary_contact_name: z.string().min(1),
  primary_contact_phone: z.string().optional(),
  plan_tier: z.enum(["starter", "professional", "enterprise", "custom"]),
});

export type ProvisionInput = z.infer<typeof provisionOrganizationSchema>;

export async function provisionOrganization(
  user: CurrentUser,
  input: ProvisionInput
): Promise<{ organization_id: string; org_admin_user_id: string; magic_link_sent: boolean }>;
```

The function:

1. `requirePermission(user, 'organizations:create')` — throws `PermissionDenied` if the user isn't super_admin.
2. Validates input via Zod.
3. Uses the service-role admin client to perform inserts in order. On any step failure, runs compensating deletes for already-inserted rows (no Postgres transaction; Supabase JS client doesn't expose them — manual rollback).
4. Sends invite via `auth.admin.inviteUserByEmail` AFTER profile creation, so the `custom_access_token_hook` finds a profile during the user's first sign-in.
5. Writes one consolidated `audit_log` row.

### `/platform/organizations/new` server action

```tsx
"use server";
async function action(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const parsed = provisionOrganizationSchema.safeParse(toObject(formData));
  if (!parsed.success) return { errors: parsed.error.format() };
  const { organization_id } = await provisionOrganization(user, parsed.data);
  redirect(`/platform/organizations/${organization_id}`);
}
```

### `src/lib/platform/queries.ts` (read-only helpers used by pages)

```ts
export async function listOrgs(filters: { search?: string; limit?: number; offset?: number }): Promise<OrgRow[]>;
export async function getOrgDetail(id: string): Promise<OrgDetail>;
export async function platformCounts(): Promise<{ total: number; active: number; org_admin_count: number }>;
export async function recentAuditRows(filters: AuditFilters, limit: number): Promise<AuditRow[]>;
```

All use the service-role admin client. Each call writes one `audit_log` row with `action='read_sensitive'` per Constitution VII when super_admin reads operational metadata, EXCEPT pure aggregations (counts) which are not sensitive.

---

## UI surface

### Layout

`src/app/(platform)/layout.tsx` — wraps every `/platform/*` page with:
- Top bar with "Platform" branding + sign-out.
- Amber banner: "Builtrix internal platform. ZERO operational data access inside any organization."
- Left nav: Home / Organizations / Subscriptions / Analytics / Audit / Costs / Tickets / Settings.

### shadcn primitives needed

- Button, Input, Label, Card, Badge, Separator, Table, Form (react-hook-form via shadcn integration), Dialog, Toast (sonner — already in package.json).

Install via `bash scripts/v5/install-shadcn.sh` (or the manual `npx shadcn` command).

### Pages

| Path | Type | Role gate | Content |
|---|---|---|---|
| `/platform` | Server | super_admin | Banner + 3 KPI cards (Total orgs / Active / Org admins) |
| `/platform/organizations` | Server | super_admin | Table + search input |
| `/platform/organizations/new` | Server (form) | super_admin | Provisioning form, server action |
| `/platform/organizations/[id]` | Server | super_admin | 4 sections stacked |
| `/platform/audit` | Server | super_admin | Filterable list, 500 most-recent |
| `/platform/subscriptions` | Server | super_admin | Placeholder w/ plan-tier copy |
| `/platform/analytics` | Server | super_admin | Placeholder |
| `/platform/costs` | Server | super_admin | Placeholder |
| `/platform/tickets` | Server | super_admin | Placeholder |
| `/platform/settings` | Server | super_admin | Placeholder |

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | Atomic provisioning without DB transactions in Supabase JS. | Manual compensating deletes on partial failure; tests assert "after failure of step N, rows from steps 1..N-1 are gone". |
| RQ-2 | `auth.admin.inviteUserByEmail` may rate-limit on Supabase free tier. | Check tier limits; fall back to `auth.admin.createUser({ email_confirm: false }) + generateLink`. |
| RQ-3 | shadcn install is the first time on this repo; could conflict with existing globals.css / Tailwind v4 setup. | Plan: do the install in its own commit (Group B), verify build, then build Group C on top. |
| RQ-4 | Constitution IX bans tabs; PRD §4.3 mentions tabs in the drill-down. | Plan picks **stacked sections**. Documented in directive Notes for Plan Mode. |
| RQ-5 | super_admin reading `profiles WHERE organization_id=$id` requires the service-role admin client. Should this also be audited as `read_sensitive`? | Yes — every super_admin read of profiles writes one `audit_log` row with `action='read_sensitive'`, `record_id=null`, `diff={kind:'list_admins',org_id:$id}`. |
| RQ-6 | Form validation UX — server-side validation only, or also client-side? | Server-side only for D-004 (Server Actions return errors). Client-side comes when shadcn Form + react-hook-form is wired in D-005. |
| RQ-7 | Plan-tier resource limits (max users, leads/mo) — when do they enforce? | D-004 records the plan_tier; enforcement happens later (D-009 token cap, D-005 user/workspace limits). Stub for now. |
