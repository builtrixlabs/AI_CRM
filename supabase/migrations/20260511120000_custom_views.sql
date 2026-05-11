-- D-413 / A1 — custom_views: per-org per-entity-type saved list views
--
-- A "view" is a saved (filters + columns + sort) bundle on top of an entity
-- list page. View can be `scope='org'` (shared, owner_id NULL) or
-- `scope='user'` (private, owner_id = profiles.id). Filters/columns/sort
-- are JSONB and interpreted by src/lib/views/compile-filters.ts at query
-- time — no SQL-injection surface (compiler is pure + validated upstream).
--
-- Additive only — no DROP, no destructive ALTER. Idempotent on re-apply
-- via IF NOT EXISTS / CREATE OR REPLACE.

CREATE TABLE IF NOT EXISTS custom_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     text NOT NULL CHECK (entity_type IN
                  ('lead','deal','contact','property','unit','site_visit',
                   'document','activity','note','call')),
  scope           text NOT NULL CHECK (scope IN ('org','user')),
  owner_id        uuid NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  slug            text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{0,49}$'),
  filters         jsonb NOT NULL DEFAULT '[]'::jsonb,
  columns         jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort            jsonb NULL,
  -- Provenance (Constitution III)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  created_via     text NOT NULL DEFAULT 'manual',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  updated_via     text NOT NULL DEFAULT 'manual',
  deleted_at      timestamptz NULL,
  deleted_by      uuid NULL,
  deleted_reason  text NULL,
  -- Scope invariant: org views have NULL owner; user views have non-NULL owner.
  CONSTRAINT custom_views_scope_owner CHECK (
    (scope = 'user' AND owner_id IS NOT NULL)
    OR
    (scope = 'org'  AND owner_id IS NULL)
  )
);

-- ── Unique slug per scope (partial, NULL-aware) ─────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS custom_views_org_slug_uq
  ON custom_views (organization_id, entity_type, slug)
  WHERE scope = 'org' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS custom_views_user_slug_uq
  ON custom_views (organization_id, entity_type, owner_id, slug)
  WHERE scope = 'user' AND deleted_at IS NULL;

-- ── Hot path: list by (org, type), live rows ────────────────────────────
CREATE INDEX IF NOT EXISTS custom_views_org_type_scope_idx
  ON custom_views (organization_id, entity_type, scope)
  WHERE deleted_at IS NULL;

ALTER TABLE custom_views ENABLE ROW LEVEL SECURITY;

-- ── RLS: SELECT — same-org AND (org-scope OR own) ───────────────────────
DROP POLICY IF EXISTS custom_views_select_own ON custom_views;
CREATE POLICY custom_views_select_own
  ON custom_views FOR SELECT TO authenticated
  USING (
    public.app_is_super_admin()
    OR (
      organization_id = public.app_org_id()
      AND (
        scope = 'org'
        OR (scope = 'user' AND owner_id = (select auth.uid()))
      )
    )
  );

-- ── RLS: INSERT — org-scope needs admin perm, user-scope needs self-owner ──
DROP POLICY IF EXISTS custom_views_insert_own ON custom_views;
CREATE POLICY custom_views_insert_own
  ON custom_views FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_super_admin()
    OR (
      organization_id = public.app_org_id()
      AND (
        (scope = 'org'  AND public.app_is_org_admin_or_super())
        OR (scope = 'user' AND owner_id = (select auth.uid()))
      )
    )
  );

-- ── RLS: UPDATE — same gate as INSERT; both USING and WITH CHECK ────────
DROP POLICY IF EXISTS custom_views_update_own ON custom_views;
CREATE POLICY custom_views_update_own
  ON custom_views FOR UPDATE TO authenticated
  USING (
    public.app_is_super_admin()
    OR (
      organization_id = public.app_org_id()
      AND (
        (scope = 'org'  AND public.app_is_org_admin_or_super())
        OR (scope = 'user' AND owner_id = (select auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR (
      organization_id = public.app_org_id()
      AND (
        (scope = 'org'  AND public.app_is_org_admin_or_super())
        OR (scope = 'user' AND owner_id = (select auth.uid()))
      )
    )
  );

-- DELETE not exposed; soft-delete via UPDATE deleted_at.

-- ── Scope/owner immutability trigger ────────────────────────────────────
-- Once a view's scope/owner are set, they cannot be changed. UPDATE may
-- modify filters/columns/sort/name/sort_order/audit cols; not scope/owner.
CREATE OR REPLACE FUNCTION public.custom_views_lock_scope_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scope IS DISTINCT FROM OLD.scope THEN
    RAISE EXCEPTION 'custom_views.scope is immutable';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'custom_views.owner_id is immutable';
  END IF;
  IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN
    RAISE EXCEPTION 'custom_views.entity_type is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custom_views_lock_scope_owner_trg ON custom_views;
CREATE TRIGGER custom_views_lock_scope_owner_trg
  BEFORE UPDATE ON custom_views
  FOR EACH ROW EXECUTE FUNCTION public.custom_views_lock_scope_owner();

-- ── profiles.view_defaults: per-user default view per entity_type ───────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS view_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Shape: { "lead": "<uuid>", "deal": "<uuid>", ... } — one default per entity_type per profile.

-- ── RPC: set_view_default(view_id) — writes view_defaults[entity_type] ──
-- Caller-bound: uses auth.uid() to identify the profile.
-- Verifies the view is readable to the caller (RLS handles it) and that
-- the entity_type slot is updated atomically.
CREATE OR REPLACE FUNCTION public.set_view_default(p_view_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity_type text;
  v_profile_id  uuid := auth.uid();
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- RLS scopes the read; if the caller can't SELECT it, this returns NULL.
  SELECT entity_type INTO v_entity_type
  FROM custom_views
  WHERE id = p_view_id AND deleted_at IS NULL;

  IF v_entity_type IS NULL THEN
    RAISE EXCEPTION 'view not found or not readable';
  END IF;

  UPDATE profiles
  SET view_defaults = view_defaults || jsonb_build_object(v_entity_type, p_view_id::text),
      updated_at    = now(),
      updated_by    = v_profile_id,
      updated_via   = 'manual'
  WHERE id = v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_view_default(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
