-- D-002 / B5 — embedding refresh queue + trigger
--
-- Every nodes INSERT or UPDATE OF (data, label) enqueues a row here. D-002
-- ships the queue + an Inngest stub that marks rows 'deferred-d009'.
-- D-009 (Model Gateway) will pick them up and compute embeddings.

CREATE TABLE embedding_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id      uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (reason IN ('insert','update','manual_refresh')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','done','failed','deferred-d009')),
  attempts     int NOT NULL DEFAULT 0,
  last_error   text NULL,
  processed_at timestamptz NULL
);

CREATE INDEX embedding_queue_status_idx
  ON embedding_queue (status, requested_at);

-- Trigger function: insert one queue row per nodes change. SECURITY DEFINER
-- so the function runs as the table owner, allowing INSERT into
-- embedding_queue regardless of the caller's role (the queue has no
-- authenticated INSERT policy by design).
CREATE OR REPLACE FUNCTION public.enqueue_node_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO embedding_queue (node_id, reason)
  VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END);
  PERFORM pg_notify('node_embedding_request', NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nodes_after_change_enqueue_embedding ON nodes;
CREATE TRIGGER nodes_after_change_enqueue_embedding
  AFTER INSERT OR UPDATE OF data, label
  ON nodes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_node_embedding();
