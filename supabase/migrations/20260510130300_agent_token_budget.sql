-- V3.x — per-org token-budget cap on agent runs
--
-- Backlog item 38 (H). agent_org_configs gains:
--   monthly_token_budget   int NULL — cap on tokens_in+tokens_out per
--                                     calendar month for this (org, agent).
--                                     NULL means "no override" (uses
--                                     plan-tier default; D-124 backlog).
--
-- Plus a SECURITY DEFINER function `get_agent_token_usage_this_month` that
-- returns total tokens for the running calendar month, used by the agent
-- runtime to bail out before hitting the LLM provider.

ALTER TABLE agent_org_configs
  ADD COLUMN IF NOT EXISTS monthly_token_budget int NULL
    CHECK (monthly_token_budget IS NULL OR monthly_token_budget >= 0);

COMMENT ON COLUMN agent_org_configs.monthly_token_budget IS
  'Hard cap on tokens_in+tokens_out per calendar month. NULL = use plan-tier default (V3.x backlog item 56). 0 = block agent entirely. Enforced in lib/agents/budget.ts before LLM dispatch.';

CREATE OR REPLACE FUNCTION public.get_agent_token_usage_this_month(
  p_org_id uuid,
  p_agent_type text
) RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT COALESCE(SUM(tokens_in + tokens_out), 0)
    INTO v_total
    FROM token_usage_ledger u
    JOIN agent_service_accounts a ON a.id = u.agent_id
   WHERE u.organization_id = p_org_id
     AND a.agent_type = p_agent_type
     AND u.ts >= date_trunc('month', now())
     AND u.status = 'ok';
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_token_usage_this_month(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agent_token_usage_this_month(uuid, text) TO authenticated, service_role;
