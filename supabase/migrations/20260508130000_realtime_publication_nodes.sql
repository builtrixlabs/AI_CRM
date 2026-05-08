-- D-006 follow-up — add `nodes` to the supabase_realtime publication.
--
-- Without this, postgres_changes broadcasts for the canvas:lead:<id>
-- channel (Activity Stream) are silently dropped. D-006 spec AC-14
-- requires rep A to receive the broadcast; the integration test
-- canvas-realtime-isolation.test.ts catches the omission.
--
-- Idempotent: skips if `nodes` is already a publication member.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'nodes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
