-- D-009 / A3 — audit_log agent-tier ceiling trigger.
-- Belt-and-suspenders defense (D-007.9 pattern): runtime enforces
-- agent.max_tier; this trigger rejects audit rows where
-- agent_tier > service_account.max_tier even if the runtime is
-- bypassed (future direct service-role inserts, future agents).

-- Numeric rank for tier comparison: T0 < T1 < T2 < T3 < T4.
CREATE OR REPLACE FUNCTION agent_tier_rank(t text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'T0' THEN 0
    WHEN 'T1' THEN 1
    WHEN 'T2' THEN 2
    WHEN 'T3' THEN 3
    WHEN 'T4' THEN 4
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION audit_log_enforce_agent_ceiling()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  agent_max text;
BEGIN
  -- Skip non-agent rows.
  IF NEW.actor_type <> 'agent' OR NEW.agent_tier IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT max_tier::text INTO agent_max
    FROM agent_service_accounts WHERE id = NEW.actor_id;
  IF agent_max IS NULL THEN
    RAISE EXCEPTION 'audit_log: actor_id % is not a registered agent service account', NEW.actor_id;
  END IF;
  IF agent_tier_rank(NEW.agent_tier) > agent_tier_rank(agent_max) THEN
    RAISE EXCEPTION 'audit_log: agent_tier % exceeds service-account max_tier %',
      NEW.agent_tier, agent_max;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_agent_ceiling
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_enforce_agent_ceiling();

NOTIFY pgrst, 'reload schema';
