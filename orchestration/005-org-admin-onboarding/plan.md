## Plan — 005-org-admin-onboarding

## Files to be created

### Migration
| File | Lines (~) | Purpose |
|---|---|---|
| `supabase/migrations/20260507160000_organizations_branding.sql` | 5 | adds `branding jsonb NOT NULL DEFAULT '{}'` |

### Library
| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/admin/types.ts` | 60 | StepId, OnboardingState, CockpitData |
| `src/lib/admin/onboarding.ts` | 280 | step IDs, hard-gate set, Zod payload schemas, getOnboardingState, advanceStep, OnboardingHardGateError |
| `src/lib/admin/cockpit.ts` | 80 | getCockpitData (subscription + usage counts + onboarding state) |
| `src/lib/admin/index.ts` | 20 | re-exports |

### App routes
| File | Lines (~) | Purpose |
|---|---|---|
| `src/app/(admin)/layout.tsx` | 60 | shared admin shell — top bar, left nav, container |
| `src/app/(admin)/admin/page.tsx` | 200 | cockpit (3 rows × 4 cards + onboarding banner) |
| `src/app/(admin)/admin/onboarding/page.tsx` | 250 | wizard shell + step component switch |
| `src/app/(admin)/admin/onboarding/actions.ts` | 200 | one server action per step (8 actions) |
| `src/app/(admin)/admin/onboarding/_steps/{1-org-details,2-branding,3-workspace,4-lead-sources,5-pipeline,6-team-users,7-integrations,8-demo}.tsx` | ~80 each | 8 client step components |
| `src/app/(admin)/admin/{dashboards,tables,agents,directives}/page.tsx` | 20 each | placeholder cards' targets |
| `src/app/(settings)/settings/{users,integrations}/page.tsx` | 20 each | placeholder cards' targets |

### Tests
| File | Type | Lines (~) | Purpose |
|---|---|---|---|
| `tests/lib/admin/onboarding.test.ts` | unit | 250 | step schemas accept/reject, advanceStep happy + skip-on-hard-gate throws + already-completed no-ops + writes audit |
| `tests/lib/admin/cockpit.test.ts` | unit | 100 | mocked supabase: getCockpitData shape, counts |
| `tests/integration/onboarding-flow.test.ts` | integration | 200 | seed an org, walk all 8 steps via advanceStep against bwumqahgwobwghlmzcrl; assert onboarding_state.completed=true at the end + 8 audit rows |
| `tests/integration/admin-routes-rls.test.ts` | integration | 80 | cross-tenant org_admin can't see another org's cockpit data |

## Files to be modified

| File | Change |
|---|---|
| `package.json` | no new deps (zod / @supabase/supabase-js / shadcn primitives reused) |

## Coverage estimate

- **Lines** ≥ 80 % on `src/lib/admin/`. Realistic 88 %.
- **Branches** ≥ 90 %. Realistic 93 % (many small branches in advanceStep state-machine path).

## Risks (for Plan Mode reviewer)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | Wizard ships ~12 routes + ~8 step components — large surface for a single directive. | Med | Step components are shallow (forms + Submit). Tests at the action layer; UI is mostly visual. |
| P-2 | Step 6 reuses `auth.admin.createUser` for invites — D-004's same rate-limit / domain risk applies. | Low | Inline error surfacing; one invite at a time on submit. |
| P-3 | onboarding_state JSONB shape isn't enforced by DB. Drift between TS Zod and DB could cause silent corruption. | Low | All reads route through `getOnboardingState` which Zod-parses; unknown fields stripped. |
| P-4 | The org_admin viewing the cockpit triggers many queries (subscription, profiles count, workspaces count, leads count, tickets count) — 5+ round-trips. | Low | Acceptable for V0 (org_admin traffic is low). Optimize with a single PG function if D-014 hardening flags it. |
| P-5 | Step 1 form pre-fills the existing org meta from D-004 provisioning. If the org_admin edits a hard-gated value (e.g. RERA), audit needs the BEFORE/AFTER diff. | Med | `advanceStep` reads existing org row, merges payload, writes diff with both sides. |
| P-6 | Pipeline stages are V0-fixed (7 stages). User can't re-order or rename. | Low | Documented in directive. D-007 lead lifecycle ships customisation. |

## Out-of-scope reaffirmation

D-005 does NOT ship:
- Custom dashboard builder (D-114)
- Custom fields engine (D-112)
- Agent provisioning UI (D-009)
- Directive authoring UI (D-011)
- Real integration setup (separate directives)
- File upload for branding logo (later)
- Pipeline customisation (D-007)
- > 3 invite users in step 6
