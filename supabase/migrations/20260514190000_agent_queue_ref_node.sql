-- V6 Phase 2 (D-601) — Site Visit Booking Agent: link a queue row to a node.
--
-- A `site_visit_booking` agent_approval_queue row needs to point at the
-- draft `site_visit` node it was created for, so the submit action can
-- find + finalize that visit. The table has `lead_id` but no generic
-- node reference, so D-601 adds one:
--   - ref_node_id uuid — the node this queue item refers to (the draft
--     site_visit for booking rows; null for brochure / follow-up rows).
--
-- ON DELETE SET NULL: nodes are soft-deleted (deleted_at) in normal
-- operation, but if a node is ever hard-deleted the queue row survives
-- with a null reference rather than blocking the delete.
--
-- Additive only — IF NOT EXISTS, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER TABLE public.agent_approval_queue DROP COLUMN IF EXISTS ref_node_id;

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS ref_node_id uuid
  REFERENCES public.nodes(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
