-- D-206 — extend support_tickets for full inbox UI.
--
-- Additive: kind (categorization for D-201 plan-upgrade hook) + replies
-- (jsonb thread). Existing rows get default `[]` for replies and NULL for
-- kind. Status CHECK unchanged (open / responded / closed).

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS kind text NULL,
  ADD COLUMN IF NOT EXISTS replies jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS support_tickets_kind_idx
  ON support_tickets (kind)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
