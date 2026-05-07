-- D-002 / B1 — enable pgvector for semantic search
-- Supabase managed databases support pgvector since 2023.
-- Idempotent: re-running on a project that already has the extension is a no-op.

CREATE EXTENSION IF NOT EXISTS vector;
