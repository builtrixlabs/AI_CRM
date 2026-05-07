-- Migration: <NNN>_<verb>_<subject>
-- Author: Vibe OS V4 (directive <DIRECTIVE_ID>)
-- Strategy: additive only

BEGIN;

-- Forward
CREATE TABLE IF NOT EXISTS <table> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- domain columns here
);

CREATE INDEX IF NOT EXISTS <table>_user_id_idx ON <table>(user_id);

-- RLS (pair with supabase-rls-policy skill)
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

COMMIT;

-- rollback:
-- BEGIN;
-- DROP INDEX IF EXISTS <table>_user_id_idx;
-- DROP TABLE IF EXISTS <table>;
-- COMMIT;
