-- D-001 / B4 follow-up — enforce audit_log append-only via trigger
--
-- Why this migration exists:
--   The original D-001 audit_log migration relied on RLS having no UPDATE /
--   DELETE policy, expecting that "no policy = forbidden" applied to every
--   role. That's true for `authenticated` and `anon` — but Supabase configures
--   `service_role` to BYPASS RLS by default. Triggers run regardless of
--   bypass; they're the only way to make append-only architecturally true.
--
-- Constitution IV requires the audit log to be immutable. This trigger
-- closes the loophole.

CREATE OR REPLACE FUNCTION public.audit_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; % rejected (Constitution IV)',
                  TG_OP
    USING ERRCODE = 'check_violation',
          HINT = 'To revise an audit row, INSERT a new row with `supersedes` set to the prior id.';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();

-- Note: TRUNCATE is also a mutation. Block it via trigger as well.
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_block_mutation();
