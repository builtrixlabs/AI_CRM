-- D-011 / A1 — directives table.
--
-- Constitution V (DOE) + Principle X (NL-Compile-Then-Apply).
-- Each row maps a trigger to a tier-bounded action plan.
-- `organization_id IS NULL` = platform-default (all orgs inherit
-- unless they author an override row with the same `code`).

CREATE TABLE directives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES organizations(id),
  code            text NOT NULL,                       -- e.g. 'D-01' (PRD §5.7.1)
  display_name    text NOT NULL,
  trigger_kind    text NOT NULL,                       -- 'lead.created' | ...
  trigger_config  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- predicate args
  action_kind     text NOT NULL,                       -- 'surface_on_canvas' | ...
  action_config   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- handler args
  tier            text NOT NULL CHECK (tier IN ('T0','T1','T2','T3','T4')),
  enabled         boolean NOT NULL DEFAULT true,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL DEFAULT 'system'
                   CHECK (created_via IN ('manual','system','ai_extraction')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL DEFAULT 'system',
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL
);

CREATE INDEX directives_trigger_org_idx
  ON directives (trigger_kind, organization_id)
  WHERE deleted_at IS NULL AND enabled = true;

CREATE INDEX directives_code_org_idx
  ON directives (code, organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE directives ENABLE ROW LEVEL SECURITY;

-- SELECT: platform-default rows + own-org rows.
CREATE POLICY directives_select_inherited
  ON directives FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.app_org_id()
  );

-- super_admin can see all (helpful for support).
CREATE POLICY directives_select_super
  ON directives FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

NOTIFY pgrst, 'reload schema';
