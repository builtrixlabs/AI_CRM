-- D-311 — extend D-208 schema for the real outbound delivery worker.

-- ── webhook_endpoints: auto-disable + counter ──
ALTER TABLE public.webhook_endpoints
  ADD COLUMN IF NOT EXISTS disabled_at           timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures  integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.webhook_endpoints.disabled_at IS
  'D-311 — set by worker when consecutive_failures hits 10. Org-admin manually re-enables.';
COMMENT ON COLUMN public.webhook_endpoints.consecutive_failures IS
  'D-311 — running count, reset on any successful delivery.';

-- ── webhook_deliveries: payload + state machine + retry ──
ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempt_number  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at   timestamptz,
  ADD COLUMN IF NOT EXISTS error_message   text,
  ADD COLUMN IF NOT EXISTS delivered_at    timestamptz;

-- Loosen the v2 NOT NULL on status_code — pending rows have no code yet.
ALTER TABLE public.webhook_deliveries
  ALTER COLUMN status_code DROP NOT NULL,
  ALTER COLUMN status_code SET DEFAULT NULL;

-- Status state-machine guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_name = 'webhook_deliveries'
       AND constraint_name = 'webhook_deliveries_status_chk'
  ) THEN
    ALTER TABLE public.webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_status_chk
      CHECK (status IN ('pending','delivered','failed','dead'));
  END IF;
END
$$;

COMMENT ON COLUMN public.webhook_deliveries.status IS
  'D-311 — pending=in queue, delivered=2xx, failed=4xx (no retry), dead=retries exhausted.';
COMMENT ON COLUMN public.webhook_deliveries.next_retry_at IS
  'D-311 — when the worker should pick this row up. NULL on terminal states.';

-- Worker poll: pending rows with next_retry_at <= now(), oldest first.
CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_idx
  ON public.webhook_deliveries (next_retry_at)
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
