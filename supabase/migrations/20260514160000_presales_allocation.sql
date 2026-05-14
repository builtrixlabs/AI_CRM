-- V6 Phase 1 (D-610) — Pre-sales Auto-Allocation Engine schema.
--
--   1. lead_allocation_rules  — priority-ordered manager-configured rules.
--   2. lead_allocation_state  — the round-robin cursor, one row per
--                               (org, team).
--   3. team_members           — D-001 shipped `teams` but no membership
--                               model; team_round_robin / team_first_available
--                               targets need to enumerate a team's members.
--
-- All org-scoped + RLS. RLS enforces org isolation ONLY — the
-- allocation_rules:manage permission is gated in the server actions,
-- because `manager` (a holder of it) is not an org-admin-tier role.
-- Same posture as D-602 / D-608.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.lead_allocation_state;
--   DROP TABLE IF EXISTS public.lead_allocation_rules;
--   DROP TABLE IF EXISTS public.team_members;

-- ── team_members ────────────────────────────────────────────────────────
-- A membership link, not a domain entity — no soft-delete / provenance
-- triple; removing a member is a hard DELETE.
CREATE TABLE IF NOT EXISTS team_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  PRIMARY KEY (team_id, profile_id)
);

CREATE INDEX IF NOT EXISTS team_members_org_team_idx
  ON team_members (organization_id, team_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_select_org ON team_members;
CREATE POLICY team_members_select_org
  ON team_members FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS team_members_insert_org ON team_members;
CREATE POLICY team_members_insert_org
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS team_members_delete_org ON team_members;
CREATE POLICY team_members_delete_org
  ON team_members FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

-- ── lead_allocation_rules ───────────────────────────────────────────────
-- conditions jsonb shape (closed): { source?, source_channel?,
-- budget_band_in?[], city_in?[], bhk_in?[] }. Empty {} = catch-all.
CREATE TABLE IF NOT EXISTS lead_allocation_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  priority        int NOT NULL,
  conditions      jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_kind     text NOT NULL CHECK (target_kind IN
                  ('user', 'team_round_robin', 'team_first_available')),
  target_user_id  uuid REFERENCES profiles(id),
  target_team_id  uuid REFERENCES teams(id),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  UNIQUE (organization_id, priority)
);

CREATE INDEX IF NOT EXISTS lead_allocation_rules_org_priority_idx
  ON lead_allocation_rules (organization_id, priority)
  WHERE active;

ALTER TABLE lead_allocation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_allocation_rules_select_org ON lead_allocation_rules;
CREATE POLICY lead_allocation_rules_select_org
  ON lead_allocation_rules FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

DROP POLICY IF EXISTS lead_allocation_rules_insert_org ON lead_allocation_rules;
CREATE POLICY lead_allocation_rules_insert_org
  ON lead_allocation_rules FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS lead_allocation_rules_update_org ON lead_allocation_rules;
CREATE POLICY lead_allocation_rules_update_org
  ON lead_allocation_rules FOR UPDATE TO authenticated
  USING (organization_id = public.app_org_id())
  WITH CHECK (organization_id = public.app_org_id());

DROP POLICY IF EXISTS lead_allocation_rules_delete_org ON lead_allocation_rules;
CREATE POLICY lead_allocation_rules_delete_org
  ON lead_allocation_rules FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

-- ── lead_allocation_state ───────────────────────────────────────────────
-- The round-robin cursor: one row per (org, team), tracking the last
-- assigned rep. Per-org Inngest concurrency serialises the read-pick-write.
CREATE TABLE IF NOT EXISTS lead_allocation_state (
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id               uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  last_assigned_user_id uuid REFERENCES profiles(id),
  last_assigned_at      timestamptz,
  PRIMARY KEY (organization_id, team_id)
);

ALTER TABLE lead_allocation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_allocation_state_select_org ON lead_allocation_state;
CREATE POLICY lead_allocation_state_select_org
  ON lead_allocation_state FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

-- No authenticated INSERT/UPDATE policy — the cursor is written only by
-- the allocation engine on the service-role client (which bypasses RLS).

NOTIFY pgrst, 'reload schema';
