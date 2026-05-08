import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionKind, DirectiveRow, Trigger } from "../types";
import { surface_on_canvas } from "./surface_on_canvas";
import { flag_lead } from "./flag_lead";
import { send_template_message } from "./send_template_message";
import { notify_user } from "./notify_user";
import { attach_node } from "./attach_node";
import { enqueue_agent } from "./enqueue_agent";

export type ActionHandler = (
  directive: DirectiveRow,
  trigger: Trigger,
  client: SupabaseClient
) => Promise<Record<string, unknown>>;

export const ACTION_HANDLERS: Record<ActionKind, ActionHandler> = {
  surface_on_canvas,
  flag_lead,
  send_template_message,
  notify_user,
  attach_node,
  enqueue_agent,
};

export {
  surface_on_canvas,
  flag_lead,
  send_template_message,
  notify_user,
  attach_node,
  enqueue_agent,
};
