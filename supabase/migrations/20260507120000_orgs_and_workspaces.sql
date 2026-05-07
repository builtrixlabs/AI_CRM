-- D-001 / B1 — organizations, workspaces, teams + JWT-claim helpers
--
-- Constitution III (provenance) and II (tenant isolation) bind every table here.
-- All migrations in this directive are additive. Soft-delete only.

-- ── Helper: read organization_id claim from request JWT ──────────────────────
-- Supabase Auth Hook (declared in migration 002) injects organization_id
-- into the JWT for non-super_admin users. This SQL helper exposes it to RLS.
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id'),
    ''
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'base_role') = 'super_admin',
    false
  )
$$;

-- ── organizations ────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  rera_number           text NULL,
  gstin                 text NULL,
  primary_contact_email text NULL,
  plan_tier             text NOT NULL DEFAULT 'starter'
                        CHECK (plan_tier IN ('starter','professional','enterprise','custom')),
  onboarding_state      jsonb NOT NULL
                        DEFAULT '{"completed_steps":[],"current_step":"org_details"}'::jsonb,
  -- Provenance (Constitution III)
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  created_via           text NOT NULL CHECK (created_via IN
                        ('manual','call_audit','whatsapp','email','api_sync',
                         'ai_extraction','import','cp_portal','mih_event','system')),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  updated_via           text NOT NULL,
  source_event_id       uuid NULL,
  ai_confidence         numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at            timestamptz NULL,
  deleted_by            uuid NULL,
  deleted_reason        text NULL
);

CREATE INDEX organizations_slug_idx ON organizations (slug) WHERE deleted_at IS NULL;

-- ── workspaces ───────────────────────────────────────────────────────────────
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  slug            text NOT NULL,
  name            text NOT NULL,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL,
  UNIQUE (organization_id, slug)
);

CREATE INDEX workspaces_org_idx ON workspaces (organization_id) WHERE deleted_at IS NULL;

-- ── teams ────────────────────────────────────────────────────────────────────
CREATE TABLE teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  -- Provenance
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL,
  source_event_id uuid NULL,
  ai_confidence   numeric(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1)),
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL,
  UNIQUE (workspace_id, name)
);

CREATE INDEX teams_workspace_idx ON teams (workspace_id) WHERE deleted_at IS NULL;
