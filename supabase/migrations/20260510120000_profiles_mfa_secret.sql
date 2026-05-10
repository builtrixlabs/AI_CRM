-- D-300 — Real TOTP MFA + recovery codes
-- Additive: profiles.mfa_secret jsonb (encrypted TOTP secret),
--           profiles.mfa_recovery_codes jsonb (array of bcrypt hashes),
--           profiles.mfa_enrolled_at timestamptz.
-- RLS unchanged — profiles is already tenant-scoped via D-001.
-- Builds on D-209 (profiles.mfa_verified_at).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_secret jsonb NULL,
  ADD COLUMN IF NOT EXISTS mfa_recovery_codes jsonb NULL,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.mfa_secret IS
  'AES-256-GCM encrypted TOTP secret. Shape: {iv, ciphertext, alg, key_version}. NEVER plaintext or hash.';
COMMENT ON COLUMN public.profiles.mfa_recovery_codes IS
  'Array of {hash: string, used_at: timestamptz | null, used_from_ip: string | null}. 10 entries at enrollment.';
COMMENT ON COLUMN public.profiles.mfa_enrolled_at IS
  'When the user completed TOTP enrollment. NULL = not enrolled (fall back to MFA_DEMO_MODE bypass or block).';
