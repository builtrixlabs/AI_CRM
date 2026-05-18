# v2 acceptance runner

End-to-end smoke + walkthrough against a Vercel preview URL.

## Files

- [tests/e2e/v2-acceptance.spec.ts](../../tests/e2e/v2-acceptance.spec.ts) — the Playwright spec.
- [scripts/v2-acceptance/run.sh](run.sh) — convenience wrapper that wires env + runs the seeder + invokes Playwright.

## Required env

| Var | What |
|---|---|
| `PLAYWRIGHT_BASE_URL` | Preview deploy URL (e.g. `https://ai-xxxx-builtrixlabs-projects.vercel.app`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (to provision throwaway test orgs) |

## Optional env

| Var | What |
|---|---|
| `TEST_SUPER_ADMIN_EMAIL` | Pre-existing super_admin email — enables the authenticated `/platform/*` walkthrough |
| `TEST_SUPER_ADMIN_PASSWORD` | That account's password |
| `SKIP_SEED=1` | Skip `npm run demo:seed` if the target Supabase is already seeded |

## What gets verified

### Phase 1 — public smoke (always runs)
- `/` redirects to a known route (`/auth/sign-in` or a role landing).
- `/auth/sign-in` renders the email + password form.
- `/api/auth/rate-check` rate-limits after 5 hits (D-210 in-memory bucket).
- `/auth/mfa` is reachable (D-209 stub).

### Phase 2 — super_admin walkthrough (skipped without creds)
- Walks every `/platform/*` surface end-to-end:
  `/platform`, `/platform/organizations`, `/platform/subscriptions`,
  `/platform/analytics`, `/platform/costs`, `/platform/tickets`,
  `/platform/settings`, `/platform/audit`, `/platform/settings/secrets`.
- For each: asserts the page heading + at least one expected interactive
  element (button, link, status pill).
- Provisions a throwaway test org so the surfaces have data to render
  beyond the seeded demo. Soft-deletes it on teardown.
- Click-through on first ticket → detail thread (D-206).

### Phase 3 — connectivity sanity (always runs)
- Confirms the deploy can SELECT from `organizations` via the service-role
  key (catches misconfigured env on the preview deploy).

## Run

```sh
# From repo root, with env exported (or set in .env.local):
bash scripts/v2-acceptance/run.sh
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All Phase 1 + Phase 3 tests passed, plus Phase 2 if creds available |
| 1 | At least one test failed — see Playwright output for which |
| 2 | Required env var missing |

## Reusing for v3 / future

The spec is expected to **grow**, not be rewritten. When a new directive ships
a surface, append a new `test()` block to the appropriate `describe()`.
Skip blocks are preferred over conditional logic — keeps green runs honest.
