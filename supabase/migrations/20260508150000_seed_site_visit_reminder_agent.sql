-- D-012 / A1 — seed site_visit_reminder service account.
-- Adds a single global agent row (one per agent_type per
-- D-009.11). max_tier='T2' (templated comms only).

INSERT INTO agent_service_accounts (agent_type, display_name, max_tier, prompt_version)
VALUES ('site_visit_reminder', 'Site Visit Reminder Agent', 'T2', 'v1')
ON CONFLICT (agent_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
