# Spec — 005-org-admin-onboarding

## Acceptance criteria

### Cockpit (`/admin`)

- [ ] **AC-1** GET `/admin` (org_admin) renders 3 rows × 4 cards = 12 cards total.
- [ ] **AC-2** Subscription card shows the live `subscriptions.plan_tier` for the org + status badge.
- [ ] **AC-3** Plan usage card shows live counts: active users (profiles in org), workspaces (workspaces in org), leads/mo (nodes WHERE node_type='lead' AND created_at > now()-30d), AI tokens — TBD (placeholder showing `0 / cap`).
- [ ] **AC-4** Support card shows `support_tickets WHERE org_id=$id AND status='open'` count, with a "File new" link to `/admin/support/new` (placeholder).
- [ ] **AC-5** Users card shows count of profiles in the org + link to `/settings/users` (placeholder; full users table is D-XXX).
- [ ] **AC-6** Integrations / App access cards link forward (placeholders) without error.
- [ ] **AC-7** Customization-row cards (Dashboards / Tables / Agents / Directives) link forward to `/admin/dashboards`, `/admin/tables`, `/admin/agents`, `/admin/directives` — each placeholder pages with "Coming directive D-XXX" copy.
- [ ] **AC-8** When `organizations.onboarding_state.completed = false`, an amber dismissable banner shows "Resume onboarding · step N of 8" linking to `/admin/onboarding`.
- [ ] **AC-9** All 12 cards work for any org_admin signed in for that org. Cross-tenant: rep / sales_rep / channel_partner attempting `/admin` is redirected by middleware (already enforced D-001).

### Wizard (`/admin/onboarding`)

- [ ] **AC-10** GET `/admin/onboarding` renders the wizard with the current step inferred from `onboarding_state.current_step`.
- [ ] **AC-11** Steps **1 (Org details)** and **3 (First workspace)** are hard-gated — "Next" advances only if Zod validation passes.
- [ ] **AC-12** Steps 2, 4, 5, 6, 7, 8 have a "Skip for now" button that records the step as `skipped` but advances.
- [ ] **AC-13** Each advance writes exactly one `audit_log` row with `action='onboarding_step_completed'` (or `action='onboarding_step_skipped'`) and `diff: { step: N, payload: ... }`.
- [ ] **AC-14** When the user reaches step 8 and clicks "Finish", `onboarding_state.completed` flips to `true`, `current_step` is set to `'completed'`, and the user is redirected to `/admin` with a success toast.
- [ ] **AC-15** If the user reloads or returns later, `current_step` is restored to the last step they were on (the step itself is the next one to complete, not a previously completed one).

### Step persistence (per-step contract)

| Step | Persists to | Hard-gate? |
|---|---|---|
| 1. Org details | `organizations.{rera_number, gstin, primary_contact_email, primary_contact_name}` | Yes |
| 2. Branding | `organizations.branding jsonb` (new column: `{ primary_color?, accent_color?, logo_url? }`) | No |
| 3. First workspace | `workspaces.{slug, name}` of the default workspace | Yes |
| 4. Lead sources | `organizations.onboarding_state.lead_sources: string[]` (subset of: 90sec, magicbricks, housing, facebook, walkin, channel_partner, mih, other) | No |
| 5. Pipeline stages | `organizations.onboarding_state.pipeline_stages: string[]` — V0 ships the default 7 fixed stages; user clicks "Looks good" to confirm | No |
| 6. Add team users | `profiles` rows + Supabase Auth users via `auth.admin.createUser + generateLink` (reuses provision-with-manual-rollback). Up to 3 users; emails + display names + base_role per row. | No |
| 7. Configure integrations | `organizations.onboarding_state.integrations: { email?, whatsapp?, telephony? }` — names of providers selected; real wiring is later directives | No |
| 8. Sample lead demo | No DB writes — the page renders a fixture lead and walks the user through stage transitions (visual only) | No |

### Quality gates

- [ ] **AC-16** All untagged tests pass; D-001/D-002/D-003/D-004 suites still green.
- [ ] **AC-17** Coverage ≥ 80 / ≥ 90 on `src/lib/admin/`.
- [ ] **AC-18** `npm run build` ✓.

---

## Data model

### Migration `20260507160000_organizations_branding.sql`

```sql
ALTER TABLE organizations
  ADD COLUMN branding jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
```

The `onboarding_state` jsonb column already exists from D-001. Its shape now expands:

```jsonc
{
  "completed": false,
  "current_step": "org_details",         // one of the step ids
  "completed_steps": [],                  // array of step ids
  "lead_sources": [],                     // step 4
  "pipeline_stages": [...defaults],       // step 5
  "integrations": {                       // step 7
    "email": null, "whatsapp": null, "telephony": null
  }
}
```

> No DB CHECK on the jsonb shape — Zod schema (`OnboardingStateSchema`) is the contract; tests assert it.

---

## API contracts

### `src/lib/admin/onboarding.ts`

```ts
export const STEP_IDS = [
  "org_details",          // 1 — hard gate
  "branding",             // 2
  "first_workspace",      // 3 — hard gate
  "lead_sources",         // 4
  "pipeline_stages",      // 5
  "team_users",           // 6
  "integrations",         // 7
  "sample_demo",          // 8
] as const;

export type StepId = (typeof STEP_IDS)[number];

export const HARD_GATED_STEPS: ReadonlySet<StepId> = new Set([
  "org_details",
  "first_workspace",
]);

export type OnboardingState = {
  completed: boolean;
  current_step: StepId | "completed";
  completed_steps: StepId[];
  lead_sources: string[];
  pipeline_stages: string[];
  integrations: { email?: string; whatsapp?: string; telephony?: string };
};

export const onboardingStateSchema: z.ZodSchema<OnboardingState>;

export async function getOnboardingState(org_id: string): Promise<OnboardingState>;

export async function advanceStep(input: {
  org_id: string;
  actor: string;
  step: StepId;
  payload: unknown;
  skipped?: boolean;
}): Promise<{ next_step: StepId | "completed"; completed: boolean }>;
```

`advanceStep`:
1. Loads current state.
2. If `skipped=true` and step is in `HARD_GATED_STEPS` → throw `OnboardingHardGateError`.
3. Validates `payload` against the per-step Zod schema (`stepPayloadSchemas[step]`).
4. Persists payload to the right table (organizations, workspaces, or onboarding_state jsonb).
5. Appends `step` to `completed_steps`. Sets `current_step` to the next step (or `"completed"` if last).
6. If `current_step === "completed"`, sets `completed=true`.
7. Writes one `audit_log` row.

### Per-step payload schemas

```ts
export const stepPayloadSchemas: Record<StepId, z.ZodSchema> = {
  org_details: z.object({
    rera_number: z.string().optional(),
    gstin: z.string().optional(),
    primary_contact_email: z.string().email(),
    primary_contact_name: z.string().min(1),
  }).strict(),

  branding: z.object({
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logo_url: z.string().url().optional(),
  }).strict(),

  first_workspace: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
    name: z.string().min(1).max(80),
  }).strict(),

  lead_sources: z.object({
    sources: z.array(z.enum(LEAD_SOURCES)).min(1),
  }).strict(),

  pipeline_stages: z.object({
    confirmed: z.literal(true),
  }).strict(),

  team_users: z.object({
    invites: z.array(z.object({
      email: z.string().email(),
      display_name: z.string().min(1),
      app_role: z.enum(["manager", "sales_rep", "read_only", "channel_partner"]),
    })).min(0).max(3),
  }).strict(),

  integrations: z.object({
    email: z.enum(["smtp", "resend", null]).nullable(),
    whatsapp: z.enum(["meta", "gupshup", "wati", null]).nullable(),
    telephony: z.enum(["exotel", "myoperator", "knowlarity", null]).nullable(),
  }).strict(),

  sample_demo: z.object({
    walked_through: z.literal(true),
  }).strict(),
};
```

### Cockpit data fetcher

```ts
export type CockpitData = {
  subscription: { plan_tier: string; status: string };
  usage: { active_users: number; workspaces: number; leads_30d: number };
  open_tickets: number;
  user_count: number;
  workspace_count: number;
  onboarding: { completed: boolean; current_step: StepId | "completed" };
};

export async function getCockpitData(org_id: string): Promise<CockpitData>;
```

---

## UI surface

### `/admin` (Server Component)

3 rows × 4 cards using shadcn `Card`. Each card has a heading + body + optional CTA. Dismissable banner above the rows when `!cockpit.onboarding.completed`.

### `/admin/onboarding` (Server Component shell + Client step components)

Single page, single step rendered at a time. Each step is a small Client Component that submits via a Server Action. Wizard chrome (step indicator, Back/Skip/Next/Finish buttons) is shared.

### Placeholder targets

- `/admin/dashboards`, `/admin/tables`, `/admin/agents`, `/admin/directives` — 20-line "Coming directive D-XXX" pages.
- `/settings/users`, `/settings/integrations` — 20-line placeholders. (`/settings` namespace introduced here.)

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | The wizard's per-step Server Actions could call `auth.admin` heavily on step 6 (3 invites). Supabase free-tier rate limits. | Use createUser + generateLink (no email-sending) like D-004. Surface any rate-limit error inline. |
| RQ-2 | onboarding_state mutations from concurrent tabs could clobber each other. | The advance is by step ID; idempotent if the same step ID is submitted twice (the second writes a duplicate audit row but the state machine doesn't regress). |
| RQ-3 | A user closes the tab mid-wizard. | `current_step` is set BEFORE persisting the form data (no — actually after, on success). On reload, the wizard restarts at the LAST UNCOMPLETED step. |
| RQ-4 | `branding.logo_url` requires file upload that we don't support yet. | V0 accepts a URL string; full Supabase Storage upload lands in a later directive. |
| RQ-5 | Step 6 invites users with `app_role` (not base_role). The bridge table user_app_roles requires a workspace_id. | We pick the org's first workspace (created at provisioning) as the default scope. The org_admin can re-scope users in `/settings/users` later. |
| RQ-6 | Onboarding state is org-wide; if the org has 2 org_admins they could fight over the wizard. | Acceptable for V0; a "lock" can come later. |
| RQ-7 | Step 8 (sample demo) doesn't actually call createNode. Should it? | No — fictional data shouldn't pollute the org's real `nodes` table. Demo is purely visual. |
