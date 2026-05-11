-- D-420 / A4 — RE Inventory: Project / Tower / Floor / Unit hierarchy +
-- 7-state availability machine.
--
-- Constitution II (tenant isolation), III (provenance), IV (audit trail),
-- VI (baseline immutability → new baseline 117 follows this runtime), VII
-- (Postgres-native row lock; no external queue), VIII (no new perms here —
-- those land in src/lib/auth/rbac.ts).
--
-- Additive only — no DROP TABLE, no destructive ALTER. Idempotent on
-- re-apply via DO blocks and CREATE OR REPLACE. Rollback path below.
--
-- ── Rollback (manual; not run automatically) ────────────────────────────────
-- DROP FUNCTION IF EXISTS public.transition_unit_state(uuid, text, uuid, text, text, boolean, integer, integer);
-- DROP FUNCTION IF EXISTS public.expire_inventory_holds(integer);
-- DROP INDEX IF EXISTS nodes_state_expires_at_idx;
-- ALTER TABLE nodes DROP COLUMN IF EXISTS state_expires_at;
-- ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_node_type_check;
-- ALTER TABLE nodes ADD CONSTRAINT nodes_node_type_check CHECK (node_type IN
--   ('lead','contact','deal','property','unit','site_visit','call','activity','document','note'));
-- ALTER TABLE custom_views DROP CONSTRAINT IF EXISTS custom_views_entity_type_check;
-- ALTER TABLE custom_views ADD CONSTRAINT custom_views_entity_type_check CHECK (entity_type IN
--   ('lead','deal','contact','property','unit','site_visit','document','activity','note','call'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend nodes.node_type CHECK to admit 'project' and 'tower'.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nodes_node_type_check' AND conrelid = 'public.nodes'::regclass
  ) THEN
    ALTER TABLE public.nodes DROP CONSTRAINT nodes_node_type_check;
  END IF;
END $$;

ALTER TABLE public.nodes
  ADD CONSTRAINT nodes_node_type_check
  CHECK (node_type IN (
    'lead','contact','deal',
    'project','tower','property',
    'unit',
    'site_visit','call','activity','document','note'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend custom_views.entity_type CHECK to admit 'project' and 'tower'.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'custom_views_entity_type_check' AND conrelid = 'public.custom_views'::regclass
  ) THEN
    ALTER TABLE public.custom_views DROP CONSTRAINT custom_views_entity_type_check;
  END IF;
END $$;

ALTER TABLE public.custom_views
  ADD CONSTRAINT custom_views_entity_type_check
  CHECK (entity_type IN (
    'lead','deal','contact',
    'project','tower','property',
    'unit',
    'site_visit','document','activity','note','call'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. nodes.state_expires_at — TTL for held / blocked unit states.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS state_expires_at timestamptz NULL;

-- Partial index: only the rows the hourly cron sweeps.
CREATE INDEX IF NOT EXISTS nodes_state_expires_at_idx
  ON public.nodes (state_expires_at)
  WHERE state_expires_at IS NOT NULL AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: transition_unit_state — single source of truth for unit state
--    transitions. Row-locks the target row, validates the transition graph,
--    writes the audit_log row, sets/clears state_expires_at.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_unit_state(
  p_unit_id        uuid,
  p_to_state       text,
  p_actor_id       uuid,
  p_actor_role     text,
  p_reason         text DEFAULT NULL,
  p_has_override   boolean DEFAULT false,
  p_held_hours     integer DEFAULT 24,
  p_blocked_days   integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id        uuid;
  v_caller_org    uuid;
  v_from_state    text;
  v_new_expires   timestamptz;
  v_is_super      boolean;
  v_allowed       boolean := false;
  -- Adjacency graph mirroring src/lib/inventory/transitions.ts ALLOWED_FORWARD.
  v_forward       jsonb := jsonb_build_object(
    'available',  jsonb_build_array('available','held','blocked','booked'),
    'held',       jsonb_build_array('held','blocked','booked','available'),
    'blocked',    jsonb_build_array('blocked','booked','available'),
    'booked',     jsonb_build_array('booked','sold'),
    'sold',       jsonb_build_array('sold','registered'),
    'registered', jsonb_build_array('registered','possessed'),
    'possessed',  jsonb_build_array('possessed')
  );
  v_valid_states  text[] := ARRAY[
    'available','held','blocked','booked','sold','registered','possessed'
  ];
BEGIN
  -- Validate destination state.
  IF p_to_state IS NULL OR NOT (p_to_state = ANY (v_valid_states)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_state');
  END IF;

  -- Lock the unit row for the duration of this transaction.
  SELECT organization_id, COALESCE(state, 'available')
    INTO v_org_id, v_from_state
  FROM public.nodes
  WHERE id = p_unit_id
    AND node_type = 'unit'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Cross-tenant guard: caller's JWT org must match the row's org
  -- (super_admin bypasses).
  v_is_super := public.app_is_super_admin();
  v_caller_org := public.app_org_id();
  IF NOT v_is_super AND (v_caller_org IS DISTINCT FROM v_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cross_tenant');
  END IF;

  -- Normalize from_state into the new 7-state alphabet. Legacy D-320 rows
  -- carry state IN ('available','held','booked','sold'); map them as-is.
  IF NOT (v_from_state = ANY (v_valid_states)) THEN
    v_from_state := 'available';
  END IF;

  -- Idempotent same-state transition: succeed without writing audit row.
  IF v_from_state = p_to_state THEN
    RETURN jsonb_build_object(
      'ok', true,
      'new_state', p_to_state,
      'state_expires_at', NULL,
      'noop', true
    );
  END IF;

  -- Transition graph check.
  v_allowed := (v_forward -> v_from_state) ? p_to_state;

  IF NOT v_allowed AND NOT p_has_override THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE
        WHEN (v_forward -> p_to_state) ? v_from_state THEN 'backward_no_override'
        ELSE 'illegal_transition'
      END,
      'from_state', v_from_state,
      'to_state',   p_to_state
    );
  END IF;

  -- Compute new state_expires_at: held/blocked set TTL; everything else clears it.
  v_new_expires := CASE
    WHEN p_to_state = 'held'    THEN now() + make_interval(hours => p_held_hours)
    WHEN p_to_state = 'blocked' THEN now() + make_interval(days  => p_blocked_days)
    ELSE NULL
  END;

  -- Apply the transition.
  UPDATE public.nodes
  SET state            = p_to_state,
      state_expires_at = v_new_expires,
      updated_at       = now(),
      updated_by       = p_actor_id,
      updated_via      = 'manual'
  WHERE id = p_unit_id;

  -- Append audit_log row (Constitution III + IV).
  INSERT INTO public.audit_log (
    actor_id, actor_type, actor_role,
    organization_id, workspace_id,
    table_name, record_id, action, diff
  )
  VALUES (
    p_actor_id,
    'user',
    COALESCE(p_actor_role, 'unknown'),
    v_org_id,
    NULL,
    'nodes',
    p_unit_id,
    'unit_state_transition',
    jsonb_build_object(
      'from',     v_from_state,
      'to',       p_to_state,
      'reason',   p_reason,
      'override', p_has_override,
      'state_expires_at', v_new_expires
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'new_state', p_to_state,
    'state_expires_at', v_new_expires,
    'from_state', v_from_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_unit_state(uuid, text, uuid, text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_unit_state(uuid, text, uuid, text, text, boolean, integer, integer) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: expire_inventory_holds — cron-callable; reverts expired
--    held/blocked rows to 'available' + audit-logs each revert.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_inventory_holds(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_row   record;
  v_system_uuid uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  FOR v_row IN
    SELECT id, organization_id, state, state_expires_at
    FROM public.nodes
    WHERE node_type = 'unit'
      AND state IN ('held','blocked')
      AND state_expires_at IS NOT NULL
      AND state_expires_at < now()
      AND deleted_at IS NULL
    ORDER BY state_expires_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.nodes
    SET state            = 'available',
        state_expires_at = NULL,
        updated_at       = now(),
        updated_by       = v_system_uuid,
        updated_via      = 'system'
    WHERE id = v_row.id;

    INSERT INTO public.audit_log (
      actor_id, actor_type, actor_role,
      organization_id, workspace_id,
      table_name, record_id, action, diff
    ) VALUES (
      v_system_uuid,
      'system',
      'inventory_hold_expiry_cron',
      v_row.organization_id,
      NULL,
      'nodes',
      v_row.id,
      'unit_hold_expired',
      jsonb_build_object(
        'from', v_row.state,
        'to',   'available',
        'expired_at', v_row.state_expires_at
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_inventory_holds(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_inventory_holds(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PostgREST schema reload so the new RPCs are immediately callable.
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
