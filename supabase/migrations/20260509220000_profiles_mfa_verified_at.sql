-- D-209 — profiles.mfa_verified_at: per-user freshness stamp.
--
-- NULL = never verified. Bumped by /auth/mfa verify flow (D-209 stub;
-- real OTP/TOTP V3).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS profiles_mfa_verified_at_idx
  ON profiles (mfa_verified_at);

NOTIFY pgrst, 'reload schema';
