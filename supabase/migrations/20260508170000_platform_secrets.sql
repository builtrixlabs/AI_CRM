-- D-016 / A1 — platform_secrets: super_admin-managed runtime secrets.
--
-- Stores keys / signing secrets that the operator wants to rotate without
-- touching Vercel env vars (per Operator request, 2026-05-08).
--
-- Resolution order at runtime (src/lib/secrets/getSecret.ts):
--   1. platform_secrets.value      (this table)
--   2. process.env[<env_name>]     (Vercel fallback)
--   3. (none) -> caller decides
--
-- RLS:
--   - SELECT: super_admin only via authenticated path. Service role can
--     SELECT (used by gateway/webhook routes server-side).
--   - INSERT/UPDATE: service role only (server actions use the admin client).
--
-- Stored as plain text — Supabase encrypts at rest by default. The UI
-- never round-trips the full value back to the client; only `last4` +
-- `is_set` are exposed via the redaction view.

CREATE TABLE platform_secrets (
  kind            text PRIMARY KEY,
  value           text NOT NULL,
  last4           text NOT NULL,           -- pre-computed for redacted display
  -- Provenance (Constitution III; super_admin-only writes)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  rotated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_secrets_kind_idx ON platform_secrets (kind);

ALTER TABLE platform_secrets ENABLE ROW LEVEL SECURITY;

-- Authenticated path: super_admin sees rows (`last4` only via the view
-- below; the table itself stores the raw value but is gated).
CREATE POLICY platform_secrets_select_super_admin
  ON platform_secrets FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

-- A SECURITY INVOKER view that exposes only the redacted shape. The UI
-- queries this view via the authenticated path; the raw `value`
-- column is never reachable to authenticated callers.
CREATE OR REPLACE VIEW platform_secrets_redacted
  WITH (security_invoker = true)
  AS
  SELECT kind, last4, created_at, updated_at, rotated_at
    FROM platform_secrets;

GRANT SELECT ON platform_secrets_redacted TO authenticated;

NOTIFY pgrst, 'reload schema';
