-- D-001 / B9 — placeholder cp_submissions fixture for the channel_partner
-- isolation integration test.
--
-- Apply this to your TEST environment ONLY (not production). D-002 will ship
-- the real `leads` table with this same RLS pattern; this fixture proves the
-- pattern works before D-002 lands.
--
-- Apply: psql $DATABASE_URL -f tests/fixtures/cp-test-table.sql

CREATE TABLE IF NOT EXISTS cp_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  submitted_by_user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cp_submissions ENABLE ROW LEVEL SECURITY;

-- Channel partners (or any user) see only rows they themselves submitted.
DROP POLICY IF EXISTS cp_submissions_select_own ON cp_submissions;
CREATE POLICY cp_submissions_select_own ON cp_submissions
  FOR SELECT TO authenticated
  USING (submitted_by_user_id = auth.uid());

-- INSERT: a user can only insert rows attributed to themselves, in their own org.
DROP POLICY IF EXISTS cp_submissions_insert_own ON cp_submissions;
CREATE POLICY cp_submissions_insert_own ON cp_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by_user_id = auth.uid()
    AND organization_id = auth.org_id()
  );
