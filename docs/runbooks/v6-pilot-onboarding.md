# V6 Pilot Onboarding Runbook

**Audience:** Builtrix operator (super_admin) onboarding a V6 presales-engagement pilot org.
**Time budget:** ~45 minutes from "org accepted" to "first MIH lead engaged end-to-end".
**Status:** PLANNING — applies once V6 reaches Gate 4 (Phase 4 complete). Not live until then.
**Authority:** [`docs/PRD-v6.0.md`](../PRD-v6.0.md) §10 (pilot acceptance scenario). This runbook expands the PRD's 18-step scenario into an operator procedure. Supersedes `docs/runbooks/pilot-onboarding.md` (V0) for V6 pilots.

> The PRD §10 scenario is also the **V6 acceptance Playwright test** (`tests/e2e/v6-acceptance.spec.ts`). If a pilot customer can run this end to end with **zero engineer in the loop**, V6 is GA-ready.

---

## 0. Pre-flight

Before starting, confirm:

- [ ] Vercel deploy is green on the `v6` branch (preview URL reachable).
- [ ] Supabase project is unpaused; all V6 migrations applied (`docs/V6_STATUS.md` §8 all `applied`).
- [ ] Inngest dashboard shows the V6 functions registered, including `lead-enrichment-on-create`, the allocation-engine handler (D-610), and `call.next_best_action` handlers (D-600, D-601).
- [ ] You are signed in as a user with `base_role='super_admin'`.
- [ ] Baseline 122 (MIH inbound contract) is signed off and the MIH sister product is reachable.

---

## 1. Provision the org (PRD §10 step 1)

Navigate to `<preview-url>/platform/organizations/new`.

- **Slug** — `demo-builders` style (lowercase, dashes, unique).
- **Name** — "Demo Builders Pvt Ltd" (display).
- **Plan tier** — `starter` is fine for a V6 pilot.
- **Primary contact email** — the org_owner's email.

Submit → redirects to `/platform/organizations/<id>`. Audit log carries `action='org_provisioned'`.

---

## 2. Org admin onboarding (PRD §10 step 2)

The org_owner signs in (magic link), lands on `/admin`, runs the onboarding wizard:

1. **Org details** — set RERA + GSTIN.
2. **Users** — add 5: 1 `manager`, 2 `presales_rep`, 1 `sales_rep`, 1 `site_visit_coordinator`. Each gets a magic link.
3. **Integrations** (wizard step 7) — connect all four channels, per-org credentials, entered in-app by the org_admin (never the operator — see `memory/per_org_integration_model.md`):
   - **Resend** — `/admin/integrations/email` → test-ping must pass.
   - **MSG91** — `/admin/integrations/sms` → register at least one DLT template.
   - **Exotel** — `/admin/integrations/telephony` → test-ping must pass.
   - **WhatsApp (Gupshup)** — `/admin/integrations/whatsapp` → provider = Gupshup, approved template IDs entered.
   - Confirm `/admin/integrations` health badges all show ✓ Healthy.
4. **Brochures** — `/admin/brochures` → upload 2 PDFs (3BHK floor plan + price sheet), tagged to "Demo Project A" with `document_type`, `bhk=3`, `budget_band=1.5-2Cr`.

---

## 3. Grant MIH a sister-product token (PRD §10 step 3)

`/platform/sister-products` → issue a token for this org with `product_kind='marketing_intelligence_hub'`. Plaintext is shown **once** — copy it and hand it to the MIH team. They authenticate `POST /api/sister/v1/leads` with it (baseline 122).

---

## 4. Manager configuration (PRD §10 step 4)

The `manager` signs in (lands on `/dashboard?team=<their-team>`) and configures:

- **Allocation rule** — `/admin/allocation-rules` → create "any lead from MIH → round-robin among presales reps" (D-610).
- **Project ↔ sales mapping** — `/admin/projects/<demo-project-a>/sales-team` → add Sales Rep R, mark **primary** for "Demo Project A" (D-608).
- **Brochure agent policy** — `/admin/agents/policies` → set `brochure_send` to `auto_send` (D-614). Leave `site_visit_booking` at `require_approval`.

---

## 5. The end-to-end loop (PRD §10 steps 5–17)

This is what the pilot customer runs unaided. Watch each handoff:

| # | Action | Expected | Watch |
|---|---|---|---|
| 5 | MIH POSTs a curated lead (name, phone, `source=meta_lead_ads`, BHK=3, budget=1.5-2Cr, project_interest=Demo Project A) | `201 { lead_id, status:'created', allocated_to_user_id }` within 200ms p95 | `event_inbox_log` row `source_product='marketing_intelligence_hub'` |
| 6 | — | Lead allocated to Presales Rep P within 5 sec; appears on P's `/dashboard` | D-610 allocation audit row |
| 7 | Presales Rep P opens the lead canvas, clicks **Call** | Exotel rings P's phone + the customer's phone | `call.initiated` activity node within 5 sec |
| 8 | Call completes; Voice IQ posts `call.next_best_action` with `kind=send_brochure` (project=Demo A, bhk=3, budget=1.5-2Cr) | inngest `call.next_best_action` handler fires the Brochure Agent | `event_inbox_log` |
| 9 | Brochure Agent runs | Picks the 3BHK floor plan; drafts a WhatsApp body with the lead's first name + project name | `agent_approval_queue` row `kind='brochure_send'` |
| 10 | Auto-send policy is on | WhatsApp delivers to the customer within 30 sec | activity node on send, full provenance |
| 11 | Customer replies on WhatsApp asking for a Saturday-afternoon site visit | WhatsApp inbound handler ingests | `whatsapp_inbound_log` |
| 12 | Voice IQ / WhatsApp inbound posts `call.next_best_action` with `kind=book_site_visit` | Site Visit Agent creates a `site_visits` draft row | `agent_approval_queue` row `kind='site_visit_booking'` |
| 13 | — | A "Book Site Visit" action card surfaces for Presales Rep P | `/admin/agents/queue` |
| 14 | P fills cab details (driver name, phone, vehicle, pickup address, time) and submits | Visit transitions `draft → scheduled` within 60 sec | `site_visits` row updated |
| 15 | — | Cab WhatsApp message sent to the customer with all cab details | activity node "customer notified" |
| 16 | — | Sales Rep R (primary for Demo Project A) notified of the upcoming visit | D-619 notification |
| 17 | Site Visit Coordinator opens `/dashboard/site-visits` | Sees the visit with status `scheduled` | — |

---

## 6. What to watch (first 24h)

| Surface | What to watch | Action if it goes wrong |
|---|---|---|
| `event_inbox_log` | MIH POSTs arriving; `status='deduped'` on retries | `status='error'` → handler exception; check route logs |
| D-610 allocation audit | One row per lead: `{rule_id, lead_id, target_user_id}` | Empty → no rule matched; lead in `/dashboard/leads/unassigned` |
| `agent_approval_queue` | Rows with `kind` in `brochure_send` / `site_visit_booking` | `error='no_match'` → no matching brochure; operator notified |
| Integration health badges | All four channels ✓ Healthy on `/admin/integrations` | ⚠ Degraded → credentials or provider issue; check per-channel test-ping |
| Inngest dashboard | `call.next_best_action` handlers completing | Failures → check the agent run logs + `token_usage_ledger` |
| `audit_log` | New rows for every state change + agent action | Empty → app path not writing audit |
| Vercel deploy logs | No 5xx; canvas p95 < 1.5s, MIH inbound p95 < 200ms | Investigate; check per-branch env vars are synced |

---

## 7. What's intentionally not in V6 (set expectations)

Tell the pilot org_owner up-front (PRD §0 scope cuts + §4 out-of-scope):

- **No cab-booking API** — the coordinator/rep enters driver + vehicle manually. Uber for Business / Ola Corporate is V6.x.
- **No post-sales / booking pipeline / demand letters / possession tracking** — V6 is presales + sales engagement only.
- **No inventory / unit listing** — RE Inventory module was removed.
- **No source-specific connectors in the CRM** — leads arrive curated from MIH; the universal webform endpoint is the only fallback.
- **No native mobile app** — V6 ships a mobile-*responsive* web surface (D-621), not a native app.
- **No calendar sync** for site visits — V6.x.
- **Channel Partner portal is dormant** — `channel_partner` role returns 401.

---

## 8. Smoke test

After step 17 succeeds, the V6 acceptance criteria (PRD §5 gates + §10 scenario) are the smoke test. All 18 PRD §10 steps must pass with zero engineer involvement before declaring the pilot live. The automated mirror is `tests/e2e/v6-acceptance.spec.ts` (built in Phase 5, step 5.3).
