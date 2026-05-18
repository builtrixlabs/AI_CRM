-- V3.x fix — add prune_webhook_deliveries which never landed because
-- the parent D-312 migration (20260510120400_audit_retention_and_prune.sql)
-- rolled back on a column-name error before its 3rd CREATE FUNCTION
-- statement executed. My 20260510130500 fix only re-created the first
-- two prune functions; this one finishes the trio.
--
-- webhook_deliveries.ts is the correct column name (no mutation needed).

CREATE OR REPLACE FUNCTION public.prune_webhook_deliveries(
  retention_days int,
  min_floor int
) RETURNS TABLE(scanned bigint, deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total bigint;
  removed bigint;
BEGIN
  SELECT count(*) INTO total FROM public.webhook_deliveries;
  IF total <= min_floor THEN
    RETURN QUERY SELECT total, 0::bigint;
    RETURN;
  END IF;

  -- webhook_deliveries has no append-only trigger (mutable per D-311).
  WITH del AS (
    DELETE FROM public.webhook_deliveries
    WHERE ts < now() - (retention_days || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;

  RETURN QUERY SELECT total, removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_webhook_deliveries(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_webhook_deliveries(int, int) TO service_role;

CREATE INDEX IF NOT EXISTS webhook_deliveries_ts_prune_idx ON public.webhook_deliveries(ts);

NOTIFY pgrst, 'reload schema';
