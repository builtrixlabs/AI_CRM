-- D-322 — agent_approval_queue: T2 agent drafts pending org-admin review.
--
-- One queue row per agent run. Status state machine:
--   pending -> approved | rejected
--   approved -> sent (when delivery succeeds; V3.x wires the actual
--   send. v3 MVP records the approval; the org-admin can manually
--   send via existing channel surfaces.)

CREATE TABLE IF NOT EXISTS public.agent_approval_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES public.workspaces(id),
  lead_id             uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  agent_kind          text NOT NULL,
  channel             text NOT NULL,
  draft_body          text NOT NULL,
  edited_body         text,
  status              text NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_agent_id uuid,
  decided_at          timestamptz,
  decided_by          uuid,
  decision_reason     text,
  CONSTRAINT agent_approval_queue_channel_chk
    CHECK (channel IN ('whatsapp','email')),
  CONSTRAINT agent_approval_queue_status_chk
    CHECK (status IN ('pending','approved','rejected','sent'))
);

COMMENT ON TABLE public.agent_approval_queue IS
  'D-322 — T2 agent drafts pending org-admin approval. One pending row per (org, lead, agent_kind).';

-- Dedupe: at most one pending draft per (org, lead, agent_kind).
CREATE UNIQUE INDEX IF NOT EXISTS agent_approval_queue_pending_uniq
  ON public.agent_approval_queue (organization_id, lead_id, agent_kind)
  WHERE status = 'pending';

-- Operator query — list pending in an org by created_at:
CREATE INDEX IF NOT EXISTS agent_approval_queue_org_pending_idx
  ON public.agent_approval_queue (organization_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.agent_approval_queue ENABLE ROW LEVEL SECURITY;

-- Tenant SELECT — readable by anyone in the org with the right perm
-- (perm gate happens at the page layer; RLS just enforces tenant).
CREATE POLICY agent_approval_queue_select_own_org
  ON public.agent_approval_queue
  FOR SELECT
  TO authenticated
  USING (organization_id = public.app_org_id());

-- Mutations via service-role only (the cron + actions use admin client).
-- No INSERT/UPDATE/DELETE policy = no authenticated path.

NOTIFY pgrst, 'reload schema';
