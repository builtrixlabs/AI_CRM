-- D-005 / A1 — branding jsonb on organizations
--
-- D-005 step 2 (Branding) writes primary_color / accent_color / logo_url
-- here. JSONB shape validated by Zod in src/lib/admin/onboarding.ts; no
-- DB CHECK (Constitution VIII single source — TS schema is authoritative).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
