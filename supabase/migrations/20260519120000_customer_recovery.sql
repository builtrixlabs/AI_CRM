-- V6 Phase 3 (D-616) — Customer Recovery Team queue.
--
-- One table: customer_recovery_queue. Every 6h the customerRecoverySweep
-- Inngest function classifies leads in terminal / cold states and inserts
-- an open queue row; a recovery rep claims + resolves it. A partial-unique
-- index guarantees at most one open row per (org, lead).
--
-- recovery_reason is a closed enum:
--   - lost              — lead.state = 'lost' (sales gave up).
--   - on_hold           — lead.state = 'on_hold' (sales paused).
--   - stale_contacted   — lead.state = 'contacted', last_contact_at < now - 14d.
--   - stale_qualified   — lead.state = 'qualified', last_contact_at < now - 14d.
-- (junk + new excluded — junk = bad data, new = covered by D-322 7-day sweep.)
--
-- resolution is a closed enum, set on resolve:
--   - won_back          — lead re-engaged; rep separately transitions state.
--   - unreachable       — no answer after attempts.
--   - confirmed_lost    — validated the prior lost / on_hold disposition.
--
-- RLS enforces org isolation ONLY — the recovery:* permissions are gated
-- in the server actions (manager / org_admin can view but only
-- customer_recovery_rep can claim/resolve). Same posture as D-602 / D-610.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.customer_recovery_queue;

CREATE TABLE IF NOT EXISTS customer_recovery_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  recovery_reason text NOT NULL CHECK (recovery_reason IN
                  ('lost', 'on_hold', 'stale_contacted', 'stale_qualified')),
  added_at        timestamptz NOT NULL DEFAULT now(),
  claimed_by      uuid REFERENCES profiles(id),
  claimed_at      timestamptz,
  resolved_at     timestamptz,
  resolution      text CHECK (resolution IN
                  ('won_back', 'unreachable', 'confirmed_lost')),
  note            text,
  CHECK ((resolved_at IS NULL AND resolution IS NULL)
      OR (resolved_at IS NOT NULL AND resolution IS NOT NULL)),
  CHECK ((claimed_by IS NULL AND claimed_at IS NULL)
      OR (claimed_by IS NOT NULL AND claimed_at IS NOT NULL))
);

-- At most one OPEN row per (org, lead). Closed rows accumulate as history.
CREATE UNIQUE INDEX IF NOT EXISTS customer_recovery_queue_open_unique_idx
  ON customer_recovery_queue (organization_id, lead_id)
  WHERE resolved_at IS NULL;

-- Hot path: list open rows for an org.
CREATE INDEX IF NOT EXISTS customer_recovery_queue_org_open_idx
  ON customer_recovery_queue (organization_id, added_at DESC)
  WHERE resolved_at IS NULL;

-- Hot path: "mine" filter.
CREATE INDEX IF NOT EXISTS customer_recovery_queue_org_claimedby_idx
  ON customer_recovery_queue (organization_id, claimed_by)
  WHERE claimed_by IS NOT NULL AND resolved_at IS NULL;

-- Hot path: "resolved in last 30d".
CREATE INDEX IF NOT EXISTS customer_recovery_queue_org_resolved_idx
  ON customer_recovery_queue (organization_id, resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

ALTER TABLE customer_recovery_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_recovery_queue_select_org ON customer_recovery_queue;
CREATE POLICY customer_recovery_queue_select_org
  ON customer_recovery_queue FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS customer_recovery_queue_insert_org ON customer_recovery_queue;
CREATE POLICY customer_recovery_queue_insert_org
  ON customer_recovery_queue FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS customer_recovery_queue_update_org ON customer_recovery_queue;
CREATE POLICY customer_recovery_queue_update_org
  ON customer_recovery_queue FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- No authenticated DELETE policy — closed rows are history; rows are
-- never deleted from the queue.

NOTIFY pgrst, 'reload schema';
