-- v6.2.1 (D-617 phase) — Realtime publication for agent_approval_queue.
--
-- Lifts the table into Supabase's built-in realtime publication so the
-- lead canvas AI Drafts tab can subscribe to INSERT events filtered by
-- lead_id and refresh the badge / card list when a new draft lands —
-- no full page refresh, no polling.
--
-- Channel filter on the client side: `lead_id=eq.<uuid>`. Server-side
-- enforcement (cross-tenant) still happens at the RLS layer; this only
-- controls which tables emit WAL events to the realtime gateway.
--
-- Additive only — wrapped in a DO block that checks pg_publication_tables
-- before ALTERing, so re-application after a partial apply is a no-op.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.agent_approval_queue;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_approval_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_approval_queue;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
