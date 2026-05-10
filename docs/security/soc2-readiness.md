# SOC 2 readiness checklist — Builtrix CRM v3.0

**Date:** 2026-05-10
**Scope:** SOC 2 Type 1 prelim package. Full Type 2 engagement is operator-led post `v3.0` tag — this document is the **prelim auditor pack**.

The 5 SOC 2 Trust Service Criteria (TSC) categories. For each control we list: (a) where the audit evidence lives, (b) responsible party (operator vs. system), (c) maturity level (1 = ad hoc, 2 = defined, 3 = managed/enforced).

---

## Security (mandatory)

| Control | Evidence location | Responsible | Maturity |
|---|---|---|---|
| **CC6.1** Logical access requires authentication | `src/middleware.ts`, `src/lib/auth/route-policy.ts`, `tests/lib/auth/route-policy.test.ts` (40+ cases) | system | 3 |
| **CC6.1** MFA on sensitive admin routes | `src/lib/auth/totp.ts`, `src/lib/auth/route-policy.ts` (MFA gate), `directives/300-real-totp-mfa.md` | system | 3 |
| **CC6.1** Multi-instance rate-limit on auth | `src/lib/auth/rate-limit.ts` (KV-backed sliding-window-log) | system | 3 |
| **CC6.2** User access provisioning/deprovisioning | `/settings/users` (D-018), `profiles.deactivated_at`, `org_session_revocations` (D-302) | operator + system | 2 |
| **CC6.6** Boundary protection (RLS) | `tests/integration/rls-audit.test.ts`, every public table's RLS policy | system | 3 |
| **CC6.7** Encryption in transit | TLS via Vercel + Supabase managed; HSTS via Vercel default | system | 3 |
| **CC6.8** Encryption at rest | Supabase Postgres (cluster-level encryption); MFA secrets AES-256-GCM column-level (D-300) | system | 2 (column-level for sensitive only; full DB-level is Supabase-managed) |
| **CC7.1** Vulnerability scanning | `npx tsx scripts/secret-scanner.ts` per commit; `npm audit` per CI run | operator | 2 |
| **CC7.2** Security incident detection | `audit_log` append-only; Vercel deploy logs; Inngest dashboard for cron runs. **Sentry / OTEL is V3.x.** | operator | 1 |
| **CC7.3** Security incident response | `docs/runbooks/` per directive; `runbooks/hook-false-positive.md` | operator | 2 |
| **CC8.1** Change management | Git history + PR review; per-directive PR cadence (v3 plan §10) | operator | 3 |
| **CC9.2** Vendor management | List of subprocessors below. **Formal DPA per vendor is operator-led.** | operator | 1 |

### Subprocessors (CC9.2 evidence)

| Vendor | Service | Region | Data accessed |
|---|---|---|---|
| Vercel | Hosting / edge runtime | US default; can pin region | Request bodies + cookies (transient) |
| Supabase | Postgres + Auth | Mumbai (`bwumqahgwobwghlmzcrl`) | All tenant data (encrypted at rest) |
| Upstash (via Vercel KV) | Redis (rate-limit state) | Mumbai (recommended) | Hashed IPs + email keys (sliding-window log) |
| Stripe | Billing | Global | Customer email + card (Stripe-managed) |
| Inngest | Cron + queue | US default | Function invocation metadata |
| OpenAI | LLM (lead enrichment) | US | Per-lead text (PII-masked at our seam — `src/lib/nodes/text.ts`) |
| Anthropic | LLM (fallback) | US | Same masking applies |

---

## Availability

| Control | Evidence location | Responsible | Maturity |
|---|---|---|---|
| **A1.1** Capacity monitoring | Vercel deploy logs; Inngest dashboard for cron run history. **Per-route p95 dashboards are V3.x (D-330 non-goal).** | operator | 1 |
| **A1.2** Backup + recovery | Supabase managed daily backups (point-in-time recovery on Pro plan). **Operator confirms PITR enabled per Supabase project console.** | operator | 2 |
| **A1.3** Failover | Single-region Vercel + single-region Supabase (Mumbai). Multi-region failover V3.x. | operator | 1 |

---

## Processing Integrity

| Control | Evidence location | Responsible | Maturity |
|---|---|---|---|
| **PI1.1** Input validation | Zod schemas on every node-data jsonb (D-002 pattern); strict on every server action; integer/UUID checks at edge | system | 3 |
| **PI1.2** Idempotency on dispatchers | Stripe `event_id` PK; webhook delivery partial unique on (org, lead, agent_kind); DOE invocation idempotent on (directive, subject, trigger) | system | 3 |
| **PI1.4** Output review | Audit log on every privileged write; T2 agent drafts in `/admin/agents/queue` for org-admin review (D-322) | system + operator | 3 |

---

## Confidentiality

| Control | Evidence location | Responsible | Maturity |
|---|---|---|---|
| **C1.1** Data classification | Implicit via RLS — every row tagged with `organization_id`. Sensitive secrets (`org_integration_secrets`, `mfa_secret`) RLS'd to super-admin / row-owner only. | system | 2 |
| **C1.2** Retention | D-312 daily prune cron — 90d / 30d / 60d defaults via `platform_flags`. Per-org override is V3.x. | system | 2 |

---

## Privacy

| Control | Evidence location | Responsible | Maturity |
|---|---|---|---|
| **P1.1** Privacy notice | Operator-published. `docs/runbooks/` does not currently contain a customer-facing privacy policy. **Operator drafts pre-pen-test.** | operator | 1 |
| **P3.2** Consent for processing | Onboarding flow (D-005) captures explicit org consent at sign-up; per-user consent V3.x. | operator | 2 |
| **P5.2** Right to erasure (GDPR Art 17) | `profiles.deactivated_at`; `nodes.deleted_at` soft-delete; full hard-delete pipeline V3.x. | operator | 2 (soft-delete only) |
| **P6.1** PII masking before egress | `src/lib/nodes/text.ts` `textOfRecord(node)` masks PII before LLM seam | system | 3 |

---

## Maturity scorecard

| Category | Avg maturity | Highest priority for L3 |
|---|---|---|
| Security | 2.6 | CC7.2 incident detection (Sentry / OTEL) |
| Availability | 1.3 | A1.1 capacity monitoring |
| Processing Integrity | 3.0 | already at L3 |
| Confidentiality | 2.0 | per-org retention overrides |
| Privacy | 2.0 | hard-delete + customer privacy policy |

## What the auditor will ask first

Based on prior SOC 2 prelim audits in similar SaaS:

1. **"Show us the RLS policy on every tenant table."** → point to `tests/integration/rls-audit.test.ts` output.
2. **"Show us how you log every privileged action."** → point to `audit_log` table + the `withApiAudit` wrapper.
3. **"Show us how you handle webhook signatures."** → `src/lib/billing/stripe.ts` (Stripe), `src/lib/webhooks/signing.ts` (outbound), `src/lib/webhooks/whatsapp/signature.ts` (D-010 inbound).
4. **"Show us your incident-response runbook."** → `docs/runbooks/` per directive.
5. **"Show us your data-retention policy."** → `docs/runbooks/v3-audit-retention.md` + `platform_flags` rows.
6. **"Show us your vendor list."** → table above.
7. **"Show us how you onboard / offboard customers."** → `docs/runbooks/pilot-onboarding.md`, suspend flow (D-302).
8. **"Show us how you patch vulns."** → operator policy doc (V3.x — currently ad hoc per `npm audit`).

## Operator follow-ups before SOC 2 Type 1 engagement

- [ ] Publish a customer-facing privacy policy URL.
- [ ] Add a vulnerability-management policy doc (cadence + escalation).
- [ ] Stand up Sentry (or equivalent) for runtime error capture.
- [ ] Confirm Supabase PITR enabled in production project.
- [ ] Sign DPAs with each subprocessor in the table above.
- [ ] (Optional) Schedule the V3.x bug-bounty program launch for after pen-test passes.
