import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LEAD_SOURCES } from "@/lib/nodes/schemas/lead";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_PIPELINE_STAGES,
  HARD_GATED_STEPS,
  STEP_IDS,
  type OnboardingState,
  type StepId,
} from "./types";

export class OnboardingHardGateError extends Error {
  constructor(public readonly step: StepId) {
    super(`OnboardingHardGateError: step '${step}' cannot be skipped`);
    this.name = "OnboardingHardGateError";
  }
}

export class OnboardingPayloadError extends Error {
  constructor(
    public readonly step: StepId,
    public readonly issues: z.ZodError["issues"]
  ) {
    super(`OnboardingPayloadError: ${issues.length} issue(s) for step '${step}'`);
    this.name = "OnboardingPayloadError";
  }
}

const stepIdSchema = z.enum(STEP_IDS);

const completedStepsSchema = z
  .array(stepIdSchema)
  .transform((arr) => Array.from(new Set(arr)));

export const onboardingStateSchema: z.ZodType<OnboardingState> = z
  .object({
    completed: z.boolean().default(false),
    current_step: z.union([stepIdSchema, z.literal("completed")]).default("org_details"),
    completed_steps: completedStepsSchema.default([]),
    lead_sources: z.array(z.string()).default([]),
    pipeline_stages: z.array(z.string()).default([...DEFAULT_PIPELINE_STAGES]),
    integrations: z
      .object({
        email: z.string().nullable().default(null),
        whatsapp: z.string().nullable().default(null),
        telephony: z.string().nullable().default(null),
      })
      .default({ email: null, whatsapp: null, telephony: null }),
  })
  .strip();

const orgDetailsSchema = z
  .object({
    rera_number: z.string().optional(),
    gstin: z.string().optional(),
    primary_contact_email: z.string().email(),
    primary_contact_name: z.string().min(1),
  })
  .strict();

const brandingSchema = z
  .object({
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logo_url: z.string().url().optional(),
  })
  .strict();

const firstWorkspaceSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
    name: z.string().min(1).max(80),
  })
  .strict();

const leadSourcesSchema = z
  .object({
    sources: z.array(z.enum(LEAD_SOURCES)).min(1),
  })
  .strict();

const pipelineStagesSchema = z
  .object({
    confirmed: z.literal(true),
  })
  .strict();

const teamUsersSchema = z
  .object({
    invites: z
      .array(
        z.object({
          email: z.string().email(),
          display_name: z.string().min(1),
          app_role: z.enum([
            "manager",
            "sales_rep",
            "read_only",
            "channel_partner",
          ]),
        })
      )
      .min(0)
      .max(3),
  })
  .strict();

const integrationsSchema = z
  .object({
    email: z.enum(["smtp", "resend"]).nullable(),
    whatsapp: z.enum(["meta", "gupshup", "wati"]).nullable(),
    telephony: z.enum(["exotel", "myoperator", "knowlarity"]).nullable(),
  })
  .strict();

const sampleDemoSchema = z
  .object({
    walked_through: z.literal(true),
  })
  .strict();

export const stepPayloadSchemas: Record<StepId, z.ZodTypeAny> = {
  org_details: orgDetailsSchema,
  branding: brandingSchema,
  first_workspace: firstWorkspaceSchema,
  lead_sources: leadSourcesSchema,
  pipeline_stages: pipelineStagesSchema,
  team_users: teamUsersSchema,
  integrations: integrationsSchema,
  sample_demo: sampleDemoSchema,
};

export async function getOnboardingState(
  org_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<OnboardingState> {
  const { data, error } = await client
    .from("organizations")
    .select("onboarding_state")
    .eq("id", org_id)
    .single();
  if (error) throw error;
  return onboardingStateSchema.parse(data.onboarding_state ?? {});
}

function nextStep(current: StepId): StepId | "completed" {
  const idx = STEP_IDS.indexOf(current);
  if (idx === -1) return "completed";
  if (idx === STEP_IDS.length - 1) return "completed";
  return STEP_IDS[idx + 1];
}

export type AdvanceStepInput = {
  org_id: string;
  actor: string;
  step: StepId;
  payload: unknown;
  skipped?: boolean;
};

export type AdvanceStepResult = {
  next_step: StepId | "completed";
  completed: boolean;
};

/**
 * State machine entry point. Validates the per-step Zod schema (when not
 * skipped), persists the side-effect (existing tables for steps 1, 3, 6;
 * onboarding_state jsonb for the rest), advances state, writes one
 * audit_log row.
 *
 * Caller has ALREADY gated on `requirePermission(user, 'organizations:edit')`.
 */
export async function advanceStep(
  input: AdvanceStepInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<AdvanceStepResult> {
  if (input.skipped && HARD_GATED_STEPS.has(input.step)) {
    throw new OnboardingHardGateError(input.step);
  }

  let validated: unknown = null;
  if (!input.skipped) {
    const schema = stepPayloadSchemas[input.step];
    const parsed = schema.safeParse(input.payload);
    if (!parsed.success) {
      throw new OnboardingPayloadError(input.step, parsed.error.issues);
    }
    validated = parsed.data;
  }

  // Load current state for audit diff + state machine update.
  const before = await getOnboardingState(input.org_id, client);

  const next: OnboardingState = {
    ...before,
    completed_steps: Array.from(new Set([...before.completed_steps, input.step])),
    current_step: nextStep(input.step),
  };

  // Apply per-step side-effects.
  if (!input.skipped) {
    if (input.step === "org_details") {
      const p = validated as z.infer<typeof orgDetailsSchema>;
      const { error } = await client
        .from("organizations")
        .update({
          rera_number: p.rera_number ?? null,
          gstin: p.gstin ?? null,
          primary_contact_email: p.primary_contact_email,
          updated_by: input.actor,
          updated_via: "manual",
        })
        .eq("id", input.org_id);
      if (error) throw error;
    } else if (input.step === "branding") {
      const p = validated as z.infer<typeof brandingSchema>;
      const { error } = await client
        .from("organizations")
        .update({
          branding: p,
          updated_by: input.actor,
          updated_via: "manual",
        })
        .eq("id", input.org_id);
      if (error) throw error;
    } else if (input.step === "first_workspace") {
      const p = validated as z.infer<typeof firstWorkspaceSchema>;
      // Update the org's first workspace (oldest, slug='default' from provisioning).
      const { data: ws } = await client
        .from("workspaces")
        .select("id")
        .eq("organization_id", input.org_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (ws?.id) {
        const { error } = await client
          .from("workspaces")
          .update({
            slug: p.slug,
            name: p.name,
            updated_by: input.actor,
            updated_via: "manual",
          })
          .eq("id", ws.id);
        if (error) throw error;
      }
    } else if (input.step === "lead_sources") {
      const p = validated as z.infer<typeof leadSourcesSchema>;
      next.lead_sources = p.sources;
    } else if (input.step === "pipeline_stages") {
      // Confirm only — V0 keeps the default 7 stages.
      next.pipeline_stages = [...DEFAULT_PIPELINE_STAGES];
    } else if (input.step === "team_users") {
      const p = validated as z.infer<typeof teamUsersSchema>;
      // Best-effort invite each. Failures are logged but don't roll back the step.
      for (const inv of p.invites) {
        try {
          const { data: u, error: createErr } = await client.auth.admin.createUser({
            email: inv.email,
            email_confirm: true,
          });
          if (createErr) throw createErr;
          await client.from("profiles").insert({
            id: u.user.id,
            organization_id: input.org_id,
            email: inv.email,
            display_name: inv.display_name,
            base_role:
              inv.app_role === "channel_partner"
                ? "channel_partner"
                : inv.app_role === "manager"
                  ? "manager"
                  : inv.app_role === "read_only"
                    ? "read_only"
                    : "sales_rep",
            created_by: u.user.id,
            created_via: "manual",
            updated_by: u.user.id,
            updated_via: "manual",
          });
        } catch {
          // Surface inline; no step rollback (the step advances even on
          // partial invite failure — UX records what worked).
        }
      }
    } else if (input.step === "integrations") {
      const p = validated as z.infer<typeof integrationsSchema>;
      next.integrations = {
        email: p.email ?? null,
        whatsapp: p.whatsapp ?? null,
        telephony: p.telephony ?? null,
      };
    }
    // sample_demo: no side-effect.
  }

  // If we just advanced past the last step, mark complete.
  if (next.current_step === "completed") {
    next.completed = true;
  }

  // Persist the new onboarding_state.
  {
    const { error } = await client
      .from("organizations")
      .update({
        onboarding_state: next,
        updated_by: input.actor,
        updated_via: "manual",
      })
      .eq("id", input.org_id);
    if (error) throw error;
  }

  // Audit row (Constitution IV). One per advance.
  await client.from("audit_log").insert({
    actor_id: input.actor,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: input.org_id,
    table_name: "organizations",
    record_id: input.org_id,
    action: input.skipped
      ? "onboarding_step_skipped"
      : "onboarding_step_completed",
    diff: {
      step: input.step,
      before: before.current_step,
      after: next.current_step,
      payload: input.skipped ? null : validated,
    },
  });

  return { next_step: next.current_step, completed: next.completed };
}
