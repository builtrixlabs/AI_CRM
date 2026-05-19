/**
 * D-611 — closed catalog of visual-workflow node kinds.
 *
 * 7 triggers + 7 actions per PRD-v6.0 §D-611. These are V6-scoped names
 * that map onto the existing DOE engine's (`src/lib/doe/types.ts`)
 * broader trigger/action enums; the visual builder restricts to this
 * subset and the `runCompiledDag` runtime path (deferred) dispatches
 * onto the existing engine primitives.
 */

import type { ActionKind, TriggerKind } from "./types";

export const TRIGGER_KINDS = [
  "whatsapp.inbound",
  "email.inbound",
  "lead.created",
  "call.next_best_action",
  "lead.state_changed",
  "manual.button_click",
  "schedule",
] as const satisfies readonly TriggerKind[];

export const ACTION_KINDS = [
  "send_template_message",
  "update_lead_field",
  "assign_to_user",
  "create_task",
  "send_brochure",
  "book_site_visit",
  "call_ai_gateway",
] as const satisfies readonly ActionKind[];

const TRIGGER_SET = new Set<string>(TRIGGER_KINDS);
const ACTION_SET = new Set<string>(ACTION_KINDS);

export function isTriggerKind(k: string): k is TriggerKind {
  return TRIGGER_SET.has(k);
}
export function isActionKind(k: string): k is ActionKind {
  return ACTION_SET.has(k);
}

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  "whatsapp.inbound": "WhatsApp inbound message",
  "email.inbound": "Email inbound",
  "lead.created": "Lead created",
  "call.next_best_action": "Call: next-best-action",
  "lead.state_changed": "Lead state changed",
  "manual.button_click": "Manual button click",
  schedule: "Schedule (cron)",
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  send_template_message: "Send templated message",
  update_lead_field: "Update lead field",
  assign_to_user: "Assign to user",
  create_task: "Create task",
  send_brochure: "Send brochure",
  book_site_visit: "Book site visit",
  call_ai_gateway: "Call AI gateway (custom prompt)",
};
