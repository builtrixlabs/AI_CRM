-- D-011 / A3 — seed 15 platform-default directives (PRD §5.7.1).
--
-- All rows have organization_id=NULL. Per-org rows can override
-- by writing a row with the same `code` and the org's id. The
-- runtime UNION-ALL's both at dispatch time, with org-specific
-- shadowing platform-default.
--
-- created_by/updated_by use the system uuid (D-001.4 + bootstrap pattern).

DO $$
DECLARE
  sys_uuid uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO directives (organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, created_by, updated_by, created_via, updated_via) VALUES
  (NULL, 'D-01', 'On lead.created → run Lead Enrichment', 'lead.created', '{}'::jsonb,
   'enqueue_agent',
   jsonb_build_object('agent_type','lead_enrichment','action','enrich_lead','attempted_tier','T1'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-02', 'When lead is Qualified + silent 24h → send template T-08', 'lead.idle_threshold',
   jsonb_build_object('state','qualified','idle_hours',24),
   'send_template_message',
   jsonb_build_object('template_id','T-08','channel','whatsapp'),
   'T2', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-03', 'Site visit 24h away → confirmation reminder', 'site_visit.window',
   jsonb_build_object('hours_until',24),
   'send_template_message',
   jsonb_build_object('template_id','T-12','channel','whatsapp'),
   'T2', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-04', 'Site visit 2h away → map + parking', 'site_visit.window',
   jsonb_build_object('hours_until',2),
   'send_template_message',
   jsonb_build_object('template_id','T-13','channel','whatsapp'),
   'T2', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-05', 'Site visit completed → draft thank-you for rep approval', 'site_visit.state_changed',
   jsonb_build_object('to','completed'),
   'surface_on_canvas',
   jsonb_build_object('kind','agent_draft','title','Thank-you draft','tier_for_approval','T3'),
   'T2', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-06', 'Intent score ≥ 75 → notify assigned rep', 'lead.intent_crossed',
   jsonb_build_object('threshold',75),
   'notify_user',
   jsonb_build_object('audience','assigned_rep','severity','warm'),
   'T0', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-07', 'Deal → Negotiation → surface project pricing sheet', 'deal.state_changed',
   jsonb_build_object('to','negotiation'),
   'surface_on_canvas',
   jsonb_build_object('kind','pricing_sheet','title','Project pricing sheet'),
   'T0', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-08', 'Deal → Booked → hand off to PSCRM + Legal', 'deal.state_changed',
   jsonb_build_object('to','booked'),
   'flag_lead',
   jsonb_build_object('flag','handoff_pscrm','also_emit_event','deal.booked'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-09', 'Call objection: price → surface playbook', 'call.objection_detected',
   jsonb_build_object('objection','price'),
   'surface_on_canvas',
   jsonb_build_object('kind','playbook','title','Price-objection playbook'),
   'T0', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-10', 'Lead silent 14d + non-terminal → mark Stale + surface', 'lead.idle_threshold',
   jsonb_build_object('idle_hours',336),
   'flag_lead',
   jsonb_build_object('flag','stale','severity','medium'),
   'T0', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-11', 'CP submits lead → route to CP Coordinator', 'cp.lead_submitted',
   '{}'::jsonb,
   'notify_user',
   jsonb_build_object('audience','cp_coordinator','severity','info'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-12', 'Lead preference matches unit → surface match', 'lead.preference_matched',
   '{}'::jsonb,
   'surface_on_canvas',
   jsonb_build_object('kind','match','title','Matching unit'),
   'T0', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-13', 'Legal flag raised → pause deal + notify', 'legal.flag_raised',
   '{}'::jsonb,
   'flag_lead',
   jsonb_build_object('flag','legal_paused','severity','high'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-14', 'MIH lead with score > 80 → senior rep', 'mih.lead_pushed',
   jsonb_build_object('min_score',80),
   'notify_user',
   jsonb_build_object('audience','senior_rep','severity','high'),
   'T1', sys_uuid, sys_uuid, 'system', 'system'),

  (NULL, 'D-15', 'Walk-in source → attach showroom location', 'lead.created',
   jsonb_build_object('source','walkin'),
   'attach_node',
   jsonb_build_object('to_kind','showroom_location'),
   'T1', sys_uuid, sys_uuid, 'system', 'system')
ON CONFLICT DO NOTHING;

END $$;
