-- D-312 — retention prune for api_audit_log, event_inbox_log,
-- webhook_deliveries. Three SECURITY DEFINER prune fns + retention
-- defaults seeded into platform_flags (D-207). Daily Inngest cron at
-- 03:00 UTC calls these via service-role.

-- ── 1. seed retention defaults into platform_flags ──

INSERT INTO public.platform_flags (key, value, description, updated_at, updated_by)
VALUES
  ('retention_days_api_audit_log', '90'::jsonb,
   'D-312 — drop api_audit_log rows older than this many days. Daily prune at 03:00 UTC.',
   now(), '00000000-0000-0000-0000-000000000000'),
  ('retention_days_event_inbox_log', '30'::jsonb,
   'D-312 — drop event_inbox_log rows older than this many days. Daily prune.',
   now(), '00000000-0000-0000-0000-000000000000'),
  ('retention_days_webhook_deliveries', '60'::jsonb,
   'D-312 — drop webhook_deliveries rows older than this many days. Daily prune.',
   now(), '00000000-0000-0000-0000-000000000000'),
  ('retention_min_floor', '100'::jsonb,
   'D-312 — never prune a table whose total row count is at or below this floor. Protects fresh deploys.',
   now(), '00000000-0000-0000-0000-000000000000')
ON CONFLICT (key) DO NOTHING;

-- ── 2. prune fn: api_audit_log (append-only via trigger) ──

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
    WHERE created_at < now() - (retention_days || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;
  ALTER TABLE public.api_audit_log ENABLE TRIGGER api_audit_log_no_delete;

  RETURN QUERY SELECT total, removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_api_audit_log(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_api_audit_log(int, int) TO service_role;

-- ── 3. prune fn: event_inbox_log (append-only via trigger) ──

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

  ALTER TABLE public.event_inbox_log DISABLE TRIGGER event_inbox_log_no_delete;
  WITH del AS (
    DELETE FROM public.event_inbox_log
    WHERE received_at < now() - (retention_days || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;
  ALTER TABLE public.event_inbox_log ENABLE TRIGGER event_inbox_log_no_delete;

  RETURN QUERY SELECT total, removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_event_inbox_log(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_event_inbox_log(int, int) TO service_role;

-- ── 4. prune fn: webhook_deliveries (mutable per D-311) ──

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

-- ── 5. helpful indexes for the prune date filters ──

CREATE INDEX IF NOT EXISTS api_audit_log_created_at_idx
  ON public.api_audit_log(created_at);

CREATE INDEX IF NOT EXISTS event_inbox_log_received_at_idx
  ON public.event_inbox_log(received_at);

CREATE INDEX IF NOT EXISTS webhook_deliveries_ts_idx
  ON public.webhook_deliveries(ts);

NOTIFY pgrst, 'reload schema';
