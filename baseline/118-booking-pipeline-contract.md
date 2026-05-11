# Baseline 118 — Booking Pipeline Contract

**Authority:** Operator-locked. Hook-blocked under `baseline/**`. Amendments require explicit operator edit.
**Created:** 2026-05-11
**Locks:** PRD v3.0 §P5 (Booking Pipeline) + PRD §10.6 (Demand letter rendering).
**Owner directives:** D-421 (state machine + canvas), D-422 (payment milestones), D-423 (demand letter PDF), D-424 (event emissions to PSCRM + Legal Auditor).
**Status note:** This file is the canonical contract for the post-EOI deal lifecycle and lives under `baseline/`. While drafted in `docs/` by the agent (hook prevents direct writes to `baseline/**`), the operator moves it to `baseline/118-booking-pipeline-contract.md` before the first directive citing it locks at Gate 2.

---

## 1. Purpose

Define the canonical contract for the post-EOI deal lifecycle: stages, transitions, audit shape, milestone payment schema, demand-letter rendering, and outbound event emissions. Sits below CLAUDE.md authority order between **policy** and the booking-pipeline directives. Directives MUST cite this baseline.

## 2. Scope

This baseline owns:
- The `deal_stage` enum (8 stages, ordered)
- The `stage_transitions` audit table contract
- The `payment_milestones` ledger contract
- The `demand_letters` artifact contract
- The `booking_events_outbox` outbound-event contract
- The §10.6 demand-letter rendering decision (in-process templating, no SaaS)
- RLS posture on all four tables
- Concurrency rules during stage transitions

Out of scope:
- The lead → EOI flow (D-007 + D-417 + D-410 territory)
- Unit allocation + inventory (D-120, separate baseline 117)
- Comms providers (baseline 116)
- Reporting / pivot layer (baseline 119)

## 3. Stage enum — canonical, ordered, frozen

```sql
CREATE TYPE deal_stage AS ENUM (
  'eoi',                  -- 0  Expression of Interest — buyer flagged interest
  'token',                -- 1  Token amount received + receipted
  'booking',              -- 2  Booking form signed + booking-checklist complete
  'sale_agreement',       -- 3  Sale agreement signed by both parties
  'loan_finance',         -- 4  Loan sanctioned OR cash track confirmed
  'registration',         -- 5  Sale deed registered with sub-registrar
  'possession',           -- 6  Keys handed over
  'handover_complete'     -- 7  Defect liability period begins (terminal)
);
```

Rules:
- Stage strings are stable identifiers. Display labels live in the UI layer (frontend i18n).
- Ordinals (0..7) are enforced by the transition matrix in §4, NOT by enum positional ordering at the DB level. Reorderings would corrupt audit history; **the enum is frozen after first migration applies**.
- `handover_complete` is terminal — no forward transitions. The deal moves to PSCRM (sister product) ownership at this point.

## 4. Transition matrix

Forward transitions — canonical happy path:

```
eoi → token → booking → sale_agreement → loan_finance → registration → possession → handover_complete
```

Allowed alternate forwards (skip), each requires a non-NULL `skip_reason`:

| From | To | `skip_reason` value | Meaning |
|---|---|---|---|
| `eoi` | `booking` | `'cash_buyer'` | Direct booking; no token phase |
| `sale_agreement` | `registration` | `'fully_cashed'` | No loan; agreement → registration directly |

Allowed reverses (correction, NOT progress):
- Single-step backward (`X → X-1`) allowed for `agent_org_admin` only, when correcting data entry. MUST carry a non-empty `correction_reason`.
- Cancellation closes the deal (`deals.state = 'cancelled'` — separate column, not a stage). Cancellation is recorded as a `deal_state_change`, not a `stage_transition`. Highest-reached stage is preserved on the deal record.

Disallowed:
- Skipping more than one stage forward (except the two named alternates above).
- Skipping backward more than one stage in a single call (multi-step corrections require multiple single-step transitions, each with its own `correction_reason`).
- Any forward transition from `handover_complete`.

Concurrency:
- Stage transitions acquire a row-level lock on `deals` (`SELECT ... FOR UPDATE`). Concurrent transition attempts on the same deal serialize.
- Idempotency: every transition request carries an `idempotency_key` (UUID); duplicate keys return the prior transition's id without writing.

## 5. Audit shape — `stage_transitions` table

```sql
CREATE TABLE stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  deal_id uuid NOT NULL REFERENCES deals(id),
  from_stage deal_stage,                                 -- NULL for initial entry into eoi
  to_stage deal_stage NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'agent', 'system')),
  triggered_by text,                                     -- 'manual' | 'doe:<directive>' | 'webhook:<source>' | 'migration:<id>'
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,           -- arbitrary provenance payload
  idempotency_key uuid NOT NULL,
  skip_reason text,                                      -- for alternate forwards (§4)
  correction_reason text,                                -- for single-step backwards (§4)
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, idempotency_key)
);
CREATE INDEX ON stage_transitions (organization_id, deal_id, occurred_at DESC);
```

Provenance requirements:
- Every transition MUST satisfy: `evidence != '{}'::jsonb` OR `triggered_by LIKE 'doe:%'` OR `triggered_by LIKE 'migration:%'` (the last only valid during initial backfill).
- `actor_user_id` is NULL when `actor_kind ∈ ('agent', 'system')`.
- The agent/system actor kinds are reserved here but not exercised until D-115 / D-116 (Follow-up Agent T2) wires up DOE-driven transitions.

## 6. Milestone payment ledger — `payment_milestones`

```sql
CREATE TABLE payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  deal_id uuid NOT NULL REFERENCES deals(id),
  label text NOT NULL,                                   -- e.g. 'Token', 'Booking 20%', 'Plinth 15%', 'Slab cast 25%'
  due_stage deal_stage NOT NULL,                         -- stage at which this milestone becomes payable
  amount_inr_paise bigint NOT NULL CHECK (amount_inr_paise > 0),
  due_date date,
  paid_amount_inr_paise bigint NOT NULL DEFAULT 0,
  paid_at timestamptz,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid', 'waived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON payment_milestones (organization_id, deal_id, due_stage);
```

Outstanding balance:
- Per-deal computed value: `SUM(amount_inr_paise) - SUM(paid_amount_inr_paise) WHERE status != 'waived'`.
- Surfaced on the Deal canvas via a SQL view (`deal_outstanding_balance`) or RPC; never materialized in a column.

Rules:
- A milestone with `status='paid'` is immutable (no further updates to `paid_amount_inr_paise` or `status`).
- `status='waived'` requires `agent_org_admin` role at RLS time.
- All monetary values stored in **paise** (smallest unit, integer). UI converts to ₹ for display. Avoids float drift.

## 7. Demand letter contract — `demand_letters`

```sql
CREATE TABLE demand_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  deal_id uuid NOT NULL REFERENCES deals(id),
  milestone_id uuid REFERENCES payment_milestones(id),
  letter_number text NOT NULL,                           -- org-scoped sequential, e.g. 'DL/2026/00042'
  rendered_at timestamptz NOT NULL DEFAULT now(),
  rendered_by_user_id uuid REFERENCES users(id),
  template_version text NOT NULL,                        -- 'v1'
  storage_path text NOT NULL,                            -- Supabase Storage object path
  pdf_sha256 text NOT NULL,                              -- integrity check
  payload_snapshot jsonb NOT NULL,                       -- frozen template inputs
  UNIQUE (organization_id, letter_number)
);
CREATE INDEX ON demand_letters (organization_id, deal_id, rendered_at DESC);

CREATE TABLE demand_letter_sequences (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id),
  next_value bigint NOT NULL DEFAULT 1
);
```

### §10.6 decision — IN-PROCESS TEMPLATING, NO SaaS

**Choice: server-rendered React component → PDF buffer via `@react-pdf/renderer`, executed inside Vercel Node functions.**

Rationale:
- A demand letter is an internally-issued payment notice, not a counter-signed legal instrument. No e-signature round-trip needed in V1.
- Puppeteer requires a headless Chromium bundle (~150MB), exceeds Vercel function size limits cleanly, and adds cold-start latency for every render.
- DocSeal / Carbone / DocuSign are e-signature SaaS — wrong shape for a one-way payment notice, and would require a vendor key + per-letter cost.
- `@react-pdf/renderer` produces deterministic byte-identical output, runs in serverless cleanly, and lets the template live as a React component (reusable for on-screen preview).

Constraints:
- Template payload (deal, buyer, project, unit, milestone, amounts) MUST be snapshotted into `demand_letters.payload_snapshot` at render time; re-renders use the snapshot, never re-fetch (so the letter is reproducible even if the underlying deal/buyer record changes).
- Rendered PDF persisted to Supabase Storage bucket `demand-letters` under path `<org_id>/<deal_id>/<letter_number>.pdf`.
- `pdf_sha256` computed over the rendered bytes pre-upload; persisted for tamper detection.
- Letter numbering is org-scoped sequential, allocated via the `demand_letter_sequences` table, advanced atomically in the same transaction as the `demand_letters` INSERT.
- Format: `DL/<YYYY>/<6-digit-zero-padded-sequence>`, e.g. `DL/2026/000042`.

**Deferred to V1.5+:**
- E-signature workflow (DocSeal / Carbone / DocuSign integration) — when a confirmed customer asks for countersigning.
- Vendor-keyed PDF providers — not in V1 scope.

## 8. Outbound event emissions — `booking_events_outbox`

```sql
CREATE TABLE booking_events_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  deal_id uuid NOT NULL REFERENCES deals(id),
  event_kind text NOT NULL,                              -- see table below
  destination text NOT NULL CHECK (destination IN ('pscrm', 'legal_auditor')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON booking_events_outbox (status, created_at) WHERE status = 'pending';
```

Required emissions — emitted in the same transaction as the underlying `stage_transitions` row:

| Trigger transition | `event_kind` | `destination` |
|---|---|---|
| `booking → sale_agreement` | `deal.sale_agreement_signed` | `legal_auditor` |
| `sale_agreement → loan_finance` | `deal.booked` | `pscrm` |
| `sale_agreement → registration` (skip `loan_finance`) | `deal.booked` | `pscrm` |
| `registration → possession` | `deal.possession_handed_over` | `pscrm` |

V1 delivery posture:
- Rows land in the outbox at transition time. A future directive (D-122 Legal Auditor integration) wires the worker that drains the outbox to the destination products.
- Until then, `pscrm` and `legal_auditor` are no-op destinations — rows accumulate with `status='pending'` and are inspectable in the admin surface. This is intentional: the audit trail of "what would have been emitted" is itself valuable.

## 9. RLS posture

All four tables are org-scoped via `organization_id`. Required policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `stage_transitions` | members of org | via `transition_stage` RPC only (direct INSERT denied) | DENY | DENY |
| `payment_milestones` | members of org | `agent_org_admin` + `agent_collections` (own org) | `agent_org_admin` + `agent_collections` (own org); `paid` rows immutable per §6 | DENY |
| `demand_letters` | members of org | via `render_demand_letter` RPC only | DENY | DENY |
| `booking_events_outbox` | `agent_super_admin` only | via `transition_stage` RPC only | service-role worker only | DENY |
| `demand_letter_sequences` | DENY direct | via `render_demand_letter` RPC only | via `render_demand_letter` RPC only | DENY |

Rationale: mutating operations on `stage_transitions` and `demand_letters` go through SECURITY DEFINER RPCs, never direct INSERT. This forces invariant enforcement (transition matrix, idempotency, evidence, sequence allocation) at the function boundary, not scattered across server actions.

## 10. Directive slicing

The full PRD §P5 surface ships across four directives, each citing this baseline:

| Directive | Scope | Acceptance |
|---|---|---|
| **D-421** Booking Pipeline — Stage Machine | Migrations §3 + §5, `transition_stage` RPC, deal canvas stage tracker widget | Stage transitions land + audit visible; canvas shows current stage + history |
| **D-422** Booking Pipeline — Payment Milestones | Migration §6, milestone CRUD + waiver, outstanding balance view, canvas payment panel | Milestones tracked; outstanding balance accurate; waiver gated to org-admin |
| **D-423** Booking Pipeline — Demand Letter PDF | Migration §7, `render_demand_letter` RPC, `@react-pdf/renderer` template, Supabase Storage upload | Letter rendered + persisted + linked from milestone + downloadable |
| **D-424** Booking Pipeline — Event Emissions | Migration §8, outbox writes from `transition_stage` RPC, RLS lockdown + admin inspection | Required emissions §8 produce outbox rows on the right transitions; rows inspectable |

D-122 (Legal Auditor event bus) eventually ships the outbox-drain worker. D-115 / D-116 (Follow-up Agent T2 / Custom Outbound Agent T3) eventually exercise the `actor_kind = 'agent'` transition path.

## 11. Change control

Changes to this baseline require:
- Operator edit (hook-blocked at `baseline/**`; agent cannot modify).
- A `docs/baseline-118-amendment-<n>.md` note describing what changed and why.
- Re-Plan-Mode of any in-flight directive that cites this baseline (the cited contract has moved).

---

*End of Baseline 118.*
