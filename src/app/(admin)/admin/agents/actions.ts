"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  AgentAdminError,
  provisionAgent,
  provisionInputSchema,
  setMaxTierOverride,
  setTierInputSchema,
  toggleAgent,
  toggleInputSchema,
} from "@/lib/agents/admin";

export type AgentsActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: "permission" | "validation" | "unknown";
      fieldErrors?: Record<string, string>;
      message?: string;
    };

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const stringOrUndef = (raw: FormDataEntryValue | null): string | undefined => {
  if (raw == null || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
};
const boolFromForm = (raw: FormDataEntryValue | null): boolean => {
  if (typeof raw !== "string") return false;
  return raw === "true" || raw === "on" || raw === "1";
};

export async function agentsAction(
  formData: FormData,
): Promise<AgentsActionResult<{ id?: string; agent_type?: string; enabled?: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  if (!perms.has("agents:provision")) {
    return { ok: false, error: "permission" };
  }
  const actor_role = user.profile.base_role;
  const intent = stringOrUndef(formData.get("intent"));

  try {
    switch (intent) {
      case "provision": {
        const parsed = provisionInputSchema.safeParse({
          agent_type: stringOrUndef(formData.get("agent_type")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await provisionAgent({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/agents");
        return { ok: true, data: r };
      }
      case "toggle": {
        const parsed = toggleInputSchema.safeParse({
          agent_type: stringOrUndef(formData.get("agent_type")),
          enabled: boolFromForm(formData.get("enabled")),
          suspended_reason: stringOrUndef(formData.get("suspended_reason")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await toggleAgent({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/agents");
        return { ok: true, data: r };
      }
      case "set_tier": {
        const rawOverride = stringOrUndef(formData.get("max_tier_override"));
        const parsed = setTierInputSchema.safeParse({
          agent_type: stringOrUndef(formData.get("agent_type")),
          max_tier_override:
            rawOverride === undefined || rawOverride === "none"
              ? null
              : rawOverride,
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await setMaxTierOverride({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/agents");
        return { ok: true, data: { agent_type: parsed.data.agent_type } };
      }
      default:
        return {
          ok: false,
          error: "validation",
          message: `Unknown intent: ${intent ?? "(missing)"}`,
        };
    }
  } catch (err) {
    if (err instanceof AgentAdminError) {
      return {
        ok: false,
        error: err.kind === "not_found" ? "validation" : "validation",
        message: err.message,
      };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function agentsFormAction(formData: FormData): Promise<void> {
  await agentsAction(formData);
}
