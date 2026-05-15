-- V6 Phase 2 (D-615) — AI Agent Approval Workflow: directive lifecycle.
--
-- Adds the approval lifecycle to the existing `directives` table. A
-- workflow authored by someone without directives:approve lands
-- 'pending_approval' (disabled, runtime-inert); an org admin approves it
-- to 'live' or rejects it to 'archived'.
--
--   1. lifecycle_status — CHECK-constrained; DEFAULT 'live' so every
--      pre-D-615 row (platform defaults + existing org rows) stays live
--      and the runtime's new lifecycle filter is a no-op for them.
--   2. submitted_by / submitted_at — stamped when a non-approver authors.
--   3. decided_by / decided_at / rejection_reason — stamped on approve/reject.
--   4. directives_org_pending_idx — the /admin/directives/pending queue read.
--
-- This is the subset of implementation-order §6's planned
-- `ai_workflow_versioning.sql` that D-615 needs; D-611 extends it later
-- with version / parent_id / compiled_dag / test_payloads.
--
-- Additive only — IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout,
-- idempotent on re-apply. No RLS change — the directives table already
-- has org-scoped RLS, and the approval helpers run on the service-role
-- client gated by directives:approve in the server action.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.directives_org_pending_idx;
--   ALTER TABLE public.directives
--     DROP COLUMN IF EXISTS lifecycle_status,
--     DROP COLUMN IF EXISTS submitted_by,
--     DROP COLUMN IF EXISTS submitted_at,
--     DROP COLUMN IF EXISTS decided_by,
--     DROP COLUMN IF EXISTS decided_at,
--     DROP COLUMN IF EXISTS rejection_reason;

ALTER TABLE directives
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'live'
    CHECK (lifecycle_status IN ('live', 'pending_approval', 'archived'));

ALTER TABLE directives ADD COLUMN IF NOT EXISTS submitted_by uuid;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS decided_by uuid;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Hot path: the org-admin pending-approval queue. Partial — only the rows
-- the queue ever reads.
CREATE INDEX IF NOT EXISTS directives_org_pending_idx
  ON directives (organization_id)
  WHERE lifecycle_status = 'pending_approval' AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
