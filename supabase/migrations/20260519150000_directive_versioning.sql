-- V6 Phase 3 (D-611) — AI Workflow Builder schema extension.
--
-- Five additive columns on `directives` so a workflow row can carry
-- a compiled DAG, a version chain, and a sandbox-test stamp:
--
--   version              int NOT NULL DEFAULT 1
--   parent_id            uuid REFERENCES directives(id)
--   compiled_dag         jsonb NULL (the source of truth for D-611
--                        workflows; legacy directives leave this NULL
--                        and continue to dispatch through the V0 runtime)
--   test_payloads        jsonb NOT NULL DEFAULT '[]' (LRU 5 sample
--                        payloads the operator tested against)
--   last_test_passed_at  timestamptz NULL (publish gate; wiped on every
--                        save, set on a successful sandboxRun)
--
-- D-615 already added `lifecycle_status` / `submitted_by` / `submitted_at`
-- / `decided_by` / `decided_at` / `rejection_reason` — D-611 layers on top.
--
-- Additive only — IF NOT EXISTS throughout, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER TABLE public.directives
--     DROP COLUMN IF EXISTS last_test_passed_at,
--     DROP COLUMN IF EXISTS test_payloads,
--     DROP COLUMN IF EXISTS compiled_dag,
--     DROP COLUMN IF EXISTS parent_id,
--     DROP COLUMN IF EXISTS version;

ALTER TABLE directives
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES directives(id),
  ADD COLUMN IF NOT EXISTS compiled_dag jsonb,
  ADD COLUMN IF NOT EXISTS test_payloads jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_test_passed_at timestamptz;

-- Hot path: walk a version chain by parent.
CREATE INDEX IF NOT EXISTS directives_parent_idx
  ON directives (parent_id)
  WHERE parent_id IS NOT NULL;

-- Hot path: workflows-with-compiled-dag list (D-611 vs legacy split).
CREATE INDEX IF NOT EXISTS directives_compiled_dag_idx
  ON directives (organization_id)
  WHERE compiled_dag IS NOT NULL;

NOTIFY pgrst, 'reload schema';
