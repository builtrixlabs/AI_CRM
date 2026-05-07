-- Owner-only RLS template.
-- Replace <table> and <owner_col> (defaults to user_id).

ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Deny-all by default (Postgres deny-by-default once RLS is enabled with no policies).

CREATE POLICY "<table>_select_own"
  ON <table> FOR SELECT
  TO authenticated
  USING (auth.uid() = <owner_col>);

CREATE POLICY "<table>_insert_own"
  ON <table> FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = <owner_col>);

CREATE POLICY "<table>_update_own"
  ON <table> FOR UPDATE
  TO authenticated
  USING (auth.uid() = <owner_col>)
  WITH CHECK (auth.uid() = <owner_col>);

CREATE POLICY "<table>_delete_own"
  ON <table> FOR DELETE
  TO authenticated
  USING (auth.uid() = <owner_col>);
