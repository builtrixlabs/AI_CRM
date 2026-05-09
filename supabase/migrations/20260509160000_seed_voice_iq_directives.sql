-- D-131 / Phase A — seed 4 platform-default Voice IQ directives.
--
-- Per-org override pattern is identical to D-011 / D-017: writing a row
-- with the same `code` and the org's id shadows these defaults. Org admins
-- can pause / re-tier from /admin/directives.

DO $$
DECLARE
  sys_uuid uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO directives (organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, created_by, updated_by, created_via, updated_via) VALUES
  (NULL, 'D-VIQ-01', 'Voice IQ: BANT extracted → surface BANT summary',
   'call.bant_extracted', '{}'::jsonb,
   'surface_on_canvas',
   jsonb_build_object('kind','bant_summary','title','BANT (Voice IQ)'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-VIQ-02', 'Voice IQ: intent crossed 0.75 → notify assigned rep',
   'lead.intent_changed',
   jsonb_build_object('threshold',75),
   'notify_user',
   jsonb_build_object('audience','assigned_rep','severity','warm'),
   'T0', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-VIQ-03', 'Voice IQ: HIGH compliance flag → notify compliance',
   'call.compliance_flag', '{}'::jsonb,
   'notify_user',
   jsonb_build_object('audience','assigned_rep','severity','high'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-VIQ-04', 'Voice IQ: next-best-action → surface NBA card',
   'call.next_best_action', '{}'::jsonb,
   'surface_on_canvas',
   jsonb_build_object('kind','nba_suggestion','title','Suggested next action'),
   'T0', sys_uuid, sys_uuid, 'system', 'system')
ON CONFLICT DO NOTHING;

END $$;
