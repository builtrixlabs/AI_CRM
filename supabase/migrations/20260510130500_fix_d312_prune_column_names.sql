-- V3.x — fix V3.0 D-312 prune functions to use the correct timestamp columns
--
-- The V3.0 migration 20260510120400_audit_retention_and_prune.sql created
-- prune_api_audit_log() and prune_event_inbox_log() that filter on
-- `created_at` and `received_at` respectively. The actual schema for both
-- tables uses `ts` (verified in 20260507120300_audit_log.sql,
-- 20260508160000_event_inbox_log.sql, 20260509210000_webhooks.sql).
--
-- Live-DB apply on `apply-pending-migrations.ts` blew up with:
--   ERROR: column "created_at" does not exist
--
-- This migration is the corrected version. It:
--   - CREATE OR REPLACE the two broken prune functions with `ts`
--   - CREATE INDEX IF NOT EXISTS on `ts` for both tables (the original
--     CREATE INDEX line in 20260510120400 was never reached because the
--     function body failed first; we add it here for the prune query plan).
--   - leaves prune_webhook_deliveries alone — that one was already correct.
--
-- Idempotent on re-apply: CREATE OR REPLACE + IF NOT EXISTS.

CREATE OR REPLACE FUNCTION public.prune_api_audit_log(
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
  SELECT count(*) INTO total FROM public.api_audit_log;
  IF total <= min_floor THEN
    RETURN QUERY SELECT total, 0::bigint;
    RETURN;
  END IF;

  -- Disable the append-only trigger for this transaction's DELETE only.
  ALTER TABLE public.api_audit_log DISABLE TRIGGER api_audit_log_no_delete;
  WITH del AS (
    DELETE FROM public.api_audit_log
    WHERE ts < now() - (retention_days || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;
  ALTER TABLE public.api_audit_log ENABLE TRIGGER api_audit_log_no_delete;

  RETURN QUERY SELECT total, removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_api_audit_log(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_api_audit_log(int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_event_inbox_log(
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
  SELECT count(*) INTO total FROM public.event_inbox_log;
  IF total <= min_floor THEN
    RETURN QUERY SELECT total, 0::bigint;
    RETURN;
  END IF;

  -- event_inbox_log has an append-only trigger too (added by
  -- 20260508160000_event_inbox_log.sql). Disable for this tx only.
  -- event_inbox_log has an append-only no_delete trigger (added by
  -- 20260508160000_event_inbox_log.sql). Disable for this tx only.
  ALTER TABLE public.event_inbox_log DISABLE TRIGGER event_inbox_log_no_delete;
  WITH del AS (
    DELETE FROM public.event_inbox_log
    WHERE ts < now() - (retention_days || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;
  ALTER TABLE public.event_inbox_log ENABLE TRIGGER event_inbox_log_no_delete;

  RETURN QUERY SELECT total, removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_event_inbox_log(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_event_inbox_log(int, int) TO service_role;

-- Indexes on the correct `ts` columns (idempotent).
CREATE INDEX IF NOT EXISTS api_audit_log_ts_idx ON public.api_audit_log(ts);
CREATE INDEX IF NOT EXISTS event_inbox_log_ts_idx ON public.event_inbox_log(ts);
