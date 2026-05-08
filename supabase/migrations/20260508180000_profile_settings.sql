-- 2026-05-08 — Profile settings fields for super-admin & operator UI.
--
-- Adds:
--   - profiles.phone               text NULL
--   - profiles.notification_prefs  jsonb NOT NULL DEFAULT '{}'
--   - profiles.theme               text NOT NULL DEFAULT 'system'
--                                  CHECK (theme IN ('light','dark','system'))
--
-- Theme could live in localStorage (next-themes) but mirroring it
-- server-side lets the no-flash <html data-theme=…> SSR path work.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone text NULL,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_theme_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('light','dark','system'));

NOTIFY pgrst, 'reload schema';
