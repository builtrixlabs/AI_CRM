-- V6 Phase 1 (D-602) — Site Visit Module schema.
--
-- Per baseline/110 §I the CRM is single-table polymorphic: a site visit is
-- a `nodes` row with node_type='site_visit'. D-602 therefore adds NO
-- `site_visits` table — the cab/driver/assignment fields D-601 will write
-- in Phase 2 live in the site_visit jsonb schema
-- (src/lib/nodes/schemas/site_visit.ts — additive, no DDL). This migration
-- adds only what genuinely needs DB support:
--   1. site_visit_coordinator_claims — a per-(org, day) coordination lock.
--   2. a partial expression index on nodes for the date-filtered list.
--
-- The 7-state site_visit workflow (PRD-v6.0 §D-602:
-- draft -> scheduled -> confirmed -> in_progress -> completed
--        -> cancelled -> no_show) is app-enforced in
-- src/lib/nodes/states.ts — baseline/110 §III: "DB does NOT enforce the
-- (type, state) tuple" — so there is NO state-constraint change here.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.nodes_site_visit_scheduled_at_idx;
--   DROP TABLE IF EXISTS public.site_visit_coordinator_claims;

-- ── site_visit_coordinator_claims ───────────────────────────────────────
-- "One coordinator per org per day" — the composite PK makes the claim an
-- atomic INSERT: the second claimant for a (org, date) hits a unique
-- violation. This is a coordination mutex, not a domain entity, so it
-- intentionally carries no soft-delete / provenance triple; releasing a
-- claim is a hard DELETE of the caller's own row.
CREATE TABLE IF NOT EXISTS site_visit_coordinator_claims (
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  coordination_date date NOT NULL,
  coordinator_id    uuid NOT NULL REFERENCES profiles(id),
  claimed_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, coordination_date)
);

CREATE INDEX IF NOT EXISTS site_visit_coordinator_claims_coordinator_idx
  ON site_visit_coordinator_claims (organization_id, coordinator_id);

ALTER TABLE site_visit_coordinator_claims ENABLE ROW LEVEL SECURITY;

-- SELECT — same-org authenticated. super_admin sees none (app_org_id() is
-- NULL for them), consistent with the nodes RLS posture (baseline/110 §IX).
DROP POLICY IF EXISTS site_visit_coordinator_claims_select_org ON site_visit_coordinator_claims;
CREATE POLICY site_visit_coordinator_claims_select_org
  ON site_visit_coordinator_claims FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

-- INSERT — same-org only. The `site_visits:coordinate` permission gate is
-- enforced in the server action (claimCoordination); RLS is the org fence.
DROP POLICY IF EXISTS site_visit_coordinator_claims_insert_org ON site_visit_coordinator_claims;
CREATE POLICY site_visit_coordinator_claims_insert_org
  ON site_visit_coordinator_claims FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.app_org_id());

-- DELETE — same-org only (release a claim).
DROP POLICY IF EXISTS site_visit_coordinator_claims_delete_org ON site_visit_coordinator_claims;
CREATE POLICY site_visit_coordinator_claims_delete_org
  ON site_visit_coordinator_claims FOR DELETE TO authenticated
  USING (organization_id = public.app_org_id());

-- No UPDATE policy — a claim is claim-or-release, never mutated.

-- ── nodes date-filter index for the Site Visits list ────────────────────
-- AC-5: status + project + date filtering at 500ms p95. The existing
-- nodes_org_ws_type_state_idx covers (org, ws, type, state); this partial
-- expression index covers the data->>'scheduled_at' range / bucket
-- predicate for site_visit rows specifically.
CREATE INDEX IF NOT EXISTS nodes_site_visit_scheduled_at_idx
  ON nodes (organization_id, (data->>'scheduled_at'))
  WHERE node_type = 'site_visit' AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
