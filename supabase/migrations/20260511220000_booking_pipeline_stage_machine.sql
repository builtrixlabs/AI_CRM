-- D-421 / A1 — booking pipeline stage machine.
--
-- Per baseline/118-booking-pipeline-contract.md §3 (enum), §4 (matrix),
-- §5 (audit table), §9 (RLS). Adds the deal_stage enum, current_stage
-- column on nodes (deal-typed rows only), the stage_transitions audit
-- table with idempotency + provenance, and the transition_stage RPC
-- that enforces the matrix at the function boundary.
--
-- Additive only — no DROP, no destructive ALTER. Idempotent on re-apply
-- via IF NOT EXISTS / CREATE OR REPLACE / DO blocks.

-- ── deal_stage enum (baseline §3) ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_stage') THEN
    CREATE TYPE deal_stage AS ENUM (
      'eoi',
      'token',
      'booking',
      'sale_agreement',
      'loan_finance',
      'registration',
      'possession',
      'handover_complete'
    );
  END IF;
END$$;

-- ── nodes.current_stage column ─────────────────────────────────────────
-- Deals live polymorphically in `nodes` (node_type='deal'). Column is
-- NULLABLE because non-deal rows must not carry a booking stage; the
-- app layer + the transition_stage RPC keep deal rows populated.
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS current_stage deal_stage NULL;

-- Backfill existing deal rows to 'eoi' (baseline §5 — system actor).
UPDATE nodes
SET current_stage = 'eoi'
WHERE node_type = 'deal'
  AND current_stage IS NULL
  AND deleted_at IS NULL;

-- ── stage_transitions table (baseline §5) ──────────────────────────────
CREATE TABLE IF NOT EXISTS stage_transitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id           uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  from_stage        deal_stage NULL,
  to_stage          deal_stage NOT NULL,
  actor_user_id     uuid NULL,
  actor_kind        text NOT NULL CHECK (actor_kind IN ('user', 'agent', 'system')),
  triggered_by      text NULL,
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key   uuid NOT NULL,
  skip_reason       text NULL,
  correction_reason text NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS stage_transitions_org_deal_time_idx
  ON stage_transitions (organization_id, deal_id, occurred_at DESC);

-- Backfill: one initial stage_transitions row per existing deal so the
-- audit trail starts at row-1. triggered_by='migration:...' carries the
-- system-actor provenance per baseline §5.
INSERT INTO stage_transitions (
  organization_id, deal_id, from_stage, to_stage,
  actor_user_id, actor_kind, triggered_by,
  evidence, idempotency_key
)
SELECT
  n.organization_id,
  n.id,
  NULL::deal_stage,
  'eoi'::deal_stage,
  NULL,
  'system',
  'migration:20260511220000',
  jsonb_build_object('backfill', true, 'reason', 'D-421 stage machine bootstrap'),
  gen_random_uuid()
FROM nodes n
WHERE n.node_type = 'deal'
  AND n.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stage_transitions st WHERE st.deal_id = n.id
  );

-- ── RLS (baseline §9) ──────────────────────────────────────────────────
ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_transitions_select_own ON stage_transitions;
CREATE POLICY stage_transitions_select_own
  ON stage_transitions FOR SELECT TO authenticated
  USING (
    public.app_is_super_admin()
    OR organization_id = public.app_org_id()
  );

-- INSERT / UPDATE / DELETE: no policy granted. Postgres RLS is restrictive
-- by default — absence of an applicable policy = denial. Mutations flow
-- exclusively through transition_stage (SECURITY DEFINER below), which
-- bypasses RLS internally while enforcing the matrix invariants.

-- ── transition_stage RPC (baseline §4 + AC-6) ──────────────────────────
CREATE OR REPLACE FUNCTION public.transition_stage(
  p_deal_id uuid,
  p_to_stage deal_stage,
  p_idempotency_key uuid,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_skip_reason text DEFAULT NULL,
  p_correction_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid  uuid := auth.uid();
  v_is_super    boolean := public.app_is_super_admin();
  v_is_admin    boolean := public.app_is_org_admin_or_super();
  v_caller_org  uuid := public.app_org_id();
  v_deal_org    uuid;
  v_deal_type   text;
  v_from_stage  deal_stage;
  v_existing_id uuid;
  v_new_id      uuid;
  v_from_idx    int;
  v_to_idx      int;
  c_order       constant deal_stage[] := ARRAY[
    'eoi','token','booking','sale_agreement',
    'loan_finance','registration','possession','handover_complete'
  ]::deal_stage[];
BEGIN
  -- 1. Authenticated caller
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'access_denied' USING HINT = 'not authenticated';
  END IF;

  -- 2. Lock the deal row + read its state
  SELECT n.organization_id, n.node_type, n.current_stage
    INTO v_deal_org, v_deal_type, v_from_stage
  FROM nodes n
  WHERE n.id = p_deal_id AND n.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found' USING HINT = format('no deal %s', p_deal_id);
  END IF;

  IF v_deal_type <> 'deal' THEN
    RAISE EXCEPTION 'not_a_deal' USING HINT =
      format('node %s is type %s, not a deal', p_deal_id, v_deal_type);
  END IF;

  -- 3. Org membership: caller's org must match deal's org (super_admin exempt)
  IF NOT v_is_super AND (v_caller_org IS NULL OR v_deal_org <> v_caller_org) THEN
    RAISE EXCEPTION 'access_denied' USING HINT = 'cross-org transition denied';
  END IF;

  -- 4. Idempotency: return existing row if (deal_id, idempotency_key) seen
  SELECT id INTO v_existing_id
  FROM stage_transitions
  WHERE deal_id = p_deal_id AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- 5. Provenance: evidence must be non-empty (manual path; agent path
  --    via doe:* triggers will be handled in D-115/D-116).
  IF p_evidence IS NULL OR p_evidence = '{}'::jsonb THEN
    RAISE EXCEPTION 'no_provenance' USING HINT = 'evidence must be non-empty';
  END IF;

  -- 6. Transition matrix (baseline §4)
  v_from_idx := array_position(c_order, v_from_stage);
  v_to_idx   := array_position(c_order, p_to_stage);

  IF v_from_idx IS NULL OR v_to_idx IS NULL THEN
    RAISE EXCEPTION 'invalid_transition' USING HINT =
      format('unknown stage from=%s to=%s', v_from_stage, p_to_stage);
  END IF;

  IF v_to_idx = v_from_idx + 1 THEN
    -- forward by one — canonical
    NULL;
  ELSIF v_from_stage = 'eoi'
        AND p_to_stage = 'booking'
        AND p_skip_reason = 'cash_buyer' THEN
    -- forward skip — cash buyer
    NULL;
  ELSIF v_from_stage = 'sale_agreement'
        AND p_to_stage = 'registration'
        AND p_skip_reason = 'fully_cashed' THEN
    -- forward skip — fully cashed (no loan)
    NULL;
  ELSIF v_to_idx = v_from_idx - 1
        AND v_is_admin
        AND p_correction_reason IS NOT NULL
        AND length(trim(p_correction_reason)) > 0 THEN
    -- single-step backward correction — org-admin only
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid_transition' USING HINT =
      format('from=%s to=%s skip=%s correction=%s admin=%s',
        v_from_stage, p_to_stage, p_skip_reason, p_correction_reason, v_is_admin);
  END IF;

  -- 7. Write the audit row
  INSERT INTO stage_transitions (
    organization_id, deal_id, from_stage, to_stage,
    actor_user_id, actor_kind, triggered_by,
    evidence, idempotency_key, skip_reason, correction_reason
  ) VALUES (
    v_deal_org, p_deal_id, v_from_stage, p_to_stage,
    v_caller_uid, 'user', 'manual',
    p_evidence, p_idempotency_key, p_skip_reason, p_correction_reason
  ) RETURNING id INTO v_new_id;

  -- 8. Advance the deal's current_stage
  UPDATE nodes
  SET current_stage = p_to_stage,
      updated_at    = now(),
      updated_by    = v_caller_uid,
      updated_via   = 'manual'
  WHERE id = p_deal_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_stage(uuid, deal_stage, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_stage(uuid, deal_stage, uuid, jsonb, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Rollback (reference only; do not run on apply) ─────────────────────
-- DROP FUNCTION IF EXISTS public.transition_stage(uuid, deal_stage, uuid, jsonb, text, text);
-- DROP TABLE IF EXISTS stage_transitions;
-- ALTER TABLE nodes DROP COLUMN IF EXISTS current_stage;
-- DROP TYPE IF EXISTS deal_stage;
