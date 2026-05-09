import { z } from "zod";
import type { ActionKind, TriggerKind } from "./types";

/**
 * Client-safe constants and Zod schemas for D-017 authoring.
 *
 * Split from `authoring.ts` because the Server-only helpers in that
 * module pull in `getSupabaseAdmin`, which throws when imported from a
 * client bundle (`rsc-server-only-vs-client-safe-split` pattern).
 */

const TRIGGER_KINDS = [
  "lead.created",
  "lead.state_changed",
  "lead.idle_threshold",
  "lead.intent_crossed",
  "lead.preference_matched",
  "site_visit.window",
  "site_visit.state_changed",
  "deal.state_changed",
  "cp.lead_submitted",
  "mih.lead_pushed",
  "legal.flag_raised",
  "call.objection_detected",
] as const satisfies readonly TriggerKind[];

const ACTION_KINDS = [
  "enqueue_agent",
  "surface_on_canvas",
  "flag_lead",
  "send_template_message",
  "notify_user",
  "attach_node",
] as const satisfies readonly ActionKind[];

const TIER_VALUES = ["T0", "T1", "T2", "T3", "T4"] as const;

export const TRIGGER_KIND_OPTIONS = TRIGGER_KINDS;
export const ACTION_KIND_OPTIONS = ACTION_KINDS;
export const TIER_OPTIONS = TIER_VALUES;

/**
 * Default tier per action_kind. T3+ stamps `pending_approval` at runtime
 * (per `tier-3-stops-runtime-pending-approval`), so the form can let an
 * operator pick T3 with a clear UX warning, but the default is the
 * "intended" tier per the action's nature.
 */
export function defaultTierForAction(
  kind: ActionKind,
): (typeof TIER_VALUES)[number] {
  switch (kind) {
    case "surface_on_canvas":
    case "notify_user":
      return "T0";
    case "flag_lead":
    case "attach_node":
      return "T1";
    case "send_template_message":
      return "T2";
    case "enqueue_agent":
      return "T1";
  }
}

export const createDirectiveInputSchema = z
  .object({
    display_name: z.string().min(1).max(80),
    trigger_kind: z.enum(TRIGGER_KINDS),
    trigger_config: z.record(z.string(), z.unknown()).default({}),
    action_kind: z.enum(ACTION_KINDS),
    action_config: z.record(z.string(), z.unknown()).default({}),
    tier: z.enum(TIER_VALUES).optional(),
    enabled: z.boolean().default(true),
  })
  .strict();

export type CreateDirectiveInput = z.infer<typeof createDirectiveInputSchema>;

export const toggleDirectiveInputSchema = z
  .object({
    code: z.string().min(1).max(40),
    enabled: z.boolean(),
  })
  .strict();

export type ToggleDirectiveInput = z.infer<typeof toggleDirectiveInputSchema>;

export class DirectiveAuthoringError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_found" | "conflict" | "invalid",
  ) {
    super(message);
    this.name = "DirectiveAuthoringError";
  }
}
