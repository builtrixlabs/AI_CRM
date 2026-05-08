-- D-009 / A1 — agent_service_accounts + agent_tier enum.
-- The bounded-authority registry per Constitution I. Each row is a
-- service-account identity an agent acts under; max_tier locks its
-- ceiling. Cross-org (one row per agent type, all orgs share).

CREATE TYPE agent_tier AS ENUM ('T0', 'T1', 'T2', 'T3', 'T4');

CREATE TABLE agent_service_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type      text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  max_tier        agent_tier NOT NULL,
  prompt_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_service_accounts ENABLE ROW LEVEL SECURITY;
-- Service-role only; no authenticated policy. super_admin sees zero
-- rows; sales_rep sees zero rows. Belt-and-suspenders for D-009.

NOTIFY pgrst, 'reload schema';
