-- Authenticated-read RLS template.
-- Any signed-in user can read; writes are reserved.

ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_select_authenticated"
  ON <table> FOR SELECT
  TO authenticated
  USING (true);

-- Writes restricted: add a separate policy with explicit check.
-- Do NOT add INSERT/UPDATE/DELETE policies for `anon` here.
