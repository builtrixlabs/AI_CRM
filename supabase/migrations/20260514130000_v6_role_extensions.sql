-- V6 Phase 1 (D-602; implementation-order §6 role_extensions.sql) —
-- extend the base_role enum with the four V6 roles from PRD-v6.0 §2.
--
-- D-602 lands this because it is the first Phase-1 directive that needs a
-- new role (site_visit_coordinator), and D-610 (same phase) needs
-- presales_rep. Bundling all four here avoids three further enum
-- migrations across Phase 1.
--
-- Transaction control: apply_migration.mjs wraps this file in its own
-- BEGIN/COMMIT. PostgreSQL 12+ (Supabase is 15) permits
-- `ALTER TYPE ... ADD VALUE` inside a transaction block provided the new
-- value is not *used* in the same transaction. This file only adds values
-- — no INSERT, no dependent DDL — so it is transaction-safe.
-- `ADD VALUE IF NOT EXISTS` makes it idempotent on re-apply.
--
-- ROLLBACK:
--   PostgreSQL has no `ALTER TYPE ... DROP VALUE`. To revert, the enum
--   must be recreated: rename base_role -> base_role_old, CREATE TYPE
--   base_role with the original 9 values, ALTER every dependent column,
--   DROP TYPE base_role_old. Not scripted — forward-only by design (the
--   four values are additive and inert until a profile is assigned one).

ALTER TYPE base_role ADD VALUE IF NOT EXISTS 'presales_rep';
ALTER TYPE base_role ADD VALUE IF NOT EXISTS 'telemarketing_rep';
ALTER TYPE base_role ADD VALUE IF NOT EXISTS 'customer_recovery_rep';
ALTER TYPE base_role ADD VALUE IF NOT EXISTS 'site_visit_coordinator';

NOTIFY pgrst, 'reload schema';
