-- D-002 / B6 — RLS for nodes / edges / node_signals / embedding_queue
--
-- Constitution II: cross-tenant access architecturally impossible. Every
-- read/write is scoped by public.app_org_id() (D-001 helper).
-- super_admin gets ZERO operational rows by construction (no permissive
-- policy, app_org_id() returns NULL for super_admin → predicate always fails).

-- ── nodes ────────────────────────────────────────────────────────────
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nodes_select_org ON nodes
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY nodes_insert_org ON nodes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY nodes_update_org ON nodes
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- ── edges ────────────────────────────────────────────────────────────
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY edges_select_org ON edges
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY edges_insert_org ON edges
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY edges_update_org ON edges
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- ── node_signals ────────────────────────────────────────────────────
ALTER TABLE node_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY node_signals_select_org ON node_signals
  FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id() AND deleted_at IS NULL);

CREATE POLICY node_signals_insert_org ON node_signals
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

CREATE POLICY node_signals_update_org ON node_signals
  FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

-- ── embedding_queue ─────────────────────────────────────────────────
-- Service-role-only by design. NO authenticated policy = forbidden.
-- The trigger function runs as SECURITY DEFINER so INSERTs from the nodes
-- trigger succeed; downstream Inngest workers also use service-role.
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
