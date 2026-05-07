-- Service-role-only writes. Reads are authenticated-only.

ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_select_authenticated"
  ON <table> FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "<table>_insert_service"
  ON <table> FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "<table>_update_service"
  ON <table> FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "<table>_delete_service"
  ON <table> FOR DELETE
  TO service_role
  USING (true);
