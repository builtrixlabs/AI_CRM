-- D-207 — platform_flags: super-admin runtime-tunable flags.

CREATE TABLE platform_flags (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL
);

ALTER TABLE platform_flags ENABLE ROW LEVEL SECURITY;

-- super_admin can read all flags.
CREATE POLICY platform_flags_select_super
  ON platform_flags FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

-- Authenticated users (any role) can read selected non-sensitive flags.
-- For v2 demo lens we keep all reads gated to super_admin; non-super
-- callers go through the library which uses service-role.
-- (Service role bypasses RLS — used by getFlag from server-side libs.)

-- Defaults.
INSERT INTO platform_flags (key, value, description, updated_by) VALUES
  ('force_mfa',
   'false'::jsonb,
   'When true, sensitive routes refuse to render until MFA is fresh (D-209).',
   '00000000-0000-0000-0000-000000000000'),
  ('demo_mode',
   'true'::jsonb,
   'V2 demo posture — disables MFA gate + relaxes some flow protections.',
   '00000000-0000-0000-0000-000000000000'),
  ('voice_iq_platform_enabled',
   'true'::jsonb,
   'Master switch for the Voice IQ inbox. When false, /api/events/inbox returns 503.',
   '00000000-0000-0000-0000-000000000000'),
  ('default_token_budget_per_org_per_month',
   '5000000'::jsonb,
   'Default monthly token budget when an org has no explicit cap (D-009).',
   '00000000-0000-0000-0000-000000000000')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
