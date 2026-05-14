-- V6 Phase 0 (step 0.5) — narrow org_sister_product_tokens.product_kind to
-- Marketing Intelligence Hub only. PSCRM + Legal Auditor + lead-sources
-- product kinds are dropped per implementation-order §5.5 + §2.5 (D-442,
-- D-443 REPACKAGE: "Keep MIH inbound only").
--
-- Note: implementation-order §5.5 wrote this as `ALTER TYPE product_kind`,
-- but product_kind is a `text` column with a CHECK constraint (D-440
-- migration 20260513150000), not a Postgres enum. So this is a
-- DROP CONSTRAINT / DELETE rows / ADD CONSTRAINT instead.
--
-- Pre-V6 tokens (post_sales_crm / lead_sources / legal_auditor) cannot
-- authenticate anything in V6 and would violate the new CHECK, so they are
-- deleted forward. V6 issues marketing_intelligence_hub tokens only.
--
-- ROLLBACK:
--   ALTER TABLE public.org_sister_product_tokens
--     DROP CONSTRAINT org_sister_product_tokens_product_kind_check;
--   ALTER TABLE public.org_sister_product_tokens
--     ADD CONSTRAINT org_sister_product_tokens_product_kind_check
--     CHECK (product_kind IN ('post_sales_crm','lead_sources','legal_auditor'));
--   -- (deleted pre-V6 token rows are not restored — forward-only delete.)
--
-- Transaction control: apply_migration.mjs already wraps this file in its
-- own BEGIN/COMMIT, so this file does not open its own transaction.

-- 1. Drop the existing CHECK constraint. D-440 created it as an inline
--    column constraint, so the name was auto-generated — resolve it
--    dynamically rather than guessing.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.org_sister_product_tokens'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%product_kind%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.org_sister_product_tokens DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END $$;

-- 2. Delete pre-V6 tokens — they are all post_sales_crm / lead_sources /
--    legal_auditor (the V5 enum had no marketing_intelligence_hub), so
--    every existing row would violate the new CHECK.
DELETE FROM public.org_sister_product_tokens
  WHERE product_kind <> 'marketing_intelligence_hub';

-- 3. New V6 CHECK — Marketing Intelligence Hub only.
ALTER TABLE public.org_sister_product_tokens
  ADD CONSTRAINT org_sister_product_tokens_product_kind_check
  CHECK (product_kind IN ('marketing_intelligence_hub'));

NOTIFY pgrst, 'reload schema';
