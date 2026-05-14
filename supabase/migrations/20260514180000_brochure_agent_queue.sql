-- V6 Phase 2 (D-600) — Brochure Agent: extend agent_approval_queue.
--
-- The Brochure Agent writes a queue row with agent_kind='brochure_send'.
-- Two columns it needs that D-322/D-415 didn't ship:
--   - attachments jsonb — the brochure refs [{ brochure_id, title,
--     document_type }]. The signed URL is resolved fresh at dispatch
--     time (1h expiry), so only the ref is stored here, never a URL.
--   - error text — agent-level errors (e.g. 'no_match' when no brochure
--     matched). Distinct from the existing send_error column, which is a
--     *dispatch*-level error from D-415.
--
-- PRD-v6.0 §D-600's data model says "ADD COLUMN kind" — but the table
-- already has agent_kind (D-322). The brochure agent uses agent_kind;
-- only attachments + error are genuinely new.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER TABLE public.agent_approval_queue DROP COLUMN IF EXISTS attachments;
--   ALTER TABLE public.agent_approval_queue DROP COLUMN IF EXISTS error;

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';

ALTER TABLE public.agent_approval_queue
  ADD COLUMN IF NOT EXISTS error text NULL;

NOTIFY pgrst, 'reload schema';
