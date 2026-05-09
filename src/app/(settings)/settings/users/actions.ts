"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  changeBaseRole,
  deactivateUser,
  inviteUser,
} from "@/lib/users/admin";
import {
  changeRoleInputSchema,
  deactivateUserInputSchema,
  inviteUserInputSchema,
  UsersAdminError,
} from "@/lib/users/types";

export type UsersActionResult<T = void> =
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

export async function usersAction(
  formData: FormData,
): Promise<UsersActionResult<{ user_id?: string; from?: string; to?: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  if (!perms.has("settings:manage_users")) {
    return { ok: false, error: "permission" };
  }
  const actor_role = user.profile.base_role;
  const intent = stringOrUndef(formData.get("intent"));

  try {
    switch (intent) {
      case "invite": {
        const parsed = inviteUserInputSchema.safeParse({
          email: stringOrUndef(formData.get("email")),
          display_name: stringOrUndef(formData.get("display_name")),
          base_role: stringOrUndef(formData.get("base_role")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await inviteUser({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/settings/users");
        return { ok: true, data: { user_id: r.user_id } };
      }
      case "change_role": {
        const parsed = changeRoleInputSchema.safeParse({
          user_id: stringOrUndef(formData.get("user_id")),
          base_role: stringOrUndef(formData.get("base_role")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await changeBaseRole({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/settings/users");
        return { ok: true, data: { user_id: r.user_id, from: r.from, to: r.to } };
      }
      case "deactivate": {
        const parsed = deactivateUserInputSchema.safeParse({
          user_id: stringOrUndef(formData.get("user_id")),
          reason: stringOrUndef(formData.get("reason")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await deactivateUser({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/settings/users");
        return { ok: true, data: { user_id: r.user_id } };
      }
      default:
        return {
          ok: false,
          error: "validation",
          message: `Unknown intent: ${intent ?? "(missing)"}`,
        };
    }
  } catch (err) {
    if (err instanceof UsersAdminError) {
      // Cross-tenant + missing-row + self-target all collapse to validation
      // (no existence leak; consistent UX).
      if (
        err.kind === "not_found" ||
        err.kind === "self_target" ||
        err.kind === "platform_user" ||
        err.kind === "duplicate_email"
      ) {
        return { ok: false, error: "validation", message: err.message };
      }
      return { ok: false, error: "unknown", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function usersFormAction(formData: FormData): Promise<void> {
  await usersAction(formData);
}
