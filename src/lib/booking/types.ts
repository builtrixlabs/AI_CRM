/**
 * D-421 — booking pipeline domain types + server-action input schemas.
 *
 * Authority anchor: baseline/118-booking-pipeline-contract.md §5 (audit row).
 */

import { z } from "zod";
import { BOOKING_STAGES, type BookingStage } from "./stages";

export type StageTransition = {
  id: string;
  deal_id: string;
  organization_id: string;
  from_stage: BookingStage | null;
  to_stage: BookingStage;
  actor_user_id: string | null;
  actor_kind: "user" | "agent" | "system";
  triggered_by: string | null;
  evidence: Record<string, unknown>;
  idempotency_key: string;
  skip_reason: string | null;
  correction_reason: string | null;
  occurred_at: string;
};

export const transitionDealStageInputSchema = z.object({
  deal_id: z.string().uuid(),
  to_stage: z.enum(BOOKING_STAGES),
  evidence: z.record(z.string(), z.unknown()),
  skip_reason: z
    .enum(["cash_buyer", "fully_cashed"])
    .nullable()
    .optional()
    .default(null),
  correction_reason: z
    .string()
    .min(1)
    .max(500)
    .nullable()
    .optional()
    .default(null),
});

export type TransitionDealStageInput = z.infer<
  typeof transitionDealStageInputSchema
>;

export type TransitionDealStageResult =
  | { ok: true; transition_id: string }
  | {
      ok: false;
      error:
        | "permission"
        | "validation"
        | "invalid_transition"
        | "no_provenance"
        | "deal_not_found"
        | "not_a_deal"
        | "unknown";
      message?: string;
      fieldErrors?: Record<string, string>;
    };
