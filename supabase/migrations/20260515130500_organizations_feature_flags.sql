-- v6.2.1 (D-617 phase) — Per-org feature flag bag.
--
-- Adds a free-form jsonb column on `organizations` that the app reads to
-- gate progressive-rollout features. Initial flag shipped behind this
-- column: `lead_canvas_v2` (boolean) — gates the new split-pane lead
-- canvas with the AI Drafts inline-approval tab.
--
-- Shape contract (closed, but TS-only — no DB CHECK on jsonb keys):
--   {
--     "lead_canvas_v2": boolean | undefined
--     // future flags land alongside
--   }
--
-- Default `'{}'::jsonb` means every existing org is on the legacy canvas
-- until super_admin (or org_admin via /platform/organizations/[id])
-- flips the flag to true. NOT NULL because reading a NULL flag bag is
-- meaningless — a missing flag returns the falsy default in TS.
--
-- Additive only — IF NOT EXISTS guard, idempotent on re-apply.
-- Transaction control: apply_migration.mjs wraps this file in BEGIN/COMMIT.
--
-- ROLLBACK:
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS feature_flags;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.feature_flags IS
  'v6.2.1 — per-org progressive-rollout flags. Read via getFeatureFlag() in src/lib/orgs/feature-flags.ts. Keys are TS-typed (FeatureFlag union).';

NOTIFY pgrst, 'reload schema';
