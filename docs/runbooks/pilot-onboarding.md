# Pilot Onboarding Runbook (V0)

**Audience:** Builtrix operator (super_admin) onboarding the
first paying pilot org.
**Time budget:** 30 minutes from "org accepted" to "first lead
on canvas."
**Status:** Active — applies to V0 (D-001 → D-014).

---

## 0. Pre-flight

Before starting, confirm:

- [ ] Vercel deploy is green on the `v1` branch (preview URL
      reachable).
- [ ] `bash scripts/v5/check-prereqs.sh --strict` exits 0
      locally.
- [ ] Supabase project is unpaused (`supabase projects list`).
- [ ] Inngest dashboard shows the four registered functions:
      `embedding-refresh`, `lead-enrichment-on-create`,
      `doe-on-lead-created`, `site-visit-window-sweep`.
- [ ] You (the operator) are signed in as a user with
      `base_role='super_admin'`. If not, run
      `bash scripts/bootstrap-super-admin.sh <your-email>` once.

---

## 1. Provision the org

### 1.1 Open the platform surface

Navigate to `<preview-url>/platform/organizations/new`.

### 1.2 Fill the form

- **Slug** — `lodha-bangalore` style (lowercase, dashes, unique).
- **Name** — "Lodha Bangalore Sales" (display).
- **Plan tier** — `professional` for a paying pilot. (`starter`
  also valid.)
- **Primary contact email** — the org_owner's email.
- **RERA number** / **GSTIN** — optional V0 fields.

Submit. The page redirects to `/platform/organizations/<id>`.
Audit log carries one row with `action='org_provisioned'`.

### 1.3 Provision the org_owner

In the same surface, "Add user" → enter the org_owner's email +
`base_role='org_owner'`. Supabase Auth sends a magic link.

The new user signs in, lands on `/admin` (the org_admin cockpit).

---

## 2. Run the onboarding wizard (8 steps)

The org_owner clicks "Onboarding" (or the cockpit auto-redirects).
Steps:

1. **Org details** — confirm pre-filled fields.
2. **Workspaces** — at least one ("Bangalore Sales").
3. **Teams** — at least one ("Inside Sales").
4. **Sales reps** — invite by email. Each gets a magic link to
   `app_role='sales_rep'`.
5. **Lead sources** — pick from `magicbricks`, `housing`,
   `90sec`, `facebook`, `walkin`, `channel_partner`, `mih`.
6. **Lead pipeline** — confirm the default lead states (V0 ships
   the canonical lifecycle; customization is V1).
7. **Demo lead** — the wizard creates a synthetic lead so the
   rep sees the canvas immediately.
8. **Activate** — sets `onboarding_state.completed_steps` to all
   8.

Steps **1** and **3** are hard-gated; everything else is
skippable.

---

## 3. WhatsApp + Call Audit integration (optional in V0)

### 3.1 WhatsApp endpoint

Insert one row into `org_whatsapp_endpoints` for the org with
the org's chosen workspace as `workspace_default_id`. Provide a
SHA-256 hash of the shared secret in `secret_sha256`.

```sql
INSERT INTO org_whatsapp_endpoints
  (organization_id, workspace_default_id, secret_sha256,
   created_by, updated_by)
VALUES
  ($org_id, $workspace_id, encode(sha256('the-secret'::bytea), 'hex'),
   $super_admin_id, $super_admin_id);
```

Set `WHATSAPP_WEBHOOK_SECRET=the-secret` in Vercel env vars
(production scope) and redeploy.

### 3.2 Call Audit endpoint

Set `BUILTRIX_EVENT_INBOX_SECRET=<value>` in Vercel env vars.
Hand the value + the `/api/events/inbox` URL to the Call Audit
team.

---

## 4. First lead via Cmd+K

The pilot rep signs in, lands on `/dashboard`. Press `Cmd+K` (or
`Ctrl+K`) → "Create lead". Fill phone + source. Submit.

You should see:
- Lead canvas at `/dashboard/leads/<id>`.
- Activity Stream empty.
- Within ~10s: an "Lead enrichment" activity row appears with a
  `T1` agent badge and an `intent_score` populated on the canvas.

If the score doesn't appear in 30s:
- Open Inngest dashboard, look for `lead-enrichment-on-create`
  failure.
- If `gateway` errored, check `token_usage_ledger` for the row
  and `error_code`.

---

## 5. What to watch (first 24h)

| Surface | What to watch | Action if it goes wrong |
|---|---|---|
| Inngest dashboard | All 4 functions show "completed" runs | Check function logs; rate of failure |
| `audit_log` table | New rows arriving for every state change + agent action | Empty → app code path not writing audit; check server actions |
| `token_usage_ledger` | Per-org rows accumulating; status='ok' majority | Burst of `error_code='budget'` → user is over cap |
| `directive_invocations` | D-01 fires on each lead.created; D-15 selectively | Empty → DOE not wired |
| `whatsapp_inbound_log` | Rows for every webhook POST | Burst of `status='rejected'` → signature mismatch |
| `event_inbox_log` | Rows for Call Audit pushes | `status='deduped'` good; `status='error'` → handler exception |
| Vercel deploy logs | No 5xx; p95 < 1.5s on canvas page | Investigate; D-014 hardening locked the budget |

---

## 6. What's intentionally not in V0 (set expectations)

Per `docs/architecture.md` §7:

- Real outbound WhatsApp send (D-016 parked; reminders write
  activity nodes only).
- Google Calendar OAuth + slot-block (templated reminders only).
- T3 approval queue UI (runtime stamps `pending_approval`; no
  surface to act on it yet).
- Org-admin authoring UI for custom directives (15 platform
  defaults seeded; no UI to add per-org rows yet — must be done
  via SQL in V0).

Tell the pilot org_owner this up-front. V1 closes them.

---

## 7. Smoke test

After step 4 succeeds, run the
[pilot smoke test](./pilot-smoke-test.md). All checks must pass
before declaring the pilot live.
