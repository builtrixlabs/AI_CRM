import { z } from "zod";
import { LEAD_SOURCES } from "@/lib/nodes/schemas/lead";
import { LEAD_STATES, type LeadState } from "./types";
import { TERMINAL_STATES } from "./transitions";

const phoneShape = z.string().min(7).max(40);

export const createLeadInputSchema = z
  .object({
    phone: phoneShape,
    source: z.enum(LEAD_SOURCES),
    email: z.string().email().optional(),
    notes: z.string().max(2000).optional(),
    label: z.string().min(1).max(120).optional(),
  })
  .strict();

export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;

export const updateLeadInputSchema = z
  .object({
    phone: phoneShape.optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    email: z.string().email().optional(),
    notes: z.string().max(2000).optional(),
    label: z.string().min(1).max(120).optional(),
  })
  .strict();

export type UpdateLeadInput = z.infer<typeof updateLeadInputSchema>;

const uuidV4 = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

export const transitionInputSchema = z
  .object({
    lead_id: uuidV4,
    target_state: z.enum(LEAD_STATES),
    reason: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const target = value.target_state as LeadState;
    if (TERMINAL_STATES.has(target)) {
      if (!value.reason || value.reason.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Reason is required for terminal transitions",
        });
      }
    }
  });

export type TransitionInput = z.infer<typeof transitionInputSchema>;
